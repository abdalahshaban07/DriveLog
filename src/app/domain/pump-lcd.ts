/**
 * Read a fuel-pump LCD directly from the pixels.
 * PaddleOCR reads the printed SALE / LITER / PRICE words and drops the
 * decimal dots on the 7-segment glass (24.00 → 2400, 840.24 → 4024).
 *
 * ponytail: segment windows are tuned on one backlit pump photo.
 * A skewed panel or a different digit font returns null, and the paper-receipt OCR still runs.
 */

import { receiptMathOk } from './receipt-ocr';

export type PumpLcdRead = {
  liters: number;
  unitPrice: number;
  total: number;
  raw: string;
};

const ORDER = 'abcdefg';
const REG: Record<string, readonly [number, number, number, number]> = {
  a: [0.2, 0.02, 0.8, 0.2],
  b: [0.65, 0.1, 0.98, 0.46],
  c: [0.65, 0.54, 0.98, 0.9],
  d: [0.2, 0.8, 0.8, 0.98],
  e: [0.02, 0.54, 0.35, 0.9],
  f: [0.02, 0.1, 0.35, 0.46],
  g: [0.22, 0.4, 0.78, 0.6],
};
const PAT: Record<string, string> = {
  '1111110': '0',
  '0110000': '1',
  '1101101': '2',
  '1111001': '3',
  '0110011': '4',
  '1011011': '5',
  '1011111': '6',
  '1110000': '7',
  '1111111': '8',
  '1111011': '9',
};

type Box = { x0: number; y0: number; x1: number; y1: number };

function percentile(lum: Uint8Array, p: number): number {
  const step = Math.max(1, Math.floor(lum.length / 20000));
  const sample: number[] = [];
  for (let i = 0; i < lum.length; i += step) {
    sample.push(lum[i]!);
  }
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor((sample.length - 1) * p))]!;
}

function findLcd(lum: Uint8Array, w: number, h: number): Box | null {
  const bright = percentile(lum, 0.9);
  // Phone decodes shift the backlight. Follow the bright tail instead of a fixed 170.
  for (const cut of [bright * 0.92, bright * 0.78, bright * 0.64]) {
    const box = findBrightBox(lum, w, h, cut);
    if (box && box.x1 - box.x0 > w * 0.18 && box.y1 - box.y0 > h * 0.08) {
      return box;
    }
  }
  return null;
}

function findBrightBox(lum: Uint8Array, w: number, h: number, cut: number): Box | null {
  const step = 8;
  const cw = Math.floor(w / step);
  const ch = Math.floor(h / step);
  if (cw < 4 || ch < 4) {
    return null;
  }
  const grid = new Uint8Array(cw * ch);
  const need = step * step * 0.45;
  for (let gy = 0; gy < ch; gy++) {
    for (let gx = 0; gx < cw; gx++) {
      let c = 0;
      const yBase = gy * step;
      const xBase = gx * step;
      for (let yy = 0; yy < step; yy++) {
        const row = (yBase + yy) * w + xBase;
        for (let xx = 0; xx < step; xx++) {
          if (lum[row + xx]! > cut) {
            c++;
          }
        }
      }
      if (c > need) {
        grid[gy * cw + gx] = 1;
      }
    }
  }
  const seen = new Uint8Array(cw * ch);
  let best: number[] | null = null;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) {
      continue;
    }
    const cells: number[] = [];
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const p = q.pop()!;
      cells.push(p);
      const x = p % cw;
      const y = (p - x) / cw;
      const next = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
      for (let k = 0; k < next.length; k += 2) {
        const nx = next[k]!;
        const ny = next[k + 1]!;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) {
          continue;
        }
        const j = ny * cw + nx;
        if (grid[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    if (!best || cells.length > best.length) {
      best = cells;
    }
  }
  if (!best || best.length < 20) {
    return null;
  }
  let minX = cw;
  let maxX = 0;
  let minY = ch;
  let maxY = 0;
  for (const p of best) {
    const x = p % cw;
    const y = (p - x) / cw;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    x0: minX * step,
    y0: minY * step,
    x1: Math.min(w, (maxX + 1) * step),
    y1: Math.min(h, (maxY + 1) * step),
  };
}

