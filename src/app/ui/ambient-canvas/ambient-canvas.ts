import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { MotionPolicy } from '../motion/motion-policy';

export const SHOW_HOME_AMBIENT = true;

@Component({
  selector: 'app-ambient-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (useFallback) {
      <div class="ambient-fallback" aria-hidden="true"></div>
    } @else {
      <canvas #canvas class="ambient-canvas" aria-hidden="true"></canvas>
    }
  `,
  styles: `
    :host {
      display: block;
      pointer-events: none;
    }
    .ambient-canvas,
    .ambient-fallback {
      display: block;
      width: 100%;
      height: 7.5rem;
      border-radius: var(--radius);
    }
    .ambient-fallback {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--petrol) 18%, transparent),
        transparent 85%
      );
    }
  `,
})
export class AmbientCanvas implements AfterViewInit {
  private readonly policy = inject(MotionPolicy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly useFallback =
    !SHOW_HOME_AMBIENT || this.policy.prefersReducedMotion();

  private renderer: import('three').WebGLRenderer | null = null;
  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private mesh: import('three').Mesh | null = null;
  private raf = 0;
  private start = 0;
  private done = false;

  ngAfterViewInit(): void {
    if (this.useFallback || !this.policy.claimWebGL('homeAmbient')) {
      return;
    }
    void this.init();
  }

  private async init(): Promise<void> {
    const el = this.canvasRef()?.nativeElement;
    if (!el) {
      return;
    }
    try {
      const THREE = await import('three');
      const w = el.clientWidth || 360;
      const h = el.clientHeight || 120;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 10);
      camera.position.z = 2.2;

      const renderer = new THREE.WebGLRenderer({
        canvas: el,
        alpha: true,
        antialias: true,
      });
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const geo = new THREE.PlaneGeometry(3.6, 1.4, 24, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0f4545,
        emissive: 0x1a5c5c,
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0,
        metalness: 0.15,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -0.35;
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const key = new THREE.DirectionalLight(0x5cdba8, 0.5);
      key.position.set(1, 2, 2);
      scene.add(key);

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.mesh = mesh;
      this.start = performance.now();
      this.tick();

      const onResize = () => {
        const nw = el.clientWidth || w;
        const nh = el.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
        if (!this.done) {
          this.tick();
        }
      };
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onResize);
        this.dispose();
      });
    } catch {
      this.policy.releaseWebGL('homeAmbient');
    }
  }

  private tick = (): void => {
    if (!this.renderer || !this.scene || !this.camera || !this.mesh) {
      return;
    }
    const elapsed = performance.now() - this.start;
    const t = Math.min(elapsed / 700, 1);
    const mat = this.mesh.material as import('three').MeshStandardMaterial;
    mat.opacity = t * 0.55;
    this.mesh.position.y = (1 - t) * 0.25;
    this.renderer.render(this.scene, this.camera);
    if (t < 1) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.done = true;
      this.raf = 0;
    }
  };

  private dispose(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
    }
    this.policy.releaseWebGL('homeAmbient');
    this.renderer?.dispose();
    this.mesh?.geometry.dispose();
    (this.mesh?.material as import('three').Material)?.dispose();
  }
}
