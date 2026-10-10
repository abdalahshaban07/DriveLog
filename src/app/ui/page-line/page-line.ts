import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Db } from '../../data/db';
import { localPageLine, pageLineBag, polishPageLine } from '../../data/page-line';
import type { PageLineId } from '../../domain/page-line';
import type { MsgKey } from '../../i18n/en';
import { I18n } from '../../i18n/i18n';

@Component({
  selector: 'app-page-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (text(); as line) { <p class="line">{{ line }}</p> }`,
  styles: `
    :host {
      display: block;
    }

    .line {
      margin: 0;
      max-inline-size: 28rem;
      color: var(--muted);
      font-size: 0.92rem;
      font-weight: 500;
      line-height: 1.4;
    }
  `,
})
export class PageLine {
  readonly page = input.required<PageLineId>();
  /** Reports tab spend. Other pages leave these at 0. */
  readonly fuelSpend = input(0);
  readonly maintSpend = input(0);
  readonly totalSpend = input(0);

  private readonly db = inject(Db);
  private readonly i18n = inject(I18n);
  readonly text = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const page = this.page();
      const lang = this.i18n.language();
      const bag = pageLineBag(this.db, (key, params) => this.i18n.t(key as MsgKey, params), {
        fuel: this.fuelSpend(),
        maintenance: this.maintSpend(),
        total: this.totalSpend(),
      });
      const local = localPageLine(page, bag, (key, params) => this.i18n.t(key, params), lang);
      this.text.set(local);
      if (!local) return;
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      void polishPageLine({
        db: this.db,
        page,
        source: local,
        lang,
        day: bag.today,
        signal: controller.signal,
      }).then((next) => {
        if (!controller.signal.aborted) this.text.set(next);
      });
    });
  }
}
