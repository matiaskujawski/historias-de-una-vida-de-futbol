require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { listarClubes, buscarClubes } = require("./lib/clubsData");
const jobs = require("./lib/jobs");

const app = express();
const PORT = process.env.PORT || 3000;

const OUTPUT_DIR = path.join(__dirname, "..", "output");
const UPLOADS_DIR = path.join(OUTPUT_DIR, "uploads");
const LIBROS_DIR = path.join(OUTPUT_DIR, "libros");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(LIBROS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Frontend estático (sin build step)
app.use(express.static(path.join(__dirname, "..", "web")));

// Archivos generados: fotos de referencia, imágenes de los libros y el
// caché de referencias de personajes, todo bajo output/ servido en /media.
app.use("/media", express.static(OUTPUT_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// --- Clubes -----------------------------------------------------------

app.get("/api/clubes", (req, res) => {
  const { q } = req.query;
  res.json(q ? buscarClubes(q) : listarClubes());
});

// --- Personajes (foto de referencia) -----------------------------------

app.post("/api/personajes/foto", upload.single("foto"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna foto." });
  res.json({ foto_url: `/media/uploads/${req.file.filename}` });
});

// --- Libro: crear + generar ---------------------------------------------

app.post("/api/libro", (req, res) => {
  try {
    const { club_id, personajes, relato, destinatario } = req.body;
    // Las fotos llegan como URL relativa (/media/uploads/...); para
    // proveedores de imagen que necesiten una URL pública real (fal.ai en
    // producción), conviene resolverla a la URL absoluta del sitio acá.
    const personajesConUrlAbsoluta = (personajes || []).map((p) => ({
      ...p,
      foto_url: p.foto_url ? new URL(p.foto_url, `${req.protocol}://${req.get("host")}`).toString() : null,
    }));

    const job = jobs.crearJob({ club_id, personajes: personajesConUrlAbsoluta, relato, destinatario });
    jobs.iniciarRenderEnBackground(job.id);
    res.status(201).json({ libro_id: job.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/libro/:id/estado", (req, res) => {
  const estado = jobs.obtenerEstado(req.params.id);
  if (!estado) return res.status(404).json({ error: "No existe ese libro." });
  res.json(estado);
});

app.post("/api/libro/:id/reintentar", (req, res) => {
  const estado = jobs.obtenerEstado(req.params.id);
  if (!estado) return res.status(404).json({ error: "No existe ese libro." });
  jobs.iniciarRenderEnBackground(req.params.id);
  res.json({ ok: true });
});

app.get("/api/libro/:id", (req, res) => {
  const libro = jobs.obtenerLibro(req.params.id);
  if (!libro) return res.status(404).json({ error: "Ese libro todavía no está listo." });
  res.json(libro);
});

app.get("/api/libros", (req, res) => {
  res.json(jobs.listarLibros());
});

app.listen(PORT, () => {
  console.log(`⚽ Historias de una vida de fútbol — escuchando en http://localhost:${PORT}`);
  console.log(`   Modo imágenes: ${process.env.FAL_KEY ? "fal.ai" : "placeholder (sin FAL_KEY)"}`);
  console.log(`   Modo guion: ${process.env.ANTHROPIC_API_KEY ? "Claude" : "placeholder (sin ANTHROPIC_API_KEY)"}`);
});
