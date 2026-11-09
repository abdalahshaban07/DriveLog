import { Injectable, InjectionToken, OnDestroy, computed, inject, signal } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import {
  bestOdometerPick,
  parseOdometerText,
  type OdometerCandidates,
} from '../../domain/odometer-ocr';
import { ocrReceiptImage } from '../../domain/receipt-ocr-worker';

/** Lazy OCR reader seam; the default keeps the engine off the route until a scan. */
export const ODOMETER_OCR = new InjectionToken<(image: Blob) => Promise<string>>('OdometerOcr', {
  providedIn: 'root',
  factory: () => ocrReceiptImage,
});

/** Form context the page installs so the review can translate km into distance. */
export type OdometerContext = {
  base: number;
  current: number;
  chargeMode: boolean;
};

/**
 * Odometer photo-scan state with a cancel token: a late OCR result from a
 * cancelled run is discarded instead of popping a review the user dismissed.
 */
@Injectable()
export class OdometerScanState implements OnDestroy {
  private readonly i18n = inject(I18n);
  private readonly ocr = inject(ODOMETER_OCR);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly stage = signal<'idle' | 'review'>('idle');
  readonly candidates = signal<OdometerCandidates | null>(null);
  readonly pick = signal('');
  readonly previewUrl = signal<string | null>(null);
  readonly applied = signal(false);

  private runId = 0;

  /** The page installs this to merge a confirmed reading into the live form. */
  onApply: ((km: number) => void) | null = null;
  context: (() => OdometerContext) | null = null;

  readonly pickNum = computed(() => {
    const n = Number(this.pick());
    return this.pick() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  });

  /** Fuel mode: km since the previous fill that confirming will enter. */
  readonly derivedDistance = computed(() => {
    const ctx = this.context?.();
    const n = this.pickNum();
    return ctx && !ctx.chargeMode && n != null ? Math.max(0, n - ctx.base) : null;
  });

  readonly rollbackKm = computed(() => {
    const ctx = this.context?.();
    const n = this.pickNum();
    return ctx && n != null ? Math.max(0, ctx.current - n) : 0;
  });

  /** A rollback would enter an invalid distance in fuel mode, so block it there. */
  readonly blocked = computed(() => {
    const ctx = this.context?.();
    return !!ctx && !ctx.chargeMode && this.rollbackKm() > 0;
  });

  readonly canApply = computed(() => this.pickNum() != null && !this.blocked());

  onScanFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.runOcr(file);
    }
  }

  scanWithCamera(): void {
    document.getElementById('odo-scan-input')?.click();
  }

  pickFromGallery(): void {
    document.getElementById('odo-gallery-input')?.click();
  }

  private async runOcr(image: Blob): Promise<void> {
    const token = ++this.runId;
    this.busy.set(true);
    this.error.set('');
    this.applied.set(false);
    this.stage.set('idle');
    this.candidates.set(null);
    try {
      const text = await this.ocr(image);
      if (token !== this.runId) {
        return;
      }
      const candidates = parseOdometerText(text);
      const best = bestOdometerPick(candidates);
      if (best == null) {
        this.error.set(this.i18n.t('fillUp.odoScanNone'));
        return;
      }
      this.candidates.set(candidates);
      this.pick.set(String(best));
      this.previewUrl.set(URL.createObjectURL(image));
      this.stage.set('review');
    } catch {
      if (token === this.runId) {
        this.error.set(this.i18n.t('fillUp.odoScanFailed'));
      }
    } finally {
      if (token === this.runId) {
        this.busy.set(false);
      }
    }
  }

  setPick(v: string): void {
    this.pick.set(v);
  }

  selectCandidate(km: number): void {
    this.pick.set(String(km));
  }

  /** Confirm the reading into the form — never auto-saves. */
  apply(): void {
    const n = this.pickNum();
    if (n == null || !this.canApply()) {
      return;
    }
    this.onApply?.(n);
    this.applied.set(true);
    this.reset();
  }

  /** Cancel works mid-scan and in review; the token discards any late result. */
  cancel(): void {
    this.runId++;
    this.busy.set(false);
    this.reset();
  }

  private reset(): void {
    this.stage.set('idle');
    this.candidates.set(null);
    this.pick.set('');
    this.error.set('');
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.previewUrl.set(null);
  }

  ngOnDestroy(): void {
    this.runId++;
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}