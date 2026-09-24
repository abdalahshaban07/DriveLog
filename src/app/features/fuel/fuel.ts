import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline } from '../../data/assistant';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import { tankEconomyVsAvg } from '../../domain/economy';
import { fuelDashboardMetrics } from '../../domain/fuel-dashboard';
import { contextualFuelTipKey, nextFuelTipKey } from '../../domain/local-coach';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { SelectField, type SelectOption } from '../../ui/select-field';

type GradeFilter = FuelGrade | 'all';

@Component({
  selector: 'app-fuel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, SelectField],
  templateUrl: './fuel.html',
  styleUrl: './fuel.scss',
})
export class FuelPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);

  readonly grade = signal<GradeFilter>('all');
  readonly tip = signal('');
  readonly tipKey = signal<MsgKey | null>(null);
  readonly tipBusy = signal(false);
  readonly tipSource = signal<'local' | 'ai'>('local');
  readonly tipFlash = signal(false);

  readonly online = computed(() => isAssistantOnline(this.db));

  readonly tipHintKey = computed<MsgKey>(() => {
    if (this.tipSource() === 'ai') {
      return 'fuel.tip.sourceRemote';
    }
    if (!this.online()) {
      return 'fuel.tip.sourceOffline';
    }
    return 'fuel.tip.source';
  });

  private readonly gradeOptions: { id: GradeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'fuel.gradeAll' },
    { id: 'gasoline92', labelKey: 'fillUp.grade.gasoline92' },
    { id: 'gasoline95', labelKey: 'fillUp.grade.gasoline95' },
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
  ];

  readonly gradeSelectOptions = computed<SelectOption[]>(() =>
    this.gradeOptions.map((opt) => ({
      value: opt.id,
      label: this.i18n.t(opt.labelKey),
    })),
  );

  readonly metrics = computed(() =>
    fuelDashboardMetrics(this.db.fillUps(), this.grade()),
  );

  readonly lastFill = computed(() => {
    const sorted = [...this.db.fillUps()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    return sorted[0] ?? null;
  });

  onGrade(value: string): void {
    this.grade.set(value as GradeFilter);
  }

  gradeLabel(grade: FuelGrade): string {
    const keys: Record<FuelGrade, MsgKey> = {
      gasoline92: 'fillUp.grade.gasoline92',
      gasoline95: 'fillUp.grade.gasoline95',
      diesel: 'fillUp.grade.diesel',
      solar: 'fillUp.grade.solar',
      custom: 'fillUp.grade.custom',
    };
    return this.i18n.t(keys[grade]);
  }

  constructor() {
    void this.loadTip(false);
  }

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  formatMetric(value: number | null, unitKey: MsgKey): string {
    if (value == null || !Number.isFinite(value)) {
      return '—.—';
    }
    return this.i18n.formatUnit(value, unitKey, 1);
  }

  async loadTip(force = true): Promise<void> {
    this.tipBusy.set(true);
    const prevKey = this.tipKey();
    const today = todayDateOnly();
    const settings = this.db.settings();

    try {
      if (
        !force &&
        this.online() &&
        settings.fuelTipText &&
        settings.fuelTipDay === today
      ) {
        this.tip.set(settings.fuelTipText);
        this.tipSource.set('ai');
        this.tipKey.set(null);
        return;
      }

      const nextKey = prevKey
        ? nextFuelTipKey(prevKey, this.db)
        : contextualFuelTipKey(this.db);
      let text = this.i18n.t(nextKey);
      let source: 'local' | 'ai' = 'local';

      if (this.online()) {
        const vsAvg = tankEconomyVsAvg(this.db.fillUps());
        let question = this.i18n.t('fuel.tip.prompt');
        if (vsAvg) {
          question += ` Current L/100km=${vsAvg.currentL100.toFixed(1)}. Usual L/100km=${vsAvg.baselineL100.toFixed(1)}. Direction=${vsAvg.direction} (${vsAvg.deltaPct.toFixed(0)}%).`;
        }
        const reply = await fetchChatReply(
          this.db,
          question,
          this.i18n.language(),
          (key, params) => this.i18n.t(key as MsgKey, params),
        );
        if (reply.source === 'remote' && reply.text.trim()) {
          text = reply.text.trim();
          source = 'ai';
          await this.db.updateSettings({
            fuelTipText: text,
            fuelTipDay: today,
          });
        }
      }

      this.tipKey.set(source === 'local' ? nextKey : null);
      this.tip.set(text);
      this.tipSource.set(source);
      if (prevKey && source === 'local' && nextKey !== prevKey) {
        this.tipFlash.set(true);
        window.setTimeout(() => this.tipFlash.set(false), 600);
      }
    } finally {
      this.tipBusy.set(false);
    }
  }
}
