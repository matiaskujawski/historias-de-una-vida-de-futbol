/**
 * Genera una imagen placeholder como SVG puro (sin dependencias externas:
 * ni Python, ni Pillow, ni ninguna librería nativa). Esto es clave para
 * que el modo placeholder funcione en cualquier hosting (como Render) sin
 * tener que instalar nada más que `npm install`.
 */
const ANCHO = 1200;
const ALTO = 800;

function hexARgb(hex) {
  const limpio = (hex || "#1c8a43").replace("#", "");
  const valido = /^[0-9a-fA-F]{6}$/.test(limpio) ? limpio : "1c8a43";
  return {
    r: parseInt(valido.slice(0, 2), 16),
    g: parseInt(valido.slice(2, 4), 16),
    b: parseInt(valido.slice(4, 6), 16),
  };
}

function colorContraste({ r, g, b }) {
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#141414" : "#ffffff";
}

function envolverTexto(texto, maxCaracteres) {
  const palabras = String(texto || "").trim().split(/\s+/);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > maxCaracteres && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 6);
}

function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function generarSvgPlaceholder({ texto, primario, secundario }) {
  const rgbPrimario = hexARgb(primario);
  const colorTexto = colorContraste(rgbPrimario);
  const secundarioHex = /^#?[0-9a-fA-F]{6}$/.test(secundario || "") ? secundario : "#ffffff";

  const lineas = envolverTexto(texto || "Historias de una vida de fútbol", 42);
  const alturaLinea = 50;
  const yInicial = ALTO - 60 - lineas.length * alturaLinea;

  const tspans = lineas
    .map((linea, i) => `<tspan x="60" y="${yInicial + i * alturaLinea}">${escaparXml(linea)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <rect width="${ANCHO}" height="${ALTO}" fill="${primario}" />
  <polygon points="0,${ALTO} ${ANCHO * 0.55},${ALTO} ${ANCHO * 0.85},0 ${ANCHO * 0.55},0" fill="${secundarioHex}" />
  <circle cx="${ANCHO - 110}" cy="110" r="60" fill="#ffffff" stroke="#141414" stroke-width="4" />
  <text x="20" y="40" font-family="sans-serif" font-size="20" fill="${colorTexto}">MODO PLACEHOLDER — configurá FAL_KEY para imágenes reales</text>
  <text font-family="sans-serif" font-size="40" font-weight="bold" fill="${colorTexto}">${tspans}</text>
</svg>`;
}

module.exports = { generarSvgPlaceholder };
