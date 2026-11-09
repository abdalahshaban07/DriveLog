import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../i18n/i18n';
import { ODOMETER_OCR, OdometerScanState } from './odometer-scan-state';

const worker = vi.fn<(image: Blob) => Promise<string>>();

function fileEvent(state: OdometerScanState): void {
  const blob = new Blob(['photo'], { type: 'image/png' });
  const input = { files: [blob], value: 'x' } as unknown as HTMLInputElement;
  state.onScanFile({ target: input } as unknown as Event);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('OdometerScanState', () => {
  let state: OdometerScanState;

  beforeEach(async () => {
    worker.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:odo');
    URL.revokeObjectURL = vi.fn();
    await TestBed.configureTestingModule({
      providers: [
        OdometerScanState,
        { provide: ODOMETER_OCR, useValue: worker },
        {
          provide: I18n,
          useValue: {
            t: (k: string, p?: Record<string, unknown>) =>
              p ? `${k}:${JSON.stringify(p)}` : k,
            formatNumber: (n: number) => String(n),
          },
        },
      ],
    }).compileComponents();
    state = TestBed.inject(OdometerScanState);
    state.context = () => ({ base: 44000, current: 44500, chargeMode: false });
  });

  it('opens review with the best reading and a preview', async () => {
    worker.mockResolvedValue('ODO 45000 km\nTRIP 450.7');
    fileEvent(state);
    expect(state.busy()).toBe(true);
    await flush();
    expect(state.busy()).toBe(false);
    expect(state.stage()).toBe('review');
    expect(state.pick()).toBe('45000');
    expect(state.previewUrl()).toBe('blob:odo');
    expect(state.candidates()?.values).toEqual([45000]);
  });

  it('discards a late result after cancel mid-scan', async () => {
    let resolve!: (text: string) => void;
    worker.mockImplementation(() => new Promise((r) => (resolve = r)));
    fileEvent(state);
    expect(state.busy()).toBe(true);
    state.cancel();
    expect(state.busy()).toBe(false);
    resolve('ODO 45000');
    await flush();
    expect(state.stage()).toBe('idle');
    expect(state.pick()).toBe('');
    expect(state.previewUrl()).toBeNull();
    expect(state.error()).toBe('');
  });

  it('discards a late failure after cancel mid-scan', async () => {
    let reject!: (err: unknown) => void;
    worker.mockImplementation(() => new Promise((_, rej) => (reject = rej)));
    fileEvent(state);
    state.cancel();
    reject(new Error('offline'));
    await flush();
    expect(state.stage()).toBe('idle');
    expect(state.error()).toBe('');
    expect(state.busy()).toBe(false);
  });

  it('starts a fresh scan cleanly after a cancel', async () => {
    let resolve!: (text: string) => void;
    worker.mockImplementation(() => new Promise((r) => (resolve = r)));
    fileEvent(state);
    state.cancel();
    resolve('ODO 11111');
    await flush();
    worker.mockResolvedValue('ODO 45000');
    fileEvent(state);
    await flush();
    expect(state.stage()).toBe('review');
    expect(state.pick()).toBe('45000');
  });

  it('shows a friendly error when OCR fails', async () => {
    worker.mockRejectedValue(new Error('offline'));
    fileEvent(state);
    await flush();
    expect(state.busy()).toBe(false);
    expect(state.stage()).toBe('idle');
    expect(state.error()).toBe('fillUp.odoScanFailed');
  });

  it('asks for a closer photo when no reading is found', async () => {
    worker.mockResolvedValue('hello world');
    fileEvent(state);
    await flush();
    expect(state.stage()).toBe('idle');
    expect(state.error()).toBe('fillUp.odoScanNone');
  });

  it('applies the reading into the form and resets', async () => {
    const onApply = vi.fn();
    state.onApply = onApply;
    worker.mockResolvedValue('ODO 45000');
    fileEvent(state);
    await flush();
    state.apply();
    expect(onApply).toHaveBeenCalledWith(45000);
    expect(state.applied()).toBe(true);
    expect(state.stage()).toBe('idle');
    expect(state.previewUrl()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:odo');
  });

  it('translates km into distance since the previous fill', async () => {
    worker.mockResolvedValue('ODO 45000');
    fileEvent(state);
    await flush();
    expect(state.derivedDistance()).toBe(1000);
    expect(state.rollbackKm()).toBe(0);
    expect(state.blocked()).toBe(false);
    expect(state.canApply()).toBe(true);
  });

  it('blocks a rollback reading in fuel mode', async () => {
    const onApply = vi.fn();
    state.onApply = onApply;
    worker.mockResolvedValue('ODO 44000');
    fileEvent(state);
    await flush();
    expect(state.rollbackKm()).toBe(500);
    expect(state.blocked()).toBe(true);
    expect(state.canApply()).toBe(false);
    state.apply();
    expect(onApply).not.toHaveBeenCalled();
    expect(state.stage()).toBe('review');
  });

  it('warns but allows a rollback in charge mode', async () => {
    state.context = () => ({ base: 44000, current: 44500, chargeMode: true });
    worker.mockResolvedValue('ODO 44000');
    fileEvent(state);
    await flush();
    expect(state.rollbackKm()).toBe(500);
    expect(state.blocked()).toBe(false);
    expect(state.canApply()).toBe(true);
    expect(state.derivedDistance()).toBeNull();
  });

  it('lets the user pick another candidate and edit the value', async () => {
    worker.mockResolvedValue('12345\n45000\n50000 km');
    fileEvent(state);
    await flush();
    expect(state.pick()).toBe('50000');
    state.selectCandidate(45000);
    expect(state.pick()).toBe('45000');
    state.setPick('46000');
    expect(state.pickNum()).toBe(46000);
    state.setPick('');
    expect(state.pickNum()).toBeNull();
    expect(state.canApply()).toBe(false);
  });

  it('cancel in review discards the reading and preview', async () => {
    worker.mockResolvedValue('ODO 45000');
    fileEvent(state);
    await flush();
    state.cancel();
    expect(state.stage()).toBe('idle');
    expect(state.pick()).toBe('');
    expect(state.candidates()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:odo');
  });
});