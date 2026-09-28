import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline, usableCoachText } from '../../data/assistant';
import { Db } from '../../data/db';
import { todayDateOnly } from '../../domain/dues';
import { fuelDashboardMetrics } from '../../domain/fuel-dashboard';
import { contextualFuelTipKey, nextFuelTipKey } from '../../domain/fuel-tips';
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
  /** Online switch is on, but this load got no usable coach reply. */
  readonly tipRemoteMiss = signal(false);

  readonly online = computed(() => isAssistantOnline(this.db));

  readonly tipHintKey = computed<MsgKey>(() => {
    if (this.tipSource() === 'ai') {
      return 'fuel.tip.sourceRemote';
    }
    if (!this.online()) {
      return 'fuel.tip.sourceOffline';
    }
    if (this.tipRemoteMiss()) {
      return 'fuel.tip.sourceUnreachable';
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
      const cached =
        !force && this.online() && settings.fuelTipText && settings.fuelTipDay === today
          ? usableCoachText(settings.fuelTipText, this.i18n.language())
          : null;
      if (cached) {
        this.tip.set(cached);
        this.tipSource.set('ai');
        this.tipKey.set(null);
        this.tipRemoteMiss.set(false);
        return;
      }

      const nextKey = prevKey
        ? nextFuelTipKey(prevKey, this.db)
        : contextualFuelTipKey(this.db);
      let text = this.i18n.t(nextKey);
      let source: 'local' | 'ai' = 'local';

      if (this.online()) {
        const question = this.i18n.t('fuel.tip.prompt');
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
      this.tipRemoteMiss.set(this.online() && source !== 'ai');
      if (prevKey && source === 'local' && nextKey !== prevKey) {
        this.tipFlash.set(true);
        window.setTimeout(() => this.tipFlash.set(false), 600);
      }
    } finally {
      this.tipBusy.set(false);
    }
  }
}
