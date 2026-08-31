import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { MotionPolicy } from '../motion/motion-policy';

@Component({
  selector: 'app-fuel-tank-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (useFallback()) {
      <div class="tank-fallback" role="img" [attr.aria-label]="label()">
        <div class="tank-fallback__shell">
          <div class="tank-fallback__liquid" [style.height.%]="fillPct()"></div>
        </div>
        <span class="tank-fallback__pct">{{ fillPct() }}%</span>
      </div>
    } @else {
      <canvas #canvas class="tank-canvas" role="img" [attr.aria-label]="label()"></canvas>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .tank-canvas {
      display: block;
      width: 100%;
      height: 7.5rem;
      border-radius: calc(var(--radius) - 4px);
    }
    .tank-fallback {
      display: grid;
      gap: var(--space-2);
      justify-items: center;
      padding: var(--space-3);
      border-radius: calc(var(--radius) - 4px);
      background: var(--well);
      border: 1px solid var(--hairline);
    }
    .tank-fallback__shell {
      position: relative;
      width: 4.5rem;
      height: 5.5rem;
      border: 2px solid var(--petrol-muted);
      border-radius: calc(var(--radius) - 6px);
      overflow: hidden;
      background: color-mix(in srgb, var(--petrol) 12%, var(--well));
    }
    .tank-fallback__liquid {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--mint) 70%, var(--petrol-muted)),
        var(--petrol-muted)
      );
      transition: height var(--motion-fast) var(--ease-out);
    }
    .tank-fallback__pct {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: var(--muted);
      font-size: 0.85rem;
    }
  `,
})
export class FuelTankCanvas implements AfterViewInit {
  readonly liters = input(0);
  readonly tankFull = input(false);
  readonly maxLiters = input(50);

  private readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private renderer: import('three').WebGLRenderer | null = null;
  private liquid: import('three').Mesh | null = null;
  private rim: import('three').MeshStandardMaterial | null = null;
  private raf = 0;
  private displayedFill = 0;
  private targetFill = 0;
  private wobble = 0;
  private wobbleVel = 0;
  private mounted = false;
  private visible = true;
  private needsFrame = false;

  readonly fillRatio = computed(() => {
    if (this.tankFull()) {
      return 1;
    }
    const max = Math.max(this.maxLiters(), 1);
    return Math.min(this.liters() / max, 0.85);
  });

  readonly fillPct = computed(() => Math.round(this.fillRatio() * 100));
  readonly label = computed(() =>
    this.i18n.t('fillUp.tankVisualLabel', {
      liters: this.liters(),
      pct: this.fillPct(),
    }),
  );
  readonly useFallback = signal(false);

  constructor() {
    this.useFallback.set(this.policy.prefersReducedMotion());
    effect(() => {
      const ratio = this.fillRatio();
      const full = this.tankFull();
      this.targetFill = full ? 1 : ratio;
      if (!this.mounted || this.useFallback()) {
        return;
      }
      if (full) {
        this.targetFill = 1.05;
        window.setTimeout(() => {
          this.targetFill = 1;
          this.flashRim();
        }, 180);
      }
      this.triggerWobble();
      this.requestFrame();
    });
    this.destroyRef.onDestroy(() => this.dispose());
    if (typeof document !== 'undefined') {
      const onVis = () => {
        this.visible = document.visibilityState === 'visible';
        if (!this.visible) {
          this.cancelFrame();
        }
      };
      document.addEventListener('visibilitychange', onVis);
      this.destroyRef.onDestroy(() =>
        document.removeEventListener('visibilitychange', onVis),
      );
    }
  }

  ngAfterViewInit(): void {
    if (this.useFallback() || !this.policy.claimWebGL('fillUpTank')) {
      this.useFallback.set(true);
      return;
    }
    void this.initThree();
  }

  private async initThree(): Promise<void> {
    const el = this.canvasRef()?.nativeElement;
    if (!el) {
      this.useFallback.set(true);
      return;
    }
    try {
      const THREE = await import('three');
      const scene = new THREE.Scene();
      const w = el.clientWidth || 280;
      const h = el.clientHeight || 120;
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 20);
      camera.position.set(0, 0.2, 4.2);

      const renderer = new THREE.WebGLRenderer({
        canvas: el,
        alpha: true,
        antialias: true,
      });
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const shellGeo = new THREE.BoxGeometry(1.6, 2.2, 0.9);
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x1a5c5c,
        transparent: true,
        opacity: 0.25,
        metalness: 0.2,
        roughness: 0.6,
      });
      scene.add(new THREE.Mesh(shellGeo, shellMat));

      const liquidGeo = new THREE.BoxGeometry(1.35, 2, 0.75);
      const liquidMat = new THREE.MeshStandardMaterial({
        color: 0x5cdba8,
        emissive: 0x0f4545,
        emissiveIntensity: 0.35,
        metalness: 0.1,
        roughness: 0.45,
      });
      const liquid = new THREE.Mesh(liquidGeo, liquidMat);
      liquid.position.y = -1.1;
      scene.add(liquid);

      const rimGeo = new THREE.TorusGeometry(0.85, 0.04, 8, 32);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x7aecc0,
        emissive: 0x5cdba8,
        emissiveIntensity: 0,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.05;
      scene.add(rim);

      const light = new THREE.DirectionalLight(0xffffff, 1.1);
      light.position.set(2, 4, 3);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.45));

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.liquid = liquid;
      this.rim = rimMat;
      this.mounted = true;
      this.displayedFill = 0;
      this.targetFill = this.fillRatio();
      this.requestFrame();

      const onResize = () => {
        const nw = el.clientWidth || w;
        const nh = el.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
        this.requestFrame();
      };
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    } catch {
      this.policy.releaseWebGL('fillUpTank');
      this.useFallback.set(true);
    }
  }

  private triggerWobble(): void {
    this.wobbleVel += 0.12;
    this.requestFrame();
  }

  private flashRim(): void {
    if (!this.rim) {
      return;
    }
    this.rim.emissiveIntensity = 0.8;
    window.setTimeout(() => {
      if (this.rim) {
        this.rim.emissiveIntensity = 0;
      }
      this.requestFrame();
    }, 280);
  }

  private requestFrame(): void {
    if (!this.visible || this.useFallback()) {
      return;
    }
    this.needsFrame = true;
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => this.tick());
    }
  }

  private cancelFrame(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick(): void {
    this.raf = 0;
    if (!this.renderer || !this.liquid || !this.scene || !this.camera) {
      return;
    }

    const diff = this.targetFill - this.displayedFill;
    const moving = Math.abs(diff) > 0.002 || Math.abs(this.wobbleVel) > 0.001;
    if (moving) {
      this.displayedFill += diff * 0.18;
      this.wobbleVel += -this.wobble * 0.08 - this.wobbleVel * 0.14;
      this.wobble += this.wobbleVel;
    } else {
      this.displayedFill = this.targetFill;
      this.wobble = 0;
      this.wobbleVel = 0;
    }

    const h = Math.max(0.05, this.displayedFill * 2);
    this.liquid.scale.y = h;
    this.liquid.position.y = -1.1 + (h - 1) * 0.5;
    this.liquid.rotation.z = this.wobble * 0.08;

    this.renderer.render(this.scene, this.camera);

    if (moving || this.needsFrame) {
      this.needsFrame = false;
      this.requestFrame();
    }
  }

  private dispose(): void {
    this.cancelFrame();
    this.policy.releaseWebGL('fillUpTank');
    this.renderer?.dispose();
    this.liquid?.geometry.dispose();
    (this.liquid?.material as import('three').Material)?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.liquid = null;
    this.rim = null;
  }
}
