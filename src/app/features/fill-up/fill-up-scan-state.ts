import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { I18n } from '../../i18n/i18n';
import { takeSharedFillImage } from '../../pwa/share-target';
import {
  bestReceiptPick,
  parseReceiptText,
  receiptMathOk,
  type ReceiptCandidates,
  type ReceiptPick,
} from '../../domain/receipt-ocr';
import { readPumpFromBlob } from '../../domain/pump-lcd';
import { ocrReceiptImage } from '../../domain/receipt-ocr-worker';

/** Shared OCR/receipt state for the fill-up scan row and review cards. */
@Injectable()
export class FillUpScanState {
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(I18n);

  /** Image from PWA share_target (?shared=1) — feeds OCR. */
  readonly sharedPreviewUrl = signal<string | null>(null);
  readonly sharedBlob = signal<Blob | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly candidates = signal<ReceiptCandidates | null>(null);
  readonly pick = signal<ReceiptPick>({});
  readonly stage = signal<'idle' | 'review'>('idle');
  readonly math = computed(() => receiptMathOk(this.pick()));

  /** The page installs this to merge an applied pick into the live form. */
  onApply: ((pick: ReceiptPick) => void) | null = null;

  init(): void {
    if (this.route.snapshot.queryParamMap.get('shared') === '1') {
      void this.loadSharedImage();
    }
  }

  async loadSharedImage(): Promise<void> {
    const shared = await takeSharedFillImage();
    if (!shared) {
      return;
    }
    this.clearSharedImage();
    this.sharedBlob.set(shared.blob);
    this.sharedPreviewUrl.set(shared.objectUrl);
  }

  clearSharedImage(): void {
    const url = this.sharedPreviewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.sharedPreviewUrl.set(null);
    this.sharedBlob.set(null);
  }

  async onScanFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.runOcr(file);
  }

  async scanSharedOrPick(): Promise<void> {
    const blob = this.sharedBlob();
    if (blob) {
      await this.runOcr(blob);
      return;
    }
    document.getElementById('receipt-scan-input')?.click();
  }

  pickFromGallery(): void {
    document.getElementById('receipt-gallery-input')?.click();
  }

  private async runOcr(image: Blob): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.stage.set('idle');
    const show = (candidates: ReceiptCandidates, pick: ReceiptPick) => {
      this.candidates.set(candidates);
      this.pick.set(pick);
      this.stage.set('review');
      if (!this.sharedPreviewUrl()) {
        this.sharedBlob.set(image);
        this.sharedPreviewUrl.set(URL.createObjectURL(image));
      }
    };
    try {
      const lcd = await readPumpFromBlob(image).catch(() => null);
      if (lcd) {
        show(
          {
            liters: [lcd.liters],
            unitPrice: [lcd.unitPrice],
            total: [lcd.total],
            raw: lcd.raw,
            labels: {
              liters: [lcd.liters],
              unitPrice: [lcd.unitPrice],
              total: [lcd.total],
            },
          },
          { liters: lcd.liters, unitPrice: lcd.unitPrice, total: lcd.total },
        );
        return;
      }
      const text = await ocrReceiptImage(image);
      const candidates = parseReceiptText(text);
      show(candidates, bestReceiptPick(candidates));
    } catch {
      this.error.set(this.i18n.t('fillUp.scanFailed'));
    } finally {
      this.busy.set(false);
    }
  }

  setLiters(v: string): void {
    const n = Number(v);
    this.pick.update((p) => ({
      ...p,
      liters: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  setPrice(v: string): void {
    const n = Number(v);
    this.pick.update((p) => ({
      ...p,
      unitPrice: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  setTotal(v: string): void {
    const n = Number(v);
    this.pick.update((p) => ({
      ...p,
      total: Number.isFinite(n) && n > 0 ? n : undefined,
    }));
  }

  litersStr(): string {
    const n = this.pick().liters;
    return n != null ? String(n) : '';
  }

  priceStr(): string {
    const n = this.pick().unitPrice;
    return n != null ? String(n) : '';
  }

  totalStr(): string {
    const n = this.pick().total;
    return n != null ? String(n) : '';
  }

  /** Apply the pick into the form — never auto-saves. */
  apply(): void {
    this.onApply?.(this.pick());
    this.stage.set('idle');
  }

  discard(): void {
    this.stage.set('idle');
    this.candidates.set(null);
    this.pick.set({});
    this.error.set('');
  }
}
