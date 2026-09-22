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

  it('picks math-consistent combo', () => {
    const pick = bestReceiptPick(
      parseReceiptText('Volume 35.0 L unit 14.00 total 490.00 misc 12'),
    );
    expect(pick.liters).toBe(35);
    expect(pick.unitPrice).toBe(14);
    expect(pick.total).toBe(490);
  });
});
