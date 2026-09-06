const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const CACHE_DIR = path.join(__dirname, "..", "..", "output", "cache", "personajes");
const PLACEHOLDER_SCRIPT = path.join(__dirname, "..", "..", "scripts", "generate_placeholder_image.py");

const MODO = process.env.FAL_KEY ? "fal" : "placeholder";

fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashDe(texto) {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

function ejecutarPlaceholder(args) {
  return new Promise((resolve, reject) => {
    execFile("python3", [PLACEHOLDER_SCRIPT, ...args], (err, stdout, stderr) => {
      if (err) return reject(new Error(`generate_placeholder_image.py falló: ${stderr || err.message}`));
      resolve(stdout.trim());
    });
  });
}

async function descargarA(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen generada (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

/**
 * Llama a fal.ai. Si `imagenReferencia` viene con una URL/ruta pública,
 * usa el modelo imagen->imagen (flux-pro/kontext) para mantener
 * consistencia del personaje; si no, genera desde texto (flux/schnell).
 *
 * OJO: la forma exacta de los parámetros de fal.ai puede cambiar — antes
 * de usar esto en serio, comparar contra la documentación vigente del
 * modelo en fal.ai/models.
 */
async function generarConFal({ prompt, imagenReferenciaUrl }) {
  const modelo = imagenReferenciaUrl ? "fal-ai/flux-pro/kontext" : "fal-ai/flux/schnell";
  const body = imagenReferenciaUrl
    ? { prompt, image_url: imagenReferenciaUrl }
    : { prompt, image_size: "landscape_4_3", num_images: 1 };

  const res = await fetch(`https://fal.run/${modelo}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Key ${process.env.FAL_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`Error de fal.ai (${res.status}): ${detalle}`);
  }

  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("fal.ai no devolvió ninguna imagen.");
  return url;
}

/**
 * Genera (o reusa si ya existe) la imagen de una página o tapa del libro.
 * `outPath` es el archivo final (png/jpg) donde tiene que quedar guardada.
 */
async function generarImagen({ prompt, colores, outPath, imagenReferenciaUrl, etiqueta }) {
  if (fs.existsSync(outPath)) {
    return outPath; // ya generada — no volver a pagar/generar
  }

  if (MODO === "fal") {
    const url = await generarConFal({ prompt, imagenReferenciaUrl });
    await descargarA(url, outPath);
    return outPath;
  }

  // Modo placeholder: dibuja un rectángulo con los colores del club y el
  // texto de la página, para poder probar todo el flujo sin API keys.
  const [primario, secundario] = colores && colores.length ? colores : ["#1c8a43", "#ffffff"];
  await ejecutarPlaceholder([outPath, etiqueta || "", primario, secundario]);
  return outPath;
}

/**
 * Devuelve la ruta/URL a usar como referencia visual de un personaje para
 * mantener su aspecto consistente entre páginas:
 *  - si el usuario subió una foto, se usa esa foto directo (inspiración
 *    de rasgos, nunca reproducción textual — eso lo maneja el prompt).
 *  - si no subió foto, se genera una imagen de referencia una sola vez
 *    (cacheada por nombre+descripción) y se reusa en todas las páginas.
 */
async function obtenerReferenciaPersonaje(personaje) {
  if (personaje.foto_url) {
    return personaje.foto_url;
  }

  const clave = hashDe(`${personaje.nombre}::${personaje.descripcion_fisica || ""}::${personaje.tipo || ""}`);
  const outPath = path.join(CACHE_DIR, `${clave}.png`);

  if (!fs.existsSync(outPath)) {
    const prompt = `Retrato de referencia estilo caricatura cálida de ${personaje.nombre} (${personaje.tipo}), ${personaje.descripcion_fisica || "rasgos cálidos y expresivos, a inventar de forma coherente"}. Fondo neutro, solo el personaje.`;
    await generarImagen({ prompt, colores: ["#cccccc", "#ffffff"], outPath, etiqueta: personaje.nombre });
  }

  return outPath;
}

module.exports = { generarImagen, obtenerReferenciaPersonaje, MODO };
