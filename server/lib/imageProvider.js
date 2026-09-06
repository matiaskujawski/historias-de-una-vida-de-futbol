const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { generarSvgPlaceholder } = require("./svgPlaceholder");

const OUTPUT_ROOT = path.join(__dirname, "..", "..", "output");
const CACHE_DIR = path.join(OUTPUT_ROOT, "cache", "personajes");

// Render define automáticamente RENDER_EXTERNAL_URL con la URL pública del
// servicio. En local, sin esa variable, cae a localhost — que fal.ai no
// puede alcanzar (ver limitación documentada en el README).
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

const MODO = process.env.FAL_KEY ? "fal" : "placeholder";

fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashDe(texto) {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

function urlPublicaDeArchivo(rutaAbsoluta) {
  const relativa = path.relative(OUTPUT_ROOT, rutaAbsoluta).split(path.sep).join("/");
  return `${BASE_URL}/media/${relativa}`;
}

function archivoExistente(dir, base) {
  if (!fs.existsSync(dir)) return null;
  const encontrado = fs.readdirSync(dir).find((f) => f === `${base}.svg` || f.startsWith(`${base}.`));
  return encontrado ? path.join(dir, encontrado) : null;
}

async function descargarA(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen generada (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

function extensionDesde(contentType, url) {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  const m = /\.(png|jpe?g|webp)(\?|$)/i.exec(url || "");
  return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
}

/**
 * Llama a fal.ai. Si `imagenReferenciaUrl` viene con una URL pública,
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
  const img = data.images?.[0];
  if (!img?.url) throw new Error("fal.ai no devolvió ninguna imagen.");
  return img;
}

/**
 * Genera (o reusa si ya existe) la imagen de una página o tapa del libro.
 * `dir` + `base` identifican el archivo sin extensión (la extensión la
 * decide el proveedor: .svg en modo placeholder, .jpg/.png en modo fal).
 * Devuelve la ruta completa del archivo final.
 */
async function generarImagen({ prompt, colores, dir, base, imagenReferenciaUrl, etiqueta }) {
  fs.mkdirSync(dir, { recursive: true });

  const existente = archivoExistente(dir, base);
  if (existente) return existente; // ya generada — no volver a pagar/generar

  if (MODO === "fal") {
    const img = await generarConFal({ prompt, imagenReferenciaUrl });
    const ext = extensionDesde(img.content_type, img.url);
    const outPath = path.join(dir, `${base}${ext}`);
    await descargarA(img.url, outPath);
    return outPath;
  }

  // Modo placeholder: SVG puro, sin ninguna dependencia externa, para que
  // el flujo completo funcione en cualquier hosting sin instalar nada más.
  const [primario, secundario] = colores && colores.length ? colores : ["#1c8a43", "#ffffff"];
  const svg = generarSvgPlaceholder({ texto: etiqueta, primario, secundario });
  const outPath = path.join(dir, `${base}.svg`);
  fs.writeFileSync(outPath, svg, "utf-8");
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

  const base = hashDe(`${personaje.nombre}::${personaje.descripcion_fisica || ""}::${personaje.tipo || ""}`);
  const prompt = `Retrato de referencia estilo caricatura cálida de ${personaje.nombre} (${personaje.tipo}), ${personaje.descripcion_fisica || "rasgos cálidos y expresivos, a inventar de forma coherente"}. Fondo neutro, solo el personaje.`;

  const rutaLocal = await generarImagen({ prompt, colores: ["#cccccc", "#ffffff"], dir: CACHE_DIR, base, etiqueta: personaje.nombre });
  return urlPublicaDeArchivo(rutaLocal);
}

module.exports = { generarImagen, obtenerReferenciaPersonaje, MODO };