function readRows(lum: Uint8Array, w: number, panel: Box): string[] | null {
  const cw = panel.x1 - panel.x0;
  const ch = panel.y1 - panel.y0;
  if (cw < 40 || ch < 40) {
    return null;
  }
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor((cw * ch) / 8000));
  for (let i = 0; i < cw * ch; i += stride) {
    const y = Math.floor(i / cw);
    const x = i - y * cw;
    sample.push(lum[(panel.y0 + y) * w + panel.x0 + x]!);
  }
  sample.sort((a, b) => a - b);
  const bg = sample[Math.floor(sample.length / 2)]!;
  const inkCut = bg * 0.72;
  const ink = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const src = (panel.y0 + y) * w + panel.x0;
    const dst = y * cw;
    for (let x = 0; x < cw; x++) {
      if (lum[src + x]! < inkCut) {
        ink[dst + x] = 1;
      }
    }
  }
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cw && y < ch && ink[y * cw + x] === 1;

  const proj = new Uint16Array(ch);
  for (let y = 0; y < ch; y++) {
    let s = 0;
    const row = y * cw;
    for (let x = 0; x < cw; x++) {
      s += ink[row + x]!;
    }
    proj[y] = s;
  }
  const sm = new Uint32Array(ch);
  let smMax = 0;
  for (let y = 0; y < ch; y++) {
    let s = 0;
    const a = Math.max(0, y - 2);
    const b = Math.min(ch, y + 3);
    for (let i = a; i < b; i++) {
      s += proj[i]!;
    }
    sm[y] = s;
    if (s > smMax) smMax = s;
  }
  // 0.10 keeps a digit's waist inside the row. 0.15 splits 24.00 into a top half
  // on a small photo, and the lower half is then too short to keep.
  const thr = smMax * 0.1;
  const bands: Array<[number, number]> = [];
  let open = -1;
  for (let y = 0; y < ch; y++) {
    if (sm[y]! > thr && open < 0) {
      open = y;
    } else if ((sm[y]! <= thr || y === ch - 1) && open >= 0) {
      const end = sm[y]! <= thr ? y : ch;
      if (end - open > Math.max(16, ch * 0.1)) {
        bands.push([open, end]);
      }
      open = -1;
    }
  }

  // A 7-seg digit has a gap in the middle. On a small photo that gap splits one row in two.
  const joined: Array<[number, number]> = [];
  for (const band of bands) {
    const prev = joined[joined.length - 1];
    if (prev && band[0] - prev[1] <= Math.max(3, (prev[1] - prev[0]) * 0.15)) {
      prev[1] = band[1];
    } else {
      joined.push([band[0], band[1]]);
    }
  }
  const texts: string[] = [];
  for (const [by0, by1] of joined) {
    const rh = by1 - by0;
    const vthr = Math.max(3, Math.trunc(rh * 0.12));
    const gs: Array<[number, number]> = [];
    let g0 = -1;
    for (let x = 0; x < cw; x++) {
      let v = 0;
      for (let y = by0; y < by1; y++) {
        v += ink[y * cw + x]!;
      }
      if (v >= vthr && g0 < 0) {
        g0 = x;
      } else if (v < vthr && g0 >= 0) {
        if (x - g0 > Math.max(2, Math.trunc(rh * 0.04))) {
          gs.push([g0, x - 1]);
        }
        g0 = -1;
      }
    }
    if (g0 >= 0 && cw - g0 > 5) {
      gs.push([g0, cw - 1]);
    }
    const widths = gs
      .map(([a, b]) => b - a)
      .filter((width) => width >= rh * 0.28 && width <= rh * 0.9)
      .sort((a, b) => a - b);
    const dw = widths.length
      ? widths[Math.floor(widths.length / 2)]!
      : Math.max(8, Math.round(rh * 0.5));
    // A "4" has a gap between the stems, so one digit arrives as two or three pieces.
    const merged: Array<[number, number]> = [];
    for (let i = 0; i < gs.length; i++) {
      let a0 = gs[i]![0];
      let a1 = gs[i]![1];
      while (i + 1 < gs.length) {
        const b = gs[i + 1]!;
        const gap = b[0] - a1;
        const span = b[1] - a0;
        if (gap < dw * 0.35 && span < dw * 1.25 && b[1] - b[0] < dw * 0.9 && a1 - a0 < dw * 0.9) {
          a1 = b[1];
          i++;
          continue;
        }
        break;
      }
      merged.push([a0, a1]);
    }
    let glyphs = merged;
    if (glyphs.length >= 2 && glyphs[1]![0] - glyphs[0]![1] > dw * 1.2) {
      glyphs = glyphs.slice(1);
    }
    const edge = Math.max(2, Math.round(dw * 0.08));
    glyphs = glyphs.filter(([a, b]) => b - a > dw * 0.22 && a > edge && b < cw - edge);

    const seen = new Uint8Array(cw * ch);
    const dots: number[] = [];
    for (let y = by0; y < by1; y++) {
      for (let x = 0; x < cw; x++) {
        if (!on(x, y) || seen[y * cw + x]) {
          continue;
        }
        const q: number[] = [y * cw + x];
        seen[y * cw + x] = 1;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let n = 0;
        while (q.length) {
          const p = q.pop()!;
          n++;
          const cx = p % cw;
          const cy = (p - cx) / cw;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          const nbr = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
          for (let k = 0; k < nbr.length; k += 2) {
            const nx = nbr[k]!;
            const ny = nbr[k + 1]!;
            if (!on(nx, ny) || seen[ny * cw + nx]) {
              continue;
            }
            seen[ny * cw + nx] = 1;
            q.push(ny * cw + nx);
          }
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const cy = (minY + maxY) / 2;
        // The decimal sits on the baseline. A speck on the top of a digit is not one.
        if (
          n >= 12 &&
          bw <= dw * 0.45 &&
          bh <= rh * 0.28 &&
          bh >= rh * 0.05 &&
          bw >= 4 &&
          cy > by0 + rh * 0.7
        ) {
          dots.push((minX + maxX) / 2);
        }
      }
    }

    let text = '';
    for (const [gx0, gx1] of glyphs) {
      const gw = gx1 - gx0;
      let dig: string;
      if (gw < dw * 0.45) {
        dig = '1';
      } else {
        const bw = gx1 - gx0 + 1;
        const bh = rh;
        let bits = '';
        for (const name of ORDER) {
          const [rx0, ry0, rx1, ry1] = REG[name]!;
          let sx = Math.trunc(gx0 + rx0 * bw);
          let ex = Math.trunc(gx0 + rx1 * bw);
          let sy = Math.trunc(by0 + ry0 * bh);
          let ey = Math.trunc(by0 + ry1 * bh);
          sx = Math.max(gx0, sx);
          ex = Math.min(gx1, Math.max(sx + 1, ex));
          sy = Math.max(by0, sy);
          ey = Math.min(by1, Math.max(sy + 1, ey));
          let hit = 0;
          let tot = 0;
          for (let yy = sy; yy < ey; yy++) {
            for (let xx = sx; xx < ex; xx++) {
              tot++;
              hit += ink[yy * cw + xx]!;
            }
          }
          bits += tot && hit / tot >= 0.32 ? '1' : '0';
        }
        let bestDist = 99;
        let best = '?';
        for (const [pattern, digit] of Object.entries(PAT)) {
          let dist = 0;
          for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] !== bits[i]) {
              dist++;
            }
          }
          if (dist < bestDist) {
            bestDist = dist;
            best = digit;
          }
        }
        if (bestDist > 2) {
          return null;
        }
        dig = best;
      }
      for (const dc of dots) {
        if (gx0 - dw * 0.6 < dc && dc < gx0 + 8) {
          text += '.';
          break;
        }
      }
      text += dig;
    }
    if (!/^\d*\.?\d+$/.test(text) || text.replace(/\D/g, '').length < 3) {
      return null;
    }
    texts.push(text);
  }
  return texts;
}

