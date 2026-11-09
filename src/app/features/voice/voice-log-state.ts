import { Injectable, InjectionToken, OnDestroy, inject, signal } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { hasVoiceFill, parseVoiceFill, type VoiceFill } from '../../domain/voice-fill-parser';

/** Minimal shape of the browser SpeechRecognition we drive. */
export type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: VoiceResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type VoiceResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

export type VoiceRecognitionFactory = () => VoiceRecognition | null;

/** Platform seam; null when the browser has no speech recognition. */
export const VOICE_RECOGNITION = new InjectionToken<VoiceRecognitionFactory>('VoiceRecognition', {
  providedIn: 'root',
  factory: () => () => {
    const g = globalThis as unknown as {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };
    const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
    return Ctor ? new Ctor() : null;
  },
});

/**
 * Voice quick-log state. A cancel token discards late recognition callbacks so
 * aborting never pops a review the user dismissed. Confirm fills the host form;
 * nothing is ever saved here.
 */
@Injectable()
export class VoiceLogState implements OnDestroy {
  private readonly i18n = inject(I18n);
  private readonly make = inject(VOICE_RECOGNITION);

  readonly supported = signal(false);
  readonly listening = signal(false);
  readonly transcript = signal('');
  readonly error = signal<MsgKey | ''>('');
  readonly parsed = signal<VoiceFill | null>(null);
  readonly stage = signal<'idle' | 'listening' | 'review'>('idle');

  private rec: VoiceRecognition | null = null;
  private token = 0;
  private finalText = '';
  private errored = false;

  /** The host installs this to merge a confirmed utterance into its form. */
  onApply: ((fill: VoiceFill) => void) | null = null;

  constructor() {
    this.supported.set(this.make() !== null);
  }

  start(): void {
    if (!this.supported() || this.listening()) {
      return;
    }
    const rec = this.make();
    if (!rec) {
      this.supported.set(false);
      return;
    }
    const token = ++this.token;
    this.rec = rec;
    this.finalText = '';
    this.errored = false;
    this.error.set('');
    this.transcript.set('');
    this.parsed.set(null);
    this.stage.set('listening');
    this.listening.set(true);
    rec.lang = this.i18n.language() === 'ar' ? 'ar-EG' : 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (token !== this.token) {
        return;
      }
      let interim = '';
      let final = this.finalText;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      this.finalText = final;
      this.transcript.set(`${final} ${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (token !== this.token) {
        return;
      }
      this.errored = true;
      this.error.set(this.mapError(e.error));
      this.listening.set(false);
      this.stage.set('idle');
    };
    rec.onend = () => {
      if (token !== this.token || this.errored) {
        return;
      }
      this.listening.set(false);
      this.rec = null;
      const parsed = parseVoiceFill(this.finalText || this.transcript());
      if (hasVoiceFill(parsed)) {
        this.parsed.set(parsed);
        this.stage.set('review');
      } else {
        this.error.set('voice.noMatch');
        this.stage.set('idle');
      }
    };
    try {
      rec.start();
    } catch {
      this.listening.set(false);
      this.stage.set('idle');
      this.error.set('voice.failed');
    }
  }

  /** Finish listening gracefully so the utterance is parsed into a review. */
  stop(): void {
    try {
      this.rec?.stop();
    } catch {
      /* already ended */
    }
  }

  /** Discard everything, including any in-flight recognition result. */
  cancel(): void {
    this.token++;
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* already ended */
    }
    this.listening.set(false);
    this.stage.set('idle');
    this.transcript.set('');
    this.parsed.set(null);
    this.error.set('');
    this.finalText = '';
  }

  /** Apply the parsed utterance into the host form — never auto-saves. */
  confirm(): void {
    const p = this.parsed();
    if (!p || !hasVoiceFill(p)) {
      return;
    }
    this.onApply?.(p);
    this.cancel();
  }

  private mapError(code: string): MsgKey {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'voice.denied';
      case 'no-speech':
        return 'voice.noSpeech';
      case 'audio-capture':
        return 'voice.noMic';
      case 'network':
        return 'voice.network';
      default:
        return 'voice.failed';
    }
  }

  ngOnDestroy(): void {
    this.token++;
    try {
      this.rec?.abort();
    } catch {
      /* already ended */
    }
  }
}