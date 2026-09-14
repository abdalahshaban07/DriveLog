"""Resize public/icons/icon-master.png → PWA PNGs + favicon.ico + favicon SVG."""

from pathlib import Path

from PIL import Image

BG = (11, 13, 16, 255)  # #0B0D10
FUEL = (232, 163, 23)  # #E8A317
PNG_SIZES = (72, 96, 128, 144, 152, 192, 384, 512)
ICO_SIZES = (16, 32, 48)
MASTER_SIZE = 1024

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
MASTER = ICONS / "icon-master.png"
SVG = ICONS / "drivelog.svg"

# Favicon SVG silhouette (tab icon); PNGs are SSOT for install/splash.
SVG_MARK = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="DriveLog">
  <rect width="32" height="32" fill="#0B0D10"/>
  <rect x="8" y="6.5" width="11.5" height="16.5" rx="2.8" fill="#E8A317"/>
  <rect x="7" y="22.5" width="13.5" height="3.2" rx="1.6" fill="#E8A317"/>
  <rect x="10.2" y="9" width="7" height="5" rx="1.2" fill="#0B0D10"/>
  <path fill="#E8A317" d="M19.2 11.5h2.2c1.4 0 2.6 1.1 2.6 2.5v4.2c0 .7.4 1.2 1.1 1.4l1.4.4c.9.3 1.5 1.1 1.5 2.1v.6c0 1-.8 1.8-1.8 1.8h-1.1c-1 0-1.8-.8-1.8-1.8v-5.2c0-.9-.7-1.6-1.6-1.6h-1.5v-4.4z"/>
</svg>
"""


def normalize(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), BG)
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    px = canvas.load()
    for y in range(side):
        for x in range(side):
            r, g, b, a = px[x, y]
            if a < 8 or (r < 40 and g < 40 and b < 40):
                px[x, y] = BG
            elif r > 140 and g > 100 and b < 120:
                px[x, y] = (*FUEL, 255)
    return canvas.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    if not MASTER.is_file():
        raise SystemExit(f"missing master icon: {MASTER}")
    ICONS.mkdir(parents=True, exist_ok=True)
    master = normalize(Image.open(MASTER))
    master.save(MASTER, "PNG")
    for s in PNG_SIZES:
        master.resize((s, s), Image.Resampling.LANCZOS).save(
            ICONS / f"icon-{s}x{s}.png", "PNG"
        )
    icos = [master.resize((s, s), Image.Resampling.LANCZOS) for s in ICO_SIZES]
    icos[0].save(
        ROOT / "public" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=icos[1:],
    )
    SVG.write_text(SVG_MARK, encoding="utf-8")


if __name__ == "__main__":
    main()
    for s in PNG_SIZES:
        p = ICONS / f"icon-{s}x{s}.png"
        assert p.is_file() and p.stat().st_size > 0, p
    assert SVG.is_file() and (ROOT / "public" / "favicon.ico").is_file()
    print("ok", MASTER, SVG, *PNG_SIZES)
