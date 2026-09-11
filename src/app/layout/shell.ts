import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, map, skip, startWith } from 'rxjs';
import { Db } from '../data/db';
import { I18n } from '../i18n/i18n';
import { HolidayReminder } from '../pwa/holiday-reminder';
import { InstallPwa } from '../pwa/install-pwa';
import { WhatsNew } from '../pwa/whats-new';
import { UpdateModal } from '../ui/update-modal';
import { WhatsNewToast } from '../ui/whats-new-toast';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UpdateModal, WhatsNewToast],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly whatsNew = inject(WhatsNew);
  private readonly router = inject(Router);
  private readonly install = inject(InstallPwa);
  private readonly holidayReminder = inject(HolidayReminder);
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');

  readonly updateDismissed = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly showNav = computed(() => !this.url().startsWith('/setup'));
  readonly updateReady = computed(
    () => this.install.updateReady() && !this.updateDismissed(),
  );
  readonly showUpdate = this.updateReady;
  readonly showNotes = computed(
    () =>
      !this.updateReady() &&
      (this.whatsNew.visible() || this.whatsNew.manualOpen()),
  );
  readonly modalTitle = computed(() => this.i18n.t('update.available'));
  readonly releaseId = computed(() => this.whatsNew.displayVersion);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const el = this.main()?.nativeElement;
        if (el) {
          el.scrollTop = 0;
        }
      });
    afterNextRender(() => {
      void this.holidayReminder.check();
    });
  }

  reload(): void {
    void this.install.applyUpdate();
  }

  dismissUpdate(): void {
    this.updateDismissed.set(true);
  }

  dismissNotes(): void {
    void this.whatsNew.dismiss();
  }
}
