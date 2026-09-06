(() => {
  "use strict";

  const estado = {
    clubes: [],
    club: null,
    personajes: [],
    relato: "",
    destinatario: "",
    libroId: null,
    libro: null,
    paginaActual: 0,
    pollFallosSeguidos: 0,
    pollTimer: null,
  };

  const $ = (sel) => document.querySelector(sel);

  // ---------------------------------------------------------------------
  // Navegación entre pasos
  // ---------------------------------------------------------------------
  function mostrarSeccion(id) {
    document.querySelectorAll(".paso, #visor, #biblioteca").forEach((el) => {
      if (el.id) el.classList.add("oculto");
    });
    $(id).classList.remove("oculto");

    const numeroPaso = { "#paso-1": 1, "#paso-2": 2, "#paso-3": 3, "#paso-4": 4 }[id];
    document.querySelectorAll("#indicador-pasos li").forEach((li) => {
      li.classList.toggle("activo", numeroPaso && Number(li.dataset.paso) === numeroPaso);
    });
  }

  // ---------------------------------------------------------------------
  // Paso 1: club
  // ---------------------------------------------------------------------
  async function cargarClubes(query) {
    const url = query ? `/api/clubes?q=${encodeURIComponent(query)}` : "/api/clubes";
    const res = await fetch(url);
    estado.clubes = await res.json();
    renderClubes();
  }

  function renderClubes() {
    const cont = $("#lista-clubes");
    cont.innerHTML = "";
    estado.clubes.forEach((club) => {
      const div = document.createElement("div");
      div.className = "club-card" + (estado.club && estado.club.id === club.id ? " seleccionado" : "");
      div.innerHTML = `
        <span class="club-swatch" style="background:${club.colores[0]}"></span>
        <span>
          <span class="club-nombre">${club.nombre}</span>
          <span class="club-apodo">${club.apodo} · ${club.ciudad}</span>
        </span>`;
      div.addEventListener("click", () => seleccionarClub(club));
      cont.appendChild(div);
    });
  }

  function seleccionarClub(club) {
    estado.club = club;
    document.documentElement.style.setProperty("--club-primario", club.colores[0]);
    document.documentElement.style.setProperty("--club-secundario", club.colores[1] || "#ffffff");
    renderClubes();
    $("#btn-paso1-siguiente").disabled = false;
  }

  $("#buscador-club").addEventListener("input", (e) => cargarClubes(e.target.value));
  $("#btn-paso1-siguiente").addEventListener("click", () => mostrarSeccion("#paso-2"));

  // ---------------------------------------------------------------------
  // Paso 2: personajes
  // ---------------------------------------------------------------------
  $("#p-foto").addEventListener("change", () => {
    const archivo = $("#p-foto").files[0];
    const preview = $("#p-foto-preview");
    if (!archivo) {
      preview.classList.add("oculto");
      return;
    }
    const lector = new FileReader();
    lector.onload = (e) => {
      preview.src = e.target.result;
      preview.classList.remove("oculto");
    };
    lector.readAsDataURL(archivo);
  });

  $("#form-personaje").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("#p-nombre").value.trim();
    if (!nombre) return;

    const personaje = {
      nombre,
      vinculo: $("#p-vinculo").value.trim(),
      tipo: $("#p-tipo").value,
      foto_url: null,
      foto_preview: $("#p-foto-preview").src && !$("#p-foto-preview").classList.contains("oculto") ? $("#p-foto-preview").src : null,
    };

    const archivo = $("#p-foto").files[0];
    if (archivo) {
      const formData = new FormData();
      formData.append("foto", archivo);
      try {
        const res = await fetch("/api/personajes/foto", { method: "POST", body: formData });
        const data = await res.json();
        personaje.foto_url = data.foto_url;
      } catch (err) {
        console.error("No se pudo subir la foto:", err);
      }
    }

    estado.personajes.push(personaje);
    renderPersonajes();
    $("#form-personaje").reset();
    $("#p-foto-preview").classList.add("oculto");
    $("#btn-paso2-siguiente").disabled = estado.personajes.length === 0;
  });

  function renderPersonajes() {
    const cont = $("#lista-personajes");
    cont.innerHTML = "";
    estado.personajes.forEach((p, i) => {
      const chip = document.createElement("div");
      chip.className = "personaje-chip";
      chip.innerHTML = `
        ${p.foto_preview ? `<img src="${p.foto_preview}" alt="${p.nombre}">` : `<img alt="">`}
        <span>${p.nombre}${p.vinculo ? ` · ${p.vinculo}` : ""}</span>
        <button type="button" class="quitar" title="Quitar">×</button>`;
      chip.querySelector(".quitar").addEventListener("click", () => {
        estado.personajes.splice(i, 1);
        renderPersonajes();
        $("#btn-paso2-siguiente").disabled = estado.personajes.length === 0;
      });
      cont.appendChild(chip);
    });
  }

  $("#btn-paso2-atras").addEventListener("click", () => mostrarSeccion("#paso-1"));
  $("#btn-paso2-siguiente").addEventListener("click", () => mostrarSeccion("#paso-3"));

  // ---------------------------------------------------------------------
  // Paso 3: historia
  // ---------------------------------------------------------------------
  $("#relato").addEventListener("input", (e) => {
    estado.relato = e.target.value;
    $("#btn-paso3-siguiente").disabled = estado.relato.trim().length === 0;
  });
  $("#destinatario").addEventListener("input", (e) => (estado.destinatario = e.target.value));

  $("#btn-paso3-atras").addEventListener("click", () => mostrarSeccion("#paso-2"));
  $("#btn-paso3-siguiente").addEventListener("click", () => {
    renderResumen();
    mostrarSeccion("#paso-4");
  });

  // ---------------------------------------------------------------------
  // Paso 4: confirmación
  // ---------------------------------------------------------------------
  function renderResumen() {
    const nombresPersonajes = estado.personajes.map((p) => p.nombre).join(", ");
    $("#resumen-confirmacion").innerHTML = `
      <p><b>Club:</b> ${estado.club.nombre} (${estado.club.apodo})</p>
      <p><b>Personajes:</b> ${nombresPersonajes}</p>
      <p><b>Historia:</b> ${estado.relato.slice(0, 220)}${estado.relato.length > 220 ? "…" : ""}</p>
      ${estado.destinatario ? `<p><b>Para:</b> ${estado.destinatario}</p>` : ""}
      <p class="ayuda">El libro va a tener entre 7 y 10 páginas, todas ilustradas en estilo caricatura.</p>`;
  }

  $("#btn-paso4-atras").addEventListener("click", () => mostrarSeccion("#paso-3"));

  $("#btn-generar").addEventListener("click", async () => {
    mostrarSeccion("#paso-generando");
    $("#bloque-error").classList.add("oculto");
    $("#texto-progreso").textContent = "Enviando tu historia...";
    $("#barra-progreso-fill").style.width = "0%";

    try {
      const res = await fetch("/api/libro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          club_id: estado.club.id,
          personajes: estado.personajes.map(({ nombre, vinculo, tipo, foto_url }) => ({ nombre, vinculo, tipo, foto_url })),
          relato: estado.relato,
          destinatario: estado.destinatario,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo iniciar la generación.");
      }
      const data = await res.json();
      estado.libroId = data.libro_id;
      iniciarPolling();
    } catch (err) {
      mostrarError(err.message);
    }
  });

  $("#btn-reintentar").addEventListener("click", async () => {
    $("#bloque-error").classList.add("oculto");
    await fetch(`/api/libro/${estado.libroId}/reintentar`, { method: "POST" });
    iniciarPolling();
  });

  function mostrarError(mensaje) {
    $("#bloque-error").classList.remove("oculto");
    $("#detalle-progreso").textContent = mensaje || "";
  }

  function iniciarPolling() {
    clearInterval(estado.pollTimer);
    estado.pollFallosSeguidos = 0;
    estado.pollTimer = setInterval(consultarEstado, 1500);
    consultarEstado();
  }

  async function consultarEstado() {
    try {
      const res = await fetch(`/api/libro/${estado.libroId}/estado`);
      if (!res.ok) throw new Error("estado no disponible");
      const data = await res.json();
      estado.pollFallosSeguidos = 0;

      $("#texto-progreso").textContent = data.paso || "Trabajando...";
      const total = (data.totalPaginas || 0) + 1; // +1 por la tapa
      const listas = (data.paginasListas || 0) + (data.status === "generando_imagenes" || data.status === "listo" ? 0 : 0);
      const porcentaje = data.status === "listo" ? 100 : total ? Math.min(95, Math.round((listas / total) * 100)) : 8;
      $("#barra-progreso-fill").style.width = `${porcentaje}%`;

      if (data.status === "listo") {
        clearInterval(estado.pollTimer);
        await cargarYMostrarLibro(estado.libroId);
      } else if (data.status === "error") {
        clearInterval(estado.pollTimer);
        mostrarError(data.error);
      }
    } catch (err) {
      estado.pollFallosSeguidos += 1;
      // Tolerante a fallos transitorios (ver patrón en el proyecto de referencia):
      // no se rinde ante un solo error de red.
      if (estado.pollFallosSeguidos > 30) {
        clearInterval(estado.pollTimer);
        mostrarError("Perdimos la conexión con el servidor. Probá recargar la página.");
      }
    }
  }

  // ---------------------------------------------------------------------
  // Visor del libro
  // ---------------------------------------------------------------------
  async function cargarYMostrarLibro(id) {
    const res = await fetch(`/api/libro/${id}`);
    const libro = await res.json();
    estado.libro = libro;
    estado.paginaActual = 0;
    if (libro.club && libro.club.colores) {
      document.documentElement.style.setProperty("--club-primario", libro.club.colores[0]);
      document.documentElement.style.setProperty("--club-secundario", libro.club.colores[1] || "#ffffff");
    }
    mostrarSeccion("#visor");
    renderHoja();
  }

  function hojasDelLibro() {
    if (!estado.libro) return [];
    return [{ imagen: estado.libro.tapa.imagen, texto: estado.libro.tapa.texto, esTapa: true }, ...estado.libro.paginas.map((p) => ({ imagen: p.imagen, texto: p.texto }))];
  }

  function renderHoja() {
    const hojas = hojasDelLibro();
    const hoja = hojas[estado.paginaActual];
    $("#visor-imagen").src = hoja.imagen;
    $("#visor-texto").textContent = hoja.texto;
    $("#visor-indicador").textContent = hoja.esTapa ? "Tapa" : `Página ${estado.paginaActual} de ${hojas.length - 1}`;
    $("#btn-pagina-atras").disabled = estado.paginaActual === 0;
    $("#btn-pagina-adelante").disabled = estado.paginaActual === hojas.length - 1;
  }

  $("#btn-pagina-atras").addEventListener("click", () => {
    if (estado.paginaActual > 0) {
      estado.paginaActual -= 1;
      renderHoja();
    }
  });
  $("#btn-pagina-adelante").addEventListener("click", () => {
    if (estado.paginaActual < hojasDelLibro().length - 1) {
      estado.paginaActual += 1;
      renderHoja();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ($("#visor").classList.contains("oculto")) return;
    if (e.key === "ArrowRight") $("#btn-pagina-adelante").click();
    if (e.key === "ArrowLeft") $("#btn-pagina-atras").click();
  });

  $("#btn-nueva-historia").addEventListener("click", () => {
    estado.club = null;
    estado.personajes = [];
    estado.relato = "";
    estado.destinatario = "";
    estado.libroId = null;
    estado.libro = null;
    $("#relato").value = "";
    $("#destinatario").value = "";
    $("#btn-paso1-siguiente").disabled = true;
    $("#btn-paso2-siguiente").disabled = true;
    $("#btn-paso3-siguiente").disabled = true;
    renderPersonajes();
    mostrarSeccion("#paso-1");
  });

  // ---------------------------------------------------------------------
  // Biblioteca
  // ---------------------------------------------------------------------
  $("#btn-biblioteca").addEventListener("click", async () => {
    const res = await fetch("/api/libros");
    const libros = await res.json();
    const cont = $("#lista-biblioteca");
    cont.innerHTML = libros.length
      ? ""
      : "<p class='ayuda'>Todavía no generaste ningún libro.</p>";
    libros.forEach((libro) => {
      const div = document.createElement("div");
      div.className = "biblioteca-item";
      div.innerHTML = `<img src="${libro.tapa}" alt="${libro.titulo}"><span>${libro.titulo}</span>`;
      div.addEventListener("click", () => cargarYMostrarLibro(libro.id));
      cont.appendChild(div);
    });
    mostrarSeccion("#biblioteca");
  });
  $("#btn-biblioteca-cerrar").addEventListener("click", () => mostrarSeccion("#paso-1"));

  // ---------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------
  cargarClubes("");
  mostrarSeccion("#paso-1");
})();
