import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PUMP_LCD_H, PUMP_LCD_RLE, PUMP_LCD_W } from './pump-lcd.fixture';
import { readPumpLcd } from './pump-lcd';

function lumFromFixture(): Uint8Array {
  const raw = gunzipSync(Buffer.from(PUMP_LCD_RLE, 'base64'));
  const lum = new Uint8Array(PUMP_LCD_W * PUMP_LCD_H);
  let p = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const n = raw[i]!;
    const v = raw[i + 1]!;
    const shade = v === 0 ? 40 : v === 1 ? 220 : 160;
    lum.fill(shade, p, p + n);
    p += n;
  }
  return lum;
}

describe('pump-lcd', () => {
  it('reads the pump glass as 35.010 L × 24.00 = 840.24', () => {
    expect(readPumpLcd(lumFromFixture(), PUMP_LCD_W, PUMP_LCD_H)).toEqual({
      liters: 35.01,
      unitPrice: 24,
      total: 840.24,
      raw: '840.24\n35.010\n24.00',
    });
  });

  it('returns null when the picture is not a backlit display', () => {
    expect(readPumpLcd(new Uint8Array(200 * 200).fill(90), 200, 200)).toBeNull();
  });
});
