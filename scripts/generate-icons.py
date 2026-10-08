"""Draw the DriveLog pump mark → PWA PNGs, favicon, and SVGs.

Splash uses public/icons/mark.svg (fuel on a transparent tile).
Home-screen icons keep a night tile; the glyph sits inside the maskable
safe zone, so maskable files are the same artwork without a second shrink.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

BG = (11, 13, 16, 255)  # #0B0D10
FUEL = (232, 163, 23, 255)  # #E8A317
PNG_SIZES = (72, 96, 128, 144, 152, 192, 384, 512)
MASKABLE_SIZES = (192, 512)
ICO_SIZES = (16, 32, 48)
MASTER_SIZE = 1024
GRID = 64

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
MASTER = ICONS / "icon-master.png"
SVG = ICONS / "drivelog.svg"
MARK = ICONS / "mark.svg"

# 64-grid. Hose leaves the cabinet and ends free, above the base.
BODY = (16.4, 12.6, 35.6, 42.8)
BODY_R = 4.0
BASE = (13.2, 41.0, 38.8, 49.2)
BASE_R = 2.9
WIN = (19.8, 16.4, 31.8, 24.8)
WIN_R = 1.6
HOSE_W = 3.5
HOSE_Y = 20.4
HOSE_R = 6.6
HOSE_CX = 40.6
HOSE_END_Y = 37.2


def _arc(cx, cy, radius, a0, a1, n=48):
    return [
        (
            cx + radius * math.cos(a0 + (a1 - a0) * i / n),
            cy + radius * math.sin(a0 + (a1 - a0) * i / n),
        )
        for i in range(n + 1)
    ]


def hose_centerline():
    """Horizontal run, quarter turn, short drop. Units are the 64-grid."""
    y = HOSE_Y
    cx, cy = HOSE_CX, y + HOSE_R
    start_x = WIN[2] + HOSE_W / 2 + 0.35
    pts = [(start_x + (cx - start_x) * i / 16, y) for i in range(17)]
    pts += _arc(cx, cy, HOSE_R, -math.pi / 2, 0)[1:]
    ex, ey = pts[-1]
    pts += [(ex, ey + (HOSE_END_Y - ey) * i / 18) for i in range(1, 19)]
    return pts


def _normals(pts):
    out = []
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == len(pts) - 1:
            dx, dy = x - pts[-2][0], y - pts[-2][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1
        out.append((-dy / length, dx / length))
    return out


def hose_ribbon():
    """Filled hose outline plus the end-cap center, in 64-grid units."""
    pts = hose_centerline()
    half = HOSE_W / 2
    left, right = [], []
    for (x, y), (nx, ny) in zip(pts, _normals(pts)):
        left.append((x + nx * half, y + ny * half))
        right.append((x - nx * half, y - ny * half))
    return left + right[::-1], pts[-1], half


def _scaled(pts, size):
    k = size / GRID
    return [(x * k, y * k) for x, y in pts]


def _rect(box, size):
    k = size / GRID
    return tuple(v * k for v in box)


def draw_mark(size, hole):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(_rect(BODY, size), radius=BODY_R * size / GRID, fill=FUEL)
    d.rounded_rectangle(_rect(BASE, size), radius=BASE_R * size / GRID, fill=FUEL)
    ribbon, end, half = hose_ribbon()
    d.polygon(_scaled(ribbon, size), fill=FUEL)
    ex, ey = end
    r = half * size / GRID
    d.ellipse((ex * size / GRID - r, ey * size / GRID - r, ex * size / GRID + r, ey * size / GRID + r), fill=FUEL)
    wx0, wy0, wx1, wy1 = _rect(WIN, size)
    d.rounded_rectangle((wx0, wy0, wx1, wy1), radius=WIN_R * size / GRID, fill=hole)
    return im


def _fmt(n):
    return f"{n:.2f}".rstrip("0").rstrip(".")


def _pts(pts):
    return " ".join(f"{_fmt(x)},{_fmt(y)}" for x, y in pts)


def _rect_tag(box, r, extra=""):
    x0, y0, x1, y1 = box
    attrs = f'x="{_fmt(x0)}" y="{_fmt(y0)}" width="{_fmt(x1 - x0)}" height="{_fmt(y1 - y0)}" rx="{_fmt(r)}"'
    return f"<rect {attrs}{extra}/>"


def svg_markup(background):
    ribbon, end, half = hose_ribbon()
    ex, ey = end
    bg = '<rect width="64" height="64" fill="#0B0D10"/>' if background else ""
    window = _rect_tag(WIN, WIN_R, ' fill="#000"')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="DriveLog">'
        f"{bg}"
        '<mask id="pump-window"><rect width="64" height="64" fill="#fff"/>'
        f"{window}"
        "</mask>"
        '<g fill="#E8A317" mask="url(#pump-window)">'
        f"{_rect_tag(BODY, BODY_R)}{_rect_tag(BASE, BASE_R)}"
        f'<polygon points="{_pts(ribbon)}"/>'
        f'<circle cx="{_fmt(ex)}" cy="{_fmt(ey)}" r="{_fmt(half)}"/>'
        "</g></svg>\n"
    )


def tile(size):
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.alpha_composite(draw_mark(size, BG))
    return canvas


def glyph_box(im):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if px[x, y][:3] != BG[:3]:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    master = tile(MASTER_SIZE)
    master.save(MASTER, "PNG")
    for s in PNG_SIZES:
        master.resize((s, s), Image.Resampling.LANCZOS).save(ICONS / f"icon-{s}x{s}.png", "PNG")
    for s in MASKABLE_SIZES:
        master.resize((s, s), Image.Resampling.LANCZOS).save(ICONS / f"maskable-{s}.png", "PNG")
    icos = [master.resize((s, s), Image.Resampling.LANCZOS) for s in ICO_SIZES]
    icos[0].save(
        ROOT / "public" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=icos[1:],
    )
    SVG.write_text(svg_markup(True), encoding="utf-8")
    MARK.write_text(svg_markup(False), encoding="utf-8")


if __name__ == "__main__":
    main()
    master = Image.open(MASTER)
    assert master.size == (MASTER_SIZE, MASTER_SIZE)
    x0, y0, x1, y1 = glyph_box(master)
    # Inside the central 80% (maskable safe zone) and not cramped against the tile.
    assert x0 > MASTER_SIZE * 0.10 and y0 > MASTER_SIZE * 0.10, (x0, y0)
    assert x1 < MASTER_SIZE * 0.90 and y1 < MASTER_SIZE * 0.90, (x1, y1)
    assert (x1 - x0) / MASTER_SIZE < 0.72
    px = master.load()
    assert px[0, 0][:3] == BG[:3]
    wx = int((WIN[0] + WIN[2]) / 2 / GRID * MASTER_SIZE)
    wy = int((WIN[1] + WIN[3]) / 2 / GRID * MASTER_SIZE)
    assert px[wx, wy][:3] == BG[:3], px[wx, wy]
    bx = int((BODY[0] + 2) / GRID * MASTER_SIZE)
    by = int((BODY[1] + BODY[3]) / 2 / GRID * MASTER_SIZE)
    assert px[bx, by][:3] == FUEL[:3], px[bx, by]
    for s in PNG_SIZES:
        p = ICONS / f"icon-{s}x{s}.png"
        assert p.is_file() and Image.open(p).size == (s, s), p
    for s in MASKABLE_SIZES:
        p = ICONS / f"maskable-{s}.png"
        assert p.is_file() and Image.open(p).size == (s, s), p
    mark = MARK.read_text(encoding="utf-8")
    fav = SVG.read_text(encoding="utf-8")
    assert 'fill="#0B0D10"' not in mark
    assert 'fill="#0B0D10"' in fav and 'fill="#E8A317"' in mark
    assert (ROOT / "public" / "favicon.ico").is_file()
    print("ok", MASTER, SVG, MARK)