function assignRows(rows: string[]): PumpLcdRead | null {
  if (rows.length !== 3 || rows.filter((s) => s.includes('.')).length < 2) {
    return null;
  }
  const parts = rows.map((s) => ({
    n: Number(s),
    dec: s.includes('.') ? s.length - s.indexOf('.') - 1 : 0,
  }));
  if (parts.some((p) => !Number.isFinite(p.n) || p.n <= 0)) {
    return null;
  }
  let best: PumpLcdRead | null = null;
  let bestScore = -1;
  for (let li = 0; li < 3; li++) {
    for (let pi = 0; pi < 3; pi++) {
      if (pi === li) {
        continue;
      }
      const ti = 3 - li - pi;
      const liters = parts[li]!.n;
      const unitPrice = parts[pi]!.n;
      const total = parts[ti]!.n;
      if (receiptMathOk({ liters, unitPrice, total }) !== true) {
        continue;
      }
      let score = 0;
      if (parts[li]!.dec > parts[pi]!.dec && parts[li]!.dec >= parts[ti]!.dec) {
        score += 4;
      }
      if (total >= liters && total >= unitPrice) {
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { liters, unitPrice, total, raw: rows.join('\n') };
      }
    }
  }
  return best;
}

/** Read SALE / LITER / PRICE off a pump LCD. Null when the picture is not that display. */
export function readPumpLcd(lum: Uint8Array, w: number, h: number): PumpLcdRead | null {
  const panel = findLcd(lum, w, h);
  if (!panel) {
    return null;
  }
  const rows = readRows(lum, w, panel);
  if (!rows) {
    return null;
  }
  return assignRows(rows);
}

/** Decode a camera photo and read the pump glass. Null when it is not a 7-segment LCD. */
export async function readPumpFromBlob(blob: Blob): Promise<PumpLcdRead | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    // A phone photo can be 4000px wide. iOS refuses getImageData on that canvas,
    // and the reader only needs the glass at about the size of this working photo.
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const lum = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = (data[i]! * 3 + data[i + 1]! * 4 + data[i + 2]!) >> 3;
    }
    return readPumpLcd(lum, width, height);
  } finally {
    bitmap.close();
  }
}
