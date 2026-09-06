const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { generarGuionLibro } = require("./claudeClient");
const { generarImagen, obtenerReferenciaPersonaje } = require("./imageProvider");
const { obtenerClubPorId } = require("./clubsData");

const JOBS_DIR = path.join(__dirname, "..", "..", "output", "jobs");
const LIBROS_DIR = path.join(__dirname, "..", "..", "output", "libros");

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(LIBROS_DIR, { recursive: true });

function rutaJob(id) {
  return path.join(JOBS_DIR, `${id}.json`);
}

function leerJob(id) {
  const ruta = rutaJob(id);
  if (!fs.existsSync(ruta)) return null;
  return JSON.parse(fs.readFileSync(ruta, "utf-8"));
}

function guardarJob(job) {
  fs.writeFileSync(rutaJob(job.id), JSON.stringify(job, null, 2));
}

function crearJob({ club_id, personajes, relato, destinatario }) {
  const club = obtenerClubPorId(club_id);
  if (!club) throw new Error(`Club desconocido: ${club_id}`);
  if (!Array.isArray(personajes) || personajes.length === 0) {
    throw new Error("Hace falta al menos un personaje.");
  }
  if (!relato || !relato.trim()) {
    throw new Error("Hace falta contar la historia de pertenencia.");
  }

  const id = crypto.randomBytes(8).toString("hex");
  const job = {
    id,
    status: "pendiente",
    paso: "en cola",
    club,
    personajes,
    relato,
    destinatario: destinatario || null,
    totalPaginas: null,
    paginasListas: 0,
    error: null,
    creadoEn: new Date().toISOString(),
  };
  guardarJob(job);
  fs.mkdirSync(path.join(LIBROS_DIR, id), { recursive: true });
  return job;
}

async function correrRender(id) {
  const job = leerJob(id);
  if (!job) throw new Error(`Job ${id} no existe`);

  try {
    if (!job.guion) {
      job.status = "generando_guion";
      job.paso = "El Cronista está armando tu historia...";
      guardarJob(job);

      job.guion = await generarGuionLibro({
        club: job.club,
        personajes: job.personajes,
        relato: job.relato,
        destinatario: job.destinatario,
      });
      job.totalPaginas = job.guion.paginas.length;
      guardarJob(job);
    }

    job.status = "generando_imagenes";
    guardarJob(job);

    const libroDir = path.join(LIBROS_DIR, id);
    fs.mkdirSync(libroDir, { recursive: true });

    // Referencias visuales de cada personaje. Solo cuestan algo (y solo se
    // usan) cuando el personaje tiene una foto real subida por el usuario
    // — ver la explicación de costo en imageProvider.obtenerReferenciaPersonaje.
    const referencias = {};
    for (const p of job.personajes) {
      referencias[p.nombre] = await obtenerReferenciaPersonaje(p);
    }
    function imagenReferenciaPara(nombresEnEscena) {
      const nombre = (nombresEnEscena || []).find((n) => referencias[n]?.esFotoReal);
      return nombre ? referencias[nombre].url : undefined;
    }

    // Tapa
    job.imagenes = job.imagenes || {};
    if (!job.imagenes.tapa) {
      job.paso = "Dibujando la tapa del libro...";
      guardarJob(job);
      const rutaTapa = await generarImagen({
        prompt: job.guion.tapa.descripcion_visual,
        colores: job.club.colores,
        dir: libroDir,
        base: "tapa",
        imagenReferenciaUrl: imagenReferenciaPara(job.guion.personajes_en_libro),
        etiqueta: job.guion.tapa.texto,
      });
      job.imagenes.tapa = path.basename(rutaTapa);
      guardarJob(job);
    }

    // Páginas
    for (const pagina of job.guion.paginas) {
      const clave = `pagina-${pagina.numero}`;
      if (!job.imagenes[clave]) {
        job.paso = `Ilustrando la página ${pagina.numero} de ${job.totalPaginas}...`;
        guardarJob(job);
        const rutaPagina = await generarImagen({
          prompt: pagina.descripcion_visual,
          colores: job.club.colores,
          dir: libroDir,
          base: clave,
          imagenReferenciaUrl: imagenReferenciaPara(pagina.personajes_en_pagina),
          etiqueta: pagina.texto,
        });
        job.imagenes[clave] = path.basename(rutaPagina);
      }
      job.paginasListas = pagina.numero;
      guardarJob(job);
    }

    // Arma el libro final (lo que consume el visor)
    const libro = {
      id,
      titulo: job.guion.titulo,
      club: job.club,
      destinatario: job.destinatario,
      resumen: job.guion.resumen,
      tapa: { texto: job.guion.tapa.texto, imagen: `/media/libros/${id}/${job.imagenes.tapa}` },
      paginas: job.guion.paginas.map((p) => ({
        numero: p.numero,
        texto: p.texto,
        imagen: `/media/libros/${id}/${job.imagenes[`pagina-${p.numero}`]}`,
      })),
      creadoEn: job.creadoEn,
    };
    fs.writeFileSync(path.join(libroDir, "libro.json"), JSON.stringify(libro, null, 2));

    job.status = "listo";
    job.paso = "¡Tu libro está listo!";
    guardarJob(job);
  } catch (err) {
    job.status = "error";
    job.error = err.message || String(err);
    job.paso = "Hubo un problema generando el libro.";
    guardarJob(job);
    throw err;
  }
}

