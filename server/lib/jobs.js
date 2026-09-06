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

    // Referencias visuales de cada personaje (se resuelven/cachean una sola vez).
    const referencias = {};
    for (const p of job.personajes) {
      job.paso = `Preparando la referencia de ${p.nombre}...`;
      guardarJob(job);
      referencias[p.nombre] = await obtenerReferenciaPersonaje(p);
    }

    // Tapa
    if (!job.tapaLista) {
      job.paso = "Dibujando la tapa del libro...";
      guardarJob(job);
      const outTapa = path.join(libroDir, "tapa.png");
      const personajePrincipal = job.guion.personajes_en_libro?.[0];
      await generarImagen({
        prompt: job.guion.tapa.descripcion_visual,
        colores: job.club.colores,
        outPath: outTapa,
        imagenReferenciaUrl: personajePrincipal ? referencias[personajePrincipal] : undefined,
        etiqueta: job.guion.tapa.texto,
      });
      job.tapaLista = true;
      guardarJob(job);
    }

    // Páginas
    for (const pagina of job.guion.paginas) {
      const outPagina = path.join(libroDir, `pagina-${pagina.numero}.png`);
      if (!fs.existsSync(outPagina)) {
        job.paso = `Ilustrando la página ${pagina.numero} de ${job.totalPaginas}...`;
        guardarJob(job);
        const primerPersonaje = pagina.personajes_en_pagina?.[0];
        await generarImagen({
          prompt: pagina.descripcion_visual,
          colores: job.club.colores,
          outPath: outPagina,
          imagenReferenciaUrl: primerPersonaje ? referencias[primerPersonaje] : undefined,
          etiqueta: pagina.texto,
        });
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
      tapa: { texto: job.guion.tapa.texto, imagen: `/media/libros/${id}/tapa.png` },
      paginas: job.guion.paginas.map((p) => ({
        numero: p.numero,
        texto: p.texto,
        imagen: `/media/libros/${id}/pagina-${p.numero}.png`,
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
  obtenerEstado,
  obtenerLibro,
  listarLibros,
};
