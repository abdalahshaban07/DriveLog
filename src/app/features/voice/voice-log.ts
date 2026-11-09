import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import type { FuelGrade } from '../../domain/models';
import { PrimaryButton } from '../../ui/primary-button';
import { VoiceLogState } from './voice-log-state';

const GRADE_KEYS: Record<FuelGrade, MsgKey> = {
  gasoline92: 'home.fuel92',
  gasoline95: 'home.fuel95',
  diesel: 'home.fuelDiesel',
  solar: 'home.fuelSolar',
  custom: 'fillUp.lastPaid',
};

/** Mic toggle + live transcript + confirm/cancel review. State: VoiceLogState. */
@Component({
  selector: 'app-voice-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PrimaryButton],
  templateUrl: './voice-log.html',
  styleUrl: './voice-log.scss',
})
export class VoiceLog {
  readonly i18n = inject(I18n);
  readonly voice = inject(VoiceLogState);

  gradeLabel(g: FuelGrade): string {
    return this.i18n.t(GRADE_KEYS[g]);
  }

  toggle(): void {
    if (this.voice.listening()) {
      this.voice.stop();
    } else {
      this.voice.start();
    }
  }
}