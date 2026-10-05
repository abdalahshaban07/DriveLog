import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fetchChatReply, isAssistantOnline, usableCoachText } from '../../data/assistant';
import { Db } from '../../data/db';
import { fuelBillWhy, TANK_ECONOMY_FLAT_PCT, type FuelBillReason } from '../../domain/economy';
import { todayDateOnly } from '../../domain/dues';
import { fuelBoard, sparklineGeometry } from '../../domain/fuel-dashboard';
import { contextualFuelTipKey, nextFuelTipKey } from '../../domain/fuel-tips';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

type GradeFilter = FuelGrade | 'all';
type SpendTone = 'none' | 'flat' | 'up' | 'down';
type EconomyTone = 'none' | 'flat' | 'better' | 'worse';

@Component({
  selector: 'app-fuel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, RouterLink, SectionTabs],
  templateUrl: './fuel.html',
  styleUrl: './fuel.scss',
})
export class FuelPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly tabs = FUEL_TABS;

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

  readonly gradeChoices: { id: GradeFilter; labelKey: MsgKey }[] = [
    { id: 'all', labelKey: 'fuel.gradeAll' },
    { id: 'gasoline92', labelKey: 'fillUp.grade.gasoline92' },
    { id: 'gasoline95', labelKey: 'fillUp.grade.gasoline95' },
    { id: 'solar', labelKey: 'fillUp.grade.solar' },
  ];

  readonly board = computed(() => fuelBoard(this.db.fillUps(), this.grade()));

  readonly spark = computed(() => sparklineGeometry(this.board().series));

  readonly filtered = computed(() => {
    const grade = this.grade();
    const fills = this.db.fillUps();
    const list = grade === 'all' ? fills : fills.filter((f) => f.fuelGrade === grade);
    return [...list].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  });

  readonly billWhyKey = computed((): MsgKey | null => {
    const why = fuelBillWhy(this.filtered());
    if (!why) {
      return null;
    }
    return billWhyMessageKey(why.direction, why.reason);
  });

  readonly hasFills = computed(() => this.filtered().length > 0);

  readonly lastFill = computed(() => this.filtered()[0] ?? null);

  readonly recent = computed(() => this.filtered().slice(0, 4));

  onGrade(value: GradeFilter): void {
    this.grade.set(value);
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

  rowL100(id: string): number | null {
    return this.board().l100ByFillId.get(id) ?? null;
  }

  spendTone(): SpendTone {
    const pct = this.board().deltaPct;
    if (pct == null) {
      return 'none';
    }
    if (Math.abs(pct) < TANK_ECONOMY_FLAT_PCT) {
      return 'flat';
    }
    return pct > 0 ? 'up' : 'down';
  }

  spendDeltaLabel(): string {
    const tone = this.spendTone();
    if (tone === 'none') {
      return this.i18n.t('home.monthFuelDelta.none');
    }
    if (tone === 'flat') {
      return this.i18n.t('home.monthFuelDelta.same');
    }
    const abs = this.i18n.formatNumber(Math.abs(this.board().deltaPct ?? 0), {
      maximumFractionDigits: 0,
    });
    return tone === 'up'
      ? this.i18n.t('home.monthFuelDelta.up', { pct: abs })
      : this.i18n.t('home.monthFuelDelta.down', { pct: `-${abs}` });
  }

  economyTone(): EconomyTone {
    const pct = this.board().economyDeltaPct;
    if (pct == null) {
      return 'none';
    }
    if (Math.abs(pct) < TANK_ECONOMY_FLAT_PCT) {
      return 'flat';
    }
    return pct > 0 ? 'worse' : 'better';
  }

  economyCaption(): string | null {
    const tone = this.economyTone();
    if (tone === 'none') {
      return null;
    }
    if (tone === 'flat') {
      return this.i18n.t('fuel.vsUsualFlat');
    }
    const abs = this.i18n.formatNumber(Math.abs(this.board().economyDeltaPct ?? 0), {
      maximumFractionDigits: 0,
    });
    return tone === 'worse'
      ? this.i18n.t('fuel.vsUsualWorse', { pct: abs })
      : this.i18n.t('fuel.vsUsualBetter', { pct: abs });
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

      const nextKey = prevKey ? nextFuelTipKey(prevKey, this.db) : contextualFuelTipKey(this.db);
      let text = this.i18n.t(nextKey);
      let source: 'local' | 'ai' = 'local';

      if (this.online()) {
        const question = this.i18n.t('fuel.tip.prompt');
        const reply = await fetchChatReply(this.db, question, this.i18n.language(), (key, params) =>
          this.i18n.t(key as MsgKey, params),
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

function billWhyMessageKey(
  direction: 'up' | 'down',
  reason: FuelBillReason,
): MsgKey {
  if (direction === 'up') {
    switch (reason) {
      case 'price':
        return 'fuel.billWhy.up.price';
      case 'distance':
        return 'fuel.billWhy.up.distance';
      case 'consumption':
        return 'fuel.billWhy.up.consumption';
      case 'liters':
        return 'fuel.billWhy.up.liters';
      default: {
        const exhaustive: never = reason;
        return exhaustive;
      }
    }
  }
  switch (reason) {
    case 'price':
      return 'fuel.billWhy.down.price';
    case 'distance':
      return 'fuel.billWhy.down.distance';
    case 'consumption':
      return 'fuel.billWhy.down.consumption';
    case 'liters':
      return 'fuel.billWhy.down.liters';
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
