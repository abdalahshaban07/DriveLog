import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../i18n/i18n';
import {
  VOICE_RECOGNITION,
  VoiceLogState,
  type VoiceRecognition,
  type VoiceResultEvent,
} from './voice-log-state';

function makeFake(): VoiceRecognition {
  return {
    lang: '',
    continuous: false,
    interimResults: false,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onresult: null,
    onerror: null,
    onend: null,
  };
}

function resultEvent(transcript: string, isFinal: boolean): VoiceResultEvent {
  return { resultIndex: 0, results: [{ isFinal, 0: { transcript } }] };
}

describe('VoiceLogState', () => {
  let state: VoiceLogState;
  let recs: VoiceRecognition[];
  let lang: 'en' | 'ar';
  let supported: boolean;

  const latest = () => recs[recs.length - 1]!;

  beforeEach(async () => {
    recs = [];
    lang = 'en';
    supported = true;
    await TestBed.configureTestingModule({
      providers: [
        VoiceLogState,
        {
          provide: VOICE_RECOGNITION,
          useValue: () => {
            if (!supported) {
              return null;
            }
            const r = makeFake();
            recs.push(r);
            return r;
          },
        },
        {
          provide: I18n,
          useValue: { t: (k: string) => k, language: () => lang },
        },
      ],
    }).compileComponents();
    state = TestBed.inject(VoiceLogState);
  });

  it('reports support from the platform seam', () => {
    expect(state.supported()).toBe(true);
  });

  it('reports unsupported and no-ops when the browser lacks speech', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        VoiceLogState,
        { provide: VOICE_RECOGNITION, useValue: () => null },
        { provide: I18n, useValue: { t: (k: string) => k, language: () => 'en' } },
      ],
    }).compileComponents();
    const s = TestBed.inject(VoiceLogState);
    expect(s.supported()).toBe(false);
    s.start();
    expect(s.listening()).toBe(false);
    expect(s.stage()).toBe('idle');
  });

  it('starts listening with the English locale', () => {
    state.start();
    expect(state.listening()).toBe(true);
    expect(state.stage()).toBe('listening');
    expect(latest().lang).toBe('en-US');
    expect(latest().start).toHaveBeenCalled();
  });

  it('uses the Arabic locale when the UI is Arabic', () => {
    lang = 'ar';
    state.start();
    expect(latest().lang).toBe('ar-EG');
  });

  it('parses a final utterance into a review on end', () => {
    state.start();
    latest().onresult?.(resultEvent('40 liters and 500 km petrol 95', true));
    expect(state.transcript()).toContain('40 liters');
    latest().onend?.();
    expect(state.listening()).toBe(false);
    expect(state.stage()).toBe('review');
    expect(state.parsed()).toEqual({ liters: 40, distanceKm: 500, fuelGrade: 'gasoline95' });
  });

  it('confirms into the host form and resets', () => {
    const onApply = vi.fn();
    state.onApply = onApply;
    state.start();
    latest().onresult?.(resultEvent('35 liters, 420 km', true));
    latest().onend?.();
    state.confirm();
    expect(onApply).toHaveBeenCalledWith({ liters: 35, distanceKm: 420 });
    expect(state.stage()).toBe('idle');
    expect(state.parsed()).toBeNull();
  });

  it('discards a late result after cancel mid-listening', () => {
    state.start();
    state.cancel();
    expect(state.listening()).toBe(false);
    latest().onresult?.(resultEvent('40 liters', true));
    latest().onend?.();
    expect(state.stage()).toBe('idle');
    expect(state.transcript()).toBe('');
    expect(state.parsed()).toBeNull();
  });

  it('maps a denied microphone to a friendly error and ignores the trailing end', () => {
    state.start();
    latest().onerror?.({ error: 'not-allowed' });
    expect(state.error()).toBe('voice.denied');
    expect(state.listening()).toBe(false);
    latest().onend?.();
    expect(state.error()).toBe('voice.denied');
    expect(state.stage()).toBe('idle');
  });

  it('asks to retry when nothing numeric was heard', () => {
    state.start();
    latest().onresult?.(resultEvent('hello there', true));
    latest().onend?.();
    expect(state.error()).toBe('voice.noMatch');
    expect(state.stage()).toBe('idle');
  });

  it('stop finishes gracefully so the utterance can be reviewed', () => {
    state.start();
    latest().onresult?.(resultEvent('40 liters', true));
    state.stop();
    expect(latest().stop).toHaveBeenCalled();
    latest().onend?.();
    expect(state.stage()).toBe('review');
  });

  it('cancel in review discards the parsed values', () => {
    state.start();
    latest().onresult?.(resultEvent('40 liters', true));
    latest().onend?.();
    state.cancel();
    expect(state.parsed()).toBeNull();
    expect(state.stage()).toBe('idle');
  });
});