import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import { fuelBillWhy, TANK_ECONOMY_FLAT_PCT, type FuelBillReason } from '../../domain/economy';
import { fuelBoard, sparklineGeometry } from '../../domain/fuel-dashboard';
import { contextualFuelTipKey } from '../../domain/fuel-tips';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

type GradeFilter = FuelGrade | 'all';
type SpendTone = 'none' | 'flat' | 'up' | 'down';
type EconomyTone = 'none' | 'flat' | 'better' | 'worse';

const GRADE_ORDER: readonly FuelGrade[] = [
  'gasoline92',
  'gasoline95',
  'solar',
  'diesel',
  'custom',
];

@Component({
  selector: 'app-fuel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, PageLine, RouterLink, SectionTabs],
  templateUrl: './fuel.html',
  styleUrl: './fuel.scss',
})
export class FuelPage {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly tabs = FUEL_TABS;

  readonly grade = signal<GradeFilter>('all');

  readonly gradeOptions = computed(() => {
    const present = new Set<FuelGrade>();
    for (const fill of this.db.fillUps()) {
      if (fill.fuelGrade) {
        present.add(fill.fuelGrade);
      }
    }
    const grades = GRADE_ORDER.filter((id) => present.has(id));
    if (grades.length < 2) {
      return [];
    }
    return [
      { id: 'all' as const, labelKey: 'fuel.gradeAll' as const },
      ...grades.map((id) => ({ id, labelKey: gradeLabelKey(id) })),
    ];
  });

  readonly activeGrade = computed((): GradeFilter => {
    const selected = this.grade();
    if (this.gradeOptions().some((option) => option.id === selected)) {
      return selected;
    }
    return 'all';
  });

  readonly board = computed(() => fuelBoard(this.db.fillUps(), this.activeGrade()));

  readonly spark = computed(() => sparklineGeometry(this.board().series));

  readonly filtered = computed(() => {
    const grade = this.activeGrade();
    const fills = this.db.fillUps();
    const list = grade === 'all' ? fills : fills.filter((fill) => fill.fuelGrade === grade);
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

  readonly recent = computed(() => this.filtered().slice(0, 4));

  /** A tip that only restates the economy line stays off the page. */
  readonly tipKey = computed((): MsgKey | null => {
    const key = contextualFuelTipKey(this.db);
    if (
      key === 'fuel.tip.betterThanUsual' ||
      key === 'fuel.tip.worseThanUsual' ||
      key === 'fuel.tip.highConsumption'
    ) {
      return null;
    }
    return key;
  });

  onGrade(value: GradeFilter): void {
    this.grade.set(value);
  }

  gradeLabel(grade: FuelGrade): string {
    return this.i18n.t(gradeLabelKey(grade));
  }

  formatMoney(value: number): string {
    return this.i18n.formatMoney(value, this.db.settings().currency, 2);
  }

  formatL100(value: number | null): string {
    if (value == null || !Number.isFinite(value)) {
      return '—.—';
    }
    return this.i18n.formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
}

function gradeLabelKey(grade: FuelGrade): MsgKey {
  switch (grade) {
    case 'gasoline92':
      return 'fillUp.grade.gasoline92';
    case 'gasoline95':
      return 'fillUp.grade.gasoline95';
    case 'diesel':
      return 'fillUp.grade.diesel';
    case 'solar':
      return 'fillUp.grade.solar';
    case 'custom':
      return 'fillUp.grade.custom';
    default: {
      const exhaustive: never = grade;
      return exhaustive;
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
