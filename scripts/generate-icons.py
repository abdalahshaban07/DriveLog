"""Rasterize public/icons/drivelog.svg geometry to PWA PNGs + favicon.ico."""

from pathlib import Path

from PIL import Image, ImageDraw

BG, FUEL, WELL = "#0B0D10", "#E8A317", "#07080A"
# viewBox 0 0 32 32 — glyph stays inside the center 80% circle
SHAPES = [
    ("body", 8, 7, 12, 18, 2.5, FUEL),
    ("hose", 18, 9, 6, 13, 2.5, FUEL),
    ("well", 10.5, 9, 7, 4.5, 1, WELL),
]
PNG_SIZES = (72, 96, 128, 144, 152, 192, 384, 512)
ICO_SIZES = (16, 32, 48)
MASTER = 1024
UNIT = MASTER / 32

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
SVG = ICONS / "drivelog.svg"


def paint(size: int) -> Image.Image:
    scale = size / 32
    im = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(im)
    for _name, x, y, w, h, rx, fill in SHAPES:
        d.rounded_rectangle(
            [x * scale, y * scale, (x + w) * scale, (y + h) * scale],
            radius=rx * scale,
            fill=fill,
        )
    return im


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    SVG.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"'
        ' role="img" aria-label="DriveLog">\n'
        f'  <rect width="32" height="32" fill="{BG}"/>\n'
        f'  <rect x="8" y="7" width="12" height="18" rx="2.5" fill="{FUEL}"/>\n'
        f'  <rect x="18" y="9" width="6" height="13" rx="2.5" fill="{FUEL}"/>\n'
        f'  <rect x="10.5" y="9" width="7" height="4.5" rx="1" fill="{WELL}"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )
    master = paint(MASTER)
    for s in PNG_SIZES:
        master.resize((s, s), Image.Resampling.LANCZOS).save(
            ICONS / f"icon-{s}x{s}.png", "PNG"
        )
    master.save(
        ROOT / "public" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )


if __name__ == "__main__":
    main()
    for s in PNG_SIZES:
        p = ICONS / f"icon-{s}x{s}.png"
        assert p.is_file() and p.stat().st_size > 0, p
    ico = ROOT / "public" / "favicon.ico"
    assert SVG.is_file() and ico.is_file()
    print("ok", SVG, ico, *PNG_SIZES)
