#!/usr/bin/env python3
"""
Genera una imagen placeholder en formato horizontal (apta para el visor
del libro) usando los colores del club y un texto corto, para poder
probar todo el flujo del sitio sin gastar en generación de imágenes real.

Uso:
    python3 generate_placeholder_image.py <ruta_salida.png> <texto> <color_primario> <color_secundario>
"""
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

ANCHO, ALTO = 1200, 800  # horizontal, ~3:2, como una hoja de librito


def hex_a_rgb(hex_color):
    hex_color = (hex_color or "#1c8a43").lstrip("#")
    if len(hex_color) != 6:
        hex_color = "1c8a43"
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def color_contraste(rgb):
    luminancia = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
    return (20, 20, 20) if luminancia > 0.6 else (255, 255, 255)


def main():
    if len(sys.argv) < 5:
        print("Uso: generate_placeholder_image.py <salida> <texto> <primario> <secundario>", file=sys.stderr)
        sys.exit(1)

    salida, texto, primario_hex, secundario_hex = sys.argv[1:5]
    primario = hex_a_rgb(primario_hex)
    secundario = hex_a_rgb(secundario_hex)

    img = Image.new("RGB", (ANCHO, ALTO), primario)
    draw = ImageDraw.Draw(img)

    # Franja diagonal simple con el color secundario, como una bufanda.
    draw.polygon(
        [(0, ALTO), (ANCHO * 0.55, ALTO), (ANCHO * 0.85, 0), (ANCHO * 0.55, 0)],
        fill=secundario,
    )

    # Pelota de fútbol simplificada en una esquina.
    cx, cy, r = ANCHO - 110, 110, 60
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255), outline=(20, 20, 20), width=4)

    try:
        fuente = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
    except Exception:
        fuente = ImageFont.load_default()

    texto_final = texto.strip() or "Historias de una vida de fútbol"
    lineas = textwrap.wrap(texto_final, width=42)[:6]

    color_texto = color_contraste(primario)
    y = ALTO - 60 - (len(lineas) * 50)
    for linea in lineas:
        draw.text((60, y), linea, font=fuente, fill=color_texto)
        y += 50

    marca = "MODO PLACEHOLDER — configurá FAL_KEY para imágenes reales"
    try:
        fuente_chica = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    except Exception:
        fuente_chica = ImageFont.load_default()
    draw.text((20, 20), marca, font=fuente_chica, fill=color_contraste(primario))

    img.save(salida)
    print(salida)


if __name__ == "__main__":
    main()
