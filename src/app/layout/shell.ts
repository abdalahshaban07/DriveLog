import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  readonly i18n = inject(I18n);
  readonly db = inject(Db);
  private readonly router = inject(Router);
  private readonly install = inject(InstallPwa);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly showNav = computed(() => !this.url().startsWith('/setup'));
  readonly updateReady = computed(() => this.install.updateReady());

  reload(): void {
    this.install.applyUpdate();
  }
}
