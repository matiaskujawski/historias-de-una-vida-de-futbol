const fs = require("fs");
const path = require("path");

const { generarSvgPlaceholder } = require("./svgPlaceholder");

const MODO = process.env.FAL_KEY ? "fal" : "placeholder";

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
 * Devuelve la referencia visual de un personaje, y si esa referencia es
 * una FOTO REAL subida por el usuario (la única situación en la que vale
 * la pena pagar el modelo caro imagen->imagen para que la caricatura se
 * "inspire" en ella de verdad).
 *
 * Optimización de costo clave: fal-ai/flux-pro/kontext (imagen->imagen)
 * cuesta ~$0.04 por imagen, contra ~$0.003 de fal-ai/flux/schnell
 * (texto->imagen) — más de 10 veces más caro. Antes esta función generaba
 * una imagen de referencia (con schnell) para CUALQUIER personaje sin
 * foto, y esa referencia se volvía a usar como "imagenReferenciaUrl" en
 * cada página donde aparecía, lo cual terminaba disparando kontext en
 * casi todas las páginas del libro sin necesidad real. Ahora: si no hay
 * foto real, no se genera ninguna imagen de referencia (ahorra ese costo
 * también) y las páginas de ese personaje se generan con schnell directo
 * — la consistencia la da el tag de texto @Nombre (rasgos) que se repite
 * en cada página (ver prompts/story-architect.system.md, regla 6), no una
 * imagen. kontext se reserva exclusivamente para cuando el usuario mismo
 * subió una foto.
 */
async function obtenerReferenciaPersonaje(personaje) {
  if (personaje.foto_url) {
    return { url: personaje.foto_url, esFotoReal: true };
  }
  return { url: null, esFotoReal: false };
}

module.exports = { generarImagen, obtenerReferenciaPersonaje, MODO };