function iniciarRenderEnBackground(id) {
  correrRender(id).catch((err) => {
    console.error(`[job ${id}] error:`, err.message);
  });
}

function obtenerEstado(id) {
  const job = leerJob(id);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    paso: job.paso,
    totalPaginas: job.totalPaginas,
    paginasListas: job.paginasListas,
    error: job.error,
  };
}

function obtenerLibro(id) {
  const ruta = path.join(LIBROS_DIR, id, "libro.json");
  if (!fs.existsSync(ruta)) return null;
  return JSON.parse(fs.readFileSync(ruta, "utf-8"));
}

/**
 * Para cuando "el sistema se cuelga": si el proceso del servidor se cae o
 * se reinicia mientras un libro se estaba generando, el job queda a mitad
 * de camino en disco (ni "listo" ni "error"). Al arrancar de nuevo, esta
 * función los detecta y los retoma automáticamente — gracias a que cada
 * imagen y el guion se cachean en disco (ver correrRender), retomar NUNCA
 * vuelve a pagar por un paso que ya se había generado antes de la caída.
 *
 * Ojo: esto solo ayuda si el disco sobrevive al reinicio (un crash del
 * proceso de Node, por ejemplo). Si el hosting usa disco efímero y hace
 * un redeploy completo o el servicio estuvo dormido y arranca en un
 * contenedor nuevo (típico del plan free de Render), los archivos en
 * disco se pierden igual y no hay nada que retomar — ver README.
 */
function reanudarJobsInterrumpidos() {
  if (!fs.existsSync(JOBS_DIR)) return;
  const interrumpidos = fs
    .readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leerJob(f.replace(/\.json$/, "")))
    .filter((job) => job && !["listo", "error"].includes(job.status));

  for (const job of interrumpidos) {
    console.log(`[job ${job.id}] retomando tras un reinicio (estaba en "${job.status}")`);
    iniciarRenderEnBackground(job.id);
  }
}

function listarLibros() {
  return fs
    .readdirSync(LIBROS_DIR)
    .filter((nombre) => fs.existsSync(path.join(LIBROS_DIR, nombre, "libro.json")))
    .map((nombre) => {
      const libro = JSON.parse(fs.readFileSync(path.join(LIBROS_DIR, nombre, "libro.json"), "utf-8"));
      return {
        id: libro.id,
        titulo: libro.titulo,
        club: libro.club.nombre,
        tapa: libro.tapa.imagen,
        creadoEn: libro.creadoEn,
      };
    })
    .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
}

module.exports = {
  crearJob,
  iniciarRenderEnBackground,
  correrRender,
  reanudarJobsInterrumpidos,
  obtenerEstado,
  obtenerLibro,
  listarLibros,
};
