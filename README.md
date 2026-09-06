# Historias de una vida de fútbol

Sitio que convierte la historia de pertenencia de un hincha con su club (sus
personajes, su relato, su club argentino) en un libro ilustrado en
caricatura de 7 a 10 páginas, navegable en formato horizontal como un
librito. Este MVP se enfoca solo en el sitio y la generación de imágenes;
canciones e integración con Arduino/parlante quedan para una fase
posterior (ver más abajo).

Estructura del proyecto (similar a la de "Mi Serie Mágica", el otro
proyecto usado como referencia de arquitectura):

```
server/
  index.js               # rutas Express
  lib/
    claudeClient.js        # "Autor IA": genera el guion del libro (o placeholder sin API key)
    imageProvider.js       # genera/cachea imágenes (placeholder en SVG, o fal.ai real)
    svgPlaceholder.js        # placeholder en SVG puro, sin dependencias externas
    jobs.js                 # orquesta el render en background + progreso + persistencia a disco + resume tras un crash
    clubsData.js             # carga y filtra data/clubes-argentina.json
web/
  index.html               # wizard de un solo formulario por pasos
  app.js                    # todo el JS del frontend, sin build step
  styles.css                 # identidad futbolera (colores dinámicos del club elegido)
data/
  clubes-argentina.json     # semilla de clubes argentinos (revisar/ampliar, ver abajo)
prompts/
  story-architect.system.md  # system prompt del Autor IA
scripts/
  test-render.js                  # smoke test end-to-end sin API keys
output/                       # (gitignored) fotos subidas, jobs, libros generados
render.yaml                  # blueprint de deploy en Render
```

## Cómo probarlo ya mismo (sin ninguna API key)

```bash
npm install
npm run test:render   # smoke test: arma un libro completo en modo placeholder
npm start             # levanta el sitio en http://localhost:3000
```

Sin `ANTHROPIC_API_KEY` ni `FAL_KEY`, el sitio funciona igual de punta a
punta: el guion se arma con reglas fijas (`claudeClient.js`, modo
placeholder) y las imágenes son un SVG con los colores del club y el texto
de cada página (`imageProvider.js` + `svgPlaceholder.js`, sin ninguna
dependencia externa — ni Python, ni librerías nativas), para poder probar
todo el flujo (wizard, progreso, visor del libro) sin gastar nada.

## Cómo pasar a generación real

1. Copiá `.env.example` a `.env`.
2. Cargá `ANTHROPIC_API_KEY` para que el guion lo genere Claude siguiendo
   `prompts/story-architect.system.md` (ya devuelve el JSON de 7 a 10
   páginas + tapa). Por defecto usa `claude-haiku-4-5` — de sobra para esta
   tarea y bastante más barato que Sonnet/Opus; se puede subir de modelo
   seteando `ANTHROPIC_MODEL` si hiciera falta más calidad.
3. Cargá `FAL_KEY` para que las imágenes se generen con fal.ai
   (`flux/schnell` para texto→imagen, `flux-pro/kontext` para
   imagen→imagen). Antes de confiar en esto en serio, comparar
   `server/lib/imageProvider.js` contra la documentación vigente de esos
   modelos en fal.ai — la forma exacta de los parámetros de `kontext` no
   se pudo verificar al armar este scaffold.

## Cómo se optimizó el costo por libro

`flux-pro/kontext` (imagen→imagen) cuesta ~$0.04 por imagen; `flux/schnell`
(texto→imagen) cuesta ~$0.003 — más de 10 veces menos. Por eso el sitio
usa `kontext` **únicamente** en las páginas donde aparece un personaje con
una foto real subida por el usuario (ahí sí vale la pena: es la función de
"que la caricatura se inspire en la foto"). Para el resto de los
personajes y páginas se usa `schnell` sin ninguna imagen de referencia —
la consistencia entre páginas la da el texto (el tag `@Nombre (rasgos)`
que el guion repite en cada escena, ver `prompts/story-architect.system.md`
regla 6), no una imagen de referencia generada aparte (eso también
ahorra una llamada extra por personaje). El guion en sí usa Haiku en vez
de Sonnet/Opus por el mismo motivo. Para un libro de 7-8 páginas sin fotos
reales, el costo total debería rondar los US$0.03-0.05 en vez de los
US$0.40-0.60 de un enfoque sin optimizar.

