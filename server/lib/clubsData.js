const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "..", "data", "clubes-argentina.json");

let cache = null;

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cargarClubes() {
  if (!cache) {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    cache = JSON.parse(raw);
  }
  return cache;
}

function listarClubes() {
  return cargarClubes();
}

function buscarClubes(query) {
  const clubes = cargarClubes();
  if (!query) return clubes;
  const q = normalizar(query);
  return clubes.filter((c) => {
    return (
      normalizar(c.nombre).includes(q) ||
      normalizar(c.apodo).includes(q) ||
      normalizar(c.ciudad).includes(q)
    );
  });
}

function obtenerClubPorId(id) {
  return cargarClubes().find((c) => c.id === id) || null;
}

module.exports = { listarClubes, buscarClubes, obtenerClubPorId };
