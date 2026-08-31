import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Db } from '../data/db';
import { I18n } from '../i18n/i18n';
import { InstallPwa } from '../pwa/install-pwa';
import { WhatsNew } from '../pwa/whats-new';
import { UpdateModal } from '../ui/update-modal';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, UpdateModal],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  readonly whatsNew = inject(WhatsNew);
  private readonly router = inject(Router);
  private readonly install = inject(InstallPwa);

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
  readonly updateReady = computed(() => this.install.updateReady() && !this.updateDismissed());
  readonly modalLines = computed(() => this.whatsNew.lines());
  readonly releaseId = computed(() => this.whatsNew.notes()?.id ?? '');

  reload(): void {
    void this.whatsNew.dismiss();
    void this.install.applyUpdate();
  }

  dismissUpdate(): void {
    this.updateDismissed.set(true);
  }
}
