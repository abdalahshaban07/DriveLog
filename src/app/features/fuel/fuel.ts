import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Db } from '../../data/db';
import {
  EFFICIENCY_WORSE_THRESHOLD,
  fuelBillWhy,
  TANK_ECONOMY_FLAT_PCT,
  type FuelBillReason,
} from '../../domain/economy';
import { fuelBoard, SPARK_H, SPARK_W, sparklineGeometry } from '../../domain/fuel-dashboard';
import { FUEL_GLIMPSE_COUNT, fuelGlimpse, type FuelGlimpse } from '../../domain/fuel-glimpse';
import type { FuelGrade } from '../../domain/models';
import { I18n } from '../../i18n/i18n';
import type { MsgKey } from '../../i18n/en';
import { PageHeader } from '../../ui/page-header';
import { PageLine } from '../../ui/page-line/page-line';
import { FUEL_TABS, SectionTabs } from '../../ui/section-tabs/section-tabs';

type GradeFilter = FuelGrade | 'all';
type SpendTone = 'none' | 'flat' | 'up' | 'down';
type EconomyTone = 'none' | 'flat' | 'better' | 'worse';

const GRADE_ORDER: readonly FuelGrade[] = ['gasoline92', 'gasoline95', 'solar', 'diesel', 'custom'];

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

  readonly lineGrade = computed((): FuelGrade | '' => {
    const grade = this.activeGrade();
    return grade === 'all' ? '' : grade;
  });

  readonly board = computed(() => fuelBoard(this.db.fillUps(), this.activeGrade()));

  readonly spark = computed(() =>
    sparklineGeometry(this.board().series, SPARK_W, SPARK_H, this.board().overallL100),
  );

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

  readonly recent = computed(() => this.filtered().slice(0, FUEL_GLIMPSE_COUNT));

  readonly glimpse = computed(() => fuelGlimpse(this.filtered()));

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

  billLine(): string | null {
    const tone = this.spendTone();
    if (tone === 'none') {
      return null;
    }
    if (tone === 'flat') {
      return this.i18n.t('fuel.billLine.flat');
    }
    const pct = this.i18n.formatNumber(Math.abs(this.board().deltaPct ?? 0), {
      maximumFractionDigits: 0,
    });
    const why = this.billWhyKey();
    if (!why) {
      return this.i18n.t(tone === 'up' ? 'fuel.billLine.up' : 'fuel.billLine.down', { pct });
    }
    return this.i18n.t(why, { pct });
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

  economyLine(): string {
    const board = this.board();
    const value = this.formatL100(board.lastL100 ?? board.overallL100);
    const tone = this.economyTone();
    if (tone === 'none') {
      return this.i18n.t('fuel.economyLine', { value });
    }
    if (tone === 'flat') {
      return this.i18n.t('fuel.economyLineFlat', { value });
    }
    const pct = this.i18n.formatNumber(Math.abs(board.economyDeltaPct ?? 0), {
      maximumFractionDigits: 0,
    });
    return this.i18n.t(tone === 'worse' ? 'fuel.economyLineWorse' : 'fuel.economyLineBetter', {
      value,
      pct,
    });
  }

  formatKm(value: number): string {
    return this.i18n.formatNumber(value, { maximumFractionDigits: value >= 10 ? 0 : 1 });
  }

  thirsty(l100: number): boolean {
    const usual = this.board().overallL100;
    return usual != null && usual > 0 && l100 > usual * (1 + EFFICIENCY_WORSE_THRESHOLD);
  }

  glimpseLine(): string | null {
    const glimpse = this.glimpse();
    if (!glimpse) {
      return null;
    }
    return glimpseText(glimpse, this.i18n);
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

function billWhyMessageKey(direction: 'up' | 'down', reason: FuelBillReason): MsgKey {
  if (direction === 'up') {
    switch (reason) {
      case 'price':
        return 'fuel.billLine.up.price';
      case 'distance':
        return 'fuel.billLine.up.distance';
      case 'consumption':
        return 'fuel.billLine.up.consumption';
      case 'liters':
        return 'fuel.billLine.up.liters';
      default: {
        const exhaustive: never = reason;
        return exhaustive;
      }
    }
  }
  switch (reason) {
    case 'price':
      return 'fuel.billLine.down.price';
    case 'distance':
      return 'fuel.billLine.down.distance';
    case 'consumption':
      return 'fuel.billLine.down.consumption';
    case 'liters':
      return 'fuel.billLine.down.liters';
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function glimpseText(glimpse: FuelGlimpse, i18n: I18n): string {
  switch (glimpse.kind) {
    case 'rhythm':
      return i18n.t('fuel.glimpse.rhythm', {
        recent: glimpse.recentDays,
        usual: glimpse.usualDays,
      });
    case 'spend':
      return i18n.t('fuel.glimpse.spend', {
        date: i18n.formatDate(glimpse.date, { day: 'numeric', month: 'long' }),
        pct: i18n.formatNumber(glimpse.sharePct, { maximumFractionDigits: 0 }),
        count: glimpse.count,
      });
    case 'consumption':
      return i18n.t(
        glimpse.direction === 'higher' ? 'fuel.glimpse.useHigher' : 'fuel.glimpse.useLower',
        {
          count: glimpse.count,
          delta: i18n.formatNumber(glimpse.deltaL100, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        },
      );
    case 'price':
      return i18n.t('fuel.glimpse.price', {
        now: i18n.formatNumber(glimpse.now, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        then: i18n.formatNumber(glimpse.then, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      });
    case 'steady':
      return i18n.t('fuel.glimpse.steady', {
        count: glimpse.count,
        l100: i18n.formatNumber(glimpse.l100, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      });
    default: {
      const exhaustive: never = glimpse;
      return exhaustive;
    }
  }
}