## Qué pasa si el servidor se cuelga a mitad de un render

Cada paso caro (el guion, cada imagen) se guarda a disco apenas se genera,
y antes de generar cualquier cosa se chequea si ya existe — así que
reintentar un libro (a mano, con el botón "Reintentar" del visor, o
automáticamente) nunca vuelve a pagar por un paso ya hecho. Además, al
arrancar, el servidor llama a `jobs.reanudarJobsInterrumpidos()`, que
detecta libros que quedaron a mitad de camino (ni "listo" ni "error") y
los retoma solo, sin que el usuario tenga que hacer nada.

Ojo con una limitación real de hosting: esto ayuda cuando el *proceso* de
Node se cae pero el disco sigue estando (por eso también se agregaron
handlers de `uncaughtException`/`unhandledRejection` para que un error
suelto no tire abajo todo el proceso). Pero si el hosting usa disco
efímero y arranca en un contenedor nuevo — típico de un redeploy, o de
que el plan free de Render se "duerma" y despierte de cero — los archivos
en disco se pierden igual y no hay nada que retomar. Para que esto sea a
prueba de balas de verdad hace falta mover el estado de los jobs (y las
imágenes ya generadas) a un storage persistente (ver la sección de
limitaciones más abajo).

**Importante sobre las fotos de referencia en desarrollo local:** cuando
el sitio corre en `localhost`, la URL de una foto subida no es alcanzable
por los servidores de fal.ai. El envío de referencia por imagen (para
mantener la cara/aspecto del personaje) solo va a funcionar una vez que el
sitio esté deployado con una URL pública (por ejemplo con `render.yaml` en
Render). En local, con `FAL_KEY` puesto pero sin URL pública, conviene
probar primero solo con personajes sin foto (el prompt de texto igual
describe sus rasgos).

## La lista de clubes es una semilla, no un dato verificado

`data/clubes-argentina.json` tiene ~34 clubes argentinos con sus colores
aproximados, escritos de memoria para tener el buscador funcionando ya. Antes
de mostrarle esto a un usuario real conviene revisar nombres, apodos y
colores (y sumar los clubes que falten) — es un archivo plano, fácil de
editar a mano.

## Reglas fijas del Autor IA (no negociables, ver el prompt completo)

- El resultado visual es **siempre caricatura**, nunca fotorrealista — una
  foto de referencia solo aporta rasgos, nunca se reproduce tal cual.
- El libro tiene **entre 7 y 10 páginas** (sin contar la tapa).
- La tapa combina a los personajes principales con la identidad visual del
  club.
- Los personajes reales (familiares, mascotas) nunca quedan ridiculizados;
  el eje es la pertenencia y el vínculo, no el resultado deportivo puntual.
- No se inventan datos del club o de los personajes que el usuario no haya
  dado — un relato escueto se expande con detalle sensorial y emocional,
  no con hechos concretos inventados.

## Lo que queda deliberadamente afuera de este MVP

- Elección y reproducción de canciones del club (se suma en la fase de
  música/Arduino).
- Grabación o carga de un mensaje de audio de un familiar.
- Exportar el libro a PDF para imprimirlo físicamente.
- Autenticación real de usuarios, cobro/suscripción, moderación automática
  del texto libre más allá de las reglas del system prompt.
- Storage persistente para las imágenes generadas — hoy quedan en disco
  local del server (`output/libros/`), lo cual se pierde en cada redeploy
  si el hosting usa disco efímero (como el plan free de Render). Para
  producción conviene subirlas a un storage tipo S3/R2.

## Roadmap

**Fase 1 (este repo):** sitio + wizard + generación de guion e imágenes +
visor horizontal del libro.

**Fase 2 — música:** el usuario elige canciones de su club, se asocian a
páginas o al libro completo, reproductor web simple.

**Fase 3 — hardware:** integración física con Arduino y un parlante para
reproducir la canción asociada a medida que se pasa el libro físico, y un
mensaje grabado opcional de un familiar.
