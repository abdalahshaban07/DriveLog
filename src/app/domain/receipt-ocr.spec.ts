import { describe, expect, it } from 'vitest';
import { bestReceiptPick, parseReceiptText, receiptMathOk } from './receipt-ocr';

describe('receipt-ocr', () => {
  it('parses labeled fields', () => {
    const c = parseReceiptText('Liters: 40.5\nPrice: 12.5\nTotal: 506.25');
    expect(c.liters).toContain(40.5);
    expect(c.unitPrice).toContain(12.5);
    expect(c.total).toContain(506.25);
    expect(receiptMathOk({ liters: 40.5, unitPrice: 12.5, total: 506.25 })).toBe(true);
  });

  it('rejects bad math beyond 2%', () => {
    expect(receiptMathOk({ liters: 40, unitPrice: 10, total: 500 })).toBe(false);
  });

  it('reads Arabic-Indic digits on labeled lines', () => {
    const c = parseReceiptText('لتر: ٤٠٫٥\nسعر: ١٢٫٥\nالإجمالي: ٥٠٦٫٢٥');
    expect(c.liters).toContain(40.5);
    expect(c.unitPrice).toContain(12.5);
    expect(c.total).toContain(506.25);
  });

  it('picks math-consistent combo', () => {
    const pick = bestReceiptPick(parseReceiptText('Volume 35.0 L unit 14.00 total 490.00 misc 12'));
    expect(pick.liters).toBe(35);
    expect(pick.unitPrice).toBe(14);
    expect(pick.total).toBe(490);
  });

  it('reads a pump LCD next to the camera clock and the nozzle sticker', () => {
    const raw = [
      'P 840.24 SALE',
      'L 35.010 LITER',
      '24.00 PRICE',
      '1. Remove the Nozzle from the nozzle holder.',
      '2. To preset, use the keyboard or instruction 2.',
      '3. Dispense',
      'October 3, 2026 at 1:47 AM',
    ].join('\n');
    expect(bestReceiptPick(parseReceiptText(raw))).toEqual({
      liters: 35.01,
      unitPrice: 24,
      total: 840.24,
    });
  });

  it('prefers the pump product over the clock when the words are missing', () => {
    const raw = '840.24\n35.010\n24.00\nOctober 3, 2026 at 1:47 AM\n1. Remove the Nozzle';
    expect(bestReceiptPick(parseReceiptText(raw))).toEqual({
      liters: 35.01,
      unitPrice: 24,
      total: 840.24,
    });
  });

  it('keeps a small fill when the unit price is larger than the liters', () => {
    expect(bestReceiptPick(parseReceiptText('10.5 LITER\n24.00 PRICE\n252.00 SALE'))).toEqual({
      liters: 10.5,
      unitPrice: 24,
      total: 252,
    });
  });

  it('does not treat the camera clock as a fill-up', () => {
    const pick = bestReceiptPick(
      parseReceiptText('October 3, 2026 at 1:47 AM\n1. Remove the Nozzle'),
    );
    expect(pick).toEqual({});
  });
});
