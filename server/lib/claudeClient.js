const fs = require("fs");
const path = require("path");

const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "prompts", "story-architect.system.md");
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const MIN_PAGINAS = 7;
const MAX_PAGINAS = 10;

function clampPaginas(n) {
  return Math.max(MIN_PAGINAS, Math.min(MAX_PAGINAS, n || MIN_PAGINAS));
}

function extraerJson(texto) {
  // Claude puede a veces envolver el JSON en ```json ... ``` a pesar de la
  // instrucción del prompt; esto lo tolera igual.
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("La respuesta del Autor IA no contiene JSON.");
  return JSON.parse(match[0]);
}

function tagPersonaje(p) {
  const rasgos = p.descripcion_fisica || (p.foto_url ? "según foto de referencia" : "sin referencia física, inventar rasgos cálidos y coherentes con el vínculo");
  return `@${p.nombre} (${rasgos})`;
}

/**
 * Genera el guion del libro. Si hay ANTHROPIC_API_KEY, llama a la API real.
 * Si no, genera un guion "placeholder" con reglas fijas, para poder probar
 * el resto del pipeline (imágenes, visor) sin gastar nada.
 */
async function generarGuionLibro({ club, personajes, relato, destinatario }) {
  if (process.env.ANTHROPIC_API_KEY) {
    return generarConClaude({ club, personajes, relato, destinatario });
  }
  return generarPlaceholder({ club, personajes, relato, destinatario });
}

async function generarConClaude({ club, personajes, relato, destinatario }) {
  const systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");

  const userPayload = {
    club: { nombre: club.nombre, apodo: club.apodo, colores: club.colores },
    personajes: personajes.map((p) => ({
      nombre: p.nombre,
      vinculo: p.vinculo,
      tipo: p.tipo,
      descripcion_fisica: p.descripcion_fisica || null,
      tiene_foto_referencia: Boolean(p.foto_url),
    })),
    relato,
    destinatario: destinatario || null,
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Generá el guion del libro para estos datos:\n\n${JSON.stringify(userPayload, null, 2)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`Error de la API de Claude (${res.status}): ${detalle}`);
  }

  const data = await res.json();
  const texto = (data.content || []).map((b) => b.text || "").join("\n");
  const guion = extraerJson(texto);
  guion.paginas = (guion.paginas || []).slice(0, MAX_PAGINAS);
  while (guion.paginas.length < MIN_PAGINAS) {
    guion.paginas.push({
      numero: guion.paginas.length + 1,
      texto: "…",
      descripcion_visual: guion.tapa?.descripcion_visual || "escena cálida junto al club",
      personajes_en_pagina: [],
    });
  }
  guion.paginas.forEach((p, i) => (p.numero = i + 1));
  return guion;
}

/**
 * Guion placeholder: no usa IA. Arma una estructura fija de 7 páginas a
 * partir del relato tal cual lo escribió el usuario, solo para poder
 * probar el pipeline completo (render de imágenes + visor) sin claves.
 */
function generarPlaceholder({ club, personajes, relato }) {
  const nombres = personajes.map((p) => p.nombre).filter(Boolean);
  const tagsPersonajes = personajes.map(tagPersonaje).join(", ") || "sin personajes cargados";
  const relatoCorto = (relato || "").trim() || "Una historia de pertenencia con el club.";

  const estructura = [
    "El comienzo del recuerdo",
    "Cómo entró el club en la historia",
    "Un momento junto a los personajes",
    "La cancha, los colores, el ruido de la gente",
    "Una anécdota central del relato",
    "Lo que significa hoy ese vínculo",
    "El cierre: la pertenencia que queda para siempre",
  ];

  const paginas = estructura.map((tema, i) => ({
    numero: i + 1,
    texto: `${tema}. ${relatoCorto}`.slice(0, 220),
    descripcion_visual: `Ilustración estilo caricatura cálida, colores del club ${club.nombre} (${club.colores.join(", ")}). Escena: ${tema.toLowerCase()}. Personajes presentes: ${tagsPersonajes}. [MODO PLACEHOLDER: configurá ANTHROPIC_API_KEY para guiones reales generados por IA]`,
    personajes_en_pagina: nombres,
  }));

  return {
    titulo: `Mi historia con ${club.nombre}`,
    tapa: {
      texto: `Mi historia con ${club.apodo || club.nombre}`,
      descripcion_visual: `Tapa de libro ilustrado, estilo caricatura, con los colores de ${club.nombre} (${club.colores.join(", ")}) y los personajes ${tagsPersonajes} en una escena de pertenencia futbolera. [MODO PLACEHOLDER]`,
    },
    personajes_en_libro: nombres,
    resumen: relatoCorto.slice(0, 200),
    paginas,
  };
}

module.exports = { generarGuionLibro, clampPaginas, MIN_PAGINAS, MAX_PAGINAS };
