#!/usr/bin/env node
/**
 * Smoke test end-to-end SIN necesitar ANTHROPIC_API_KEY ni FAL_KEY: usa
 * los modos "placeholder" de claudeClient.js e imageProvider.js para
 * validar que todo el pipeline (guion -> tapa -> páginas -> libro.json)
 * funciona de punta a punta.
 *
 * Uso: npm run test:render
 */
const fs = require("fs");
const path = require("path");

const jobs = require("../server/lib/jobs");

async function main() {
  const job = jobs.crearJob({
    club_id: "river-plate",
    personajes: [
      { nombre: "Abuelo Tito", vinculo: "mi abuelo", tipo: "familiar", descripcion_fisica: "señor mayor, boina gris, bigote blanco" },
      { nombre: "Toto", vinculo: "mi perro", tipo: "mascota", descripcion_fisica: "perro salchicha marrón" },
    ],
    relato: "Mi abuelo me llevó por primera vez a la cancha cuando tenía 6 años, y desde entonces cada domingo escuchamos los partidos juntos en la radio, hasta con Toto durmiendo a nuestros pies.",
    destinatario: "para mi abuelo, que ya no puede ir a la cancha",
  });

  console.log(`Job creado: ${job.id}`);
  await jobs.correrRender(job.id);

  const libro = jobs.obtenerLibro(job.id);
  if (!libro) throw new Error("No se generó libro.json");

  const cantidadPaginas = libro.paginas.length;
  if (cantidadPaginas < 7 || cantidadPaginas > 10) {
    throw new Error(`Cantidad de páginas fuera de rango: ${cantidadPaginas}`);
  }

  const dirLibro = path.join(__dirname, "..", "output", "libros", job.id);
  const archivosEsperados = ["tapa.png", ...libro.paginas.map((p) => `pagina-${p.numero}.png`)];
  for (const archivo of archivosEsperados) {
    if (!fs.existsSync(path.join(dirLibro, archivo))) {
      throw new Error(`Falta el archivo esperado: ${archivo}`);
    }
  }

  console.log(`✔ Libro generado con ${cantidadPaginas} páginas + tapa.`);
  console.log(`✔ Archivos de imagen verificados en: ${dirLibro}`);
  console.log(`✔ Título: "${libro.titulo}"`);
  console.log("Smoke test OK.");
}

main().catch((err) => {
  console.error("✘ Smoke test falló:", err);
  process.exit(1);
});
