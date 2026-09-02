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
import { FuelTankCanvas } from '../fuel-tank-canvas/fuel-tank-canvas';
import { MotionPolicy } from '../motion/motion-policy';

function readFuelHex(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--fuel').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return Number.parseInt(raw.slice(1), 16);
  }
  return 0xe8a317;
}

@Component({
  selector: 'app-fuel-tank-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FuelTankCanvas],
  template: `
    @if (useFallback()) {
      <app-fuel-tank-canvas
        [liters]="liters()"
        [tankCapacityLiters]="tankCapacityLiters()"
      />
    } @else {
      <div class="tank-3d" role="img" [attr.aria-label]="label()">
        <canvas #canvas class="tank-3d__canvas" aria-hidden="true"></canvas>
        <span class="tank-3d__pct">{{ pctLabel() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .tank-3d {
      position: relative;
      padding: var(--space-3);
      border-radius: calc(var(--radius) - 4px);
      background: var(--well);
      border: 1px solid var(--hairline);
    }
    .tank-3d__canvas {
      display: block;
      width: 100%;
      height: 7.5rem;
    }
    .tank-3d__pct {
      position: absolute;
      inset-inline: 0;
      bottom: var(--space-3);
      text-align: center;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-size: 0.85rem;
      color: var(--muted);
      pointer-events: none;
    }
  `,
})
export class FuelTank3d implements AfterViewInit {
  readonly liters = input(0);
  readonly tankCapacityLiters = input(50);

  private readonly i18n = inject(I18n);
  private readonly policy = inject(MotionPolicy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private renderer: import('three').WebGLRenderer | null = null;
  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private liquid: import('three').Mesh | null = null;
  private liquidBase: import('three').BufferAttribute | null = null;
  private raf = 0;
  private start = 0;
  private ready = false;

  readonly fillRatio = computed(() => {
    const cap = Math.max(this.tankCapacityLiters(), 1);
    return Math.min(1, Math.max(0, this.liters() / cap));
  });

  readonly fillPct = computed(() => Math.round(this.fillRatio() * 100));
  readonly pctLabel = computed(() =>
    `${this.i18n.formatNumber(this.fillPct(), { maximumFractionDigits: 0 })}%`,
  );
  readonly label = computed(() =>
    this.i18n.t('fillUp.tankVisualLabel', {
      liters: this.liters(),
      pct: this.fillPct(),
    }),
  );

  readonly useFallback = signal(false);

  constructor() {
    effect(() => {
      const ratio = this.fillRatio();
      if (this.ready && this.liquid) {
        this.liquid.scale.y = Math.max(0.02, ratio);
        this.liquid.position.y = -0.55 + ratio * 0.55;
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.policy.prefersReducedMotion() || !this.policy.claimWebGL('fuelTank3d')) {
      this.useFallback.set(true);
      return;
    }
    void this.init();
  }

  private async init(): Promise<void> {
    const el = this.canvasRef()?.nativeElement;
    if (!el) {
      this.useFallback.set(true);
      return;
    }
    try {
      const THREE = await import('three');
      const w = el.clientWidth || 320;
      const h = el.clientHeight || 120;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 20);
      camera.position.set(0, 0.1, 2.8);

      const renderer = new THREE.WebGLRenderer({
        canvas: el,
        alpha: true,
        antialias: true,
      });
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const shellGeo = new THREE.CapsuleGeometry(0.42, 0.9, 12, 24);
      const shellMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.15,
        metalness: 0.05,
        transmission: 0.55,
        thickness: 0.4,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      scene.add(shell);

      const liquidGeo = new THREE.CapsuleGeometry(0.34, 0.78, 16, 24);
      const liquidMat = new THREE.MeshStandardMaterial({
        color: readFuelHex(),
        emissive: readFuelHex(),
        emissiveIntensity: 0.18,
        roughness: 0.35,
        metalness: 0.1,
      });
      const liquid = new THREE.Mesh(liquidGeo, liquidMat);
      liquid.position.y = -0.55;
      scene.add(liquid);

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(1.2, 2, 2.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xe8a317, 0.35);
      rim.position.set(-1.5, 0.5, -1);
      scene.add(rim);

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.liquid = liquid;
      this.liquidBase = liquidGeo.attributes['position'].clone();
      this.start = performance.now();
      this.ready = true;

      const ratio = this.fillRatio();
      liquid.scale.y = Math.max(0.02, ratio);
      liquid.position.y = -0.55 + ratio * 0.55;

      const onResize = () => {
        const nw = el.clientWidth || w;
        const nh = el.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
      };
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onResize);
        this.dispose();
      });

      this.tick();
    } catch {
      this.policy.releaseWebGL('fuelTank3d');
      this.useFallback.set(true);
    }
  }

  private tick = (): void => {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    const t = (performance.now() - this.start) / 1000;
    this.animateWave(t);
    this.renderer.render(this.scene, this.camera);
    if (!this.policy.prefersReducedMotion()) {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private animateWave(t: number): void {
    const liquid = this.liquid;
    const base = this.liquidBase;
    if (!liquid || !base) {
      return;
    }
    const pos = liquid.geometry.attributes['position'] as import('three').BufferAttribute;
    const ratio = this.fillRatio();
    const topY = -0.55 + ratio * 0.55 + 0.35 * ratio;
    for (let i = 0; i < pos.count; i++) {
      const bx = base.getX(i);
      const by = base.getY(i);
      const bz = base.getZ(i);
      let y = by;
      if (by > topY - 0.08) {
        y += Math.sin(t * 2.4 + bx * 9 + bz * 7) * 0.018 * ratio;
      }
      pos.setXYZ(i, bx, y, bz);
    }
    pos.needsUpdate = true;
    liquid.geometry.computeVertexNormals();
  }

  private dispose(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.policy.releaseWebGL('fuelTank3d');
    this.renderer?.dispose();
    this.liquid?.geometry.dispose();
    (this.liquid?.material as import('three').Material)?.dispose();
    this.liquidBase = null;
    this.ready = false;
  }
}
