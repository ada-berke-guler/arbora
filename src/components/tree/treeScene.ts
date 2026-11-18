/**
 * Procedural 3D growth tree (Three.js). One continuous scene: seed → sprout
 * → seedling → sapling → young tree → fruit, driven by a single 0..1
 * `progress`. Everything is built ONCE (deterministic, seeded) and growth is
 * just per-part scale/position — so scrubbing progress is cheap and the same
 * journey always grows the same tree.
 *
 * Loaded lazily (dynamic import) so three.js never blocks first paint.
 */
import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  CircleGeometry,
  Color,
} from "three";

export interface TreeColors {
  leaf: string;
  leafLight: string;
  trunk: string;
  soil: string;
  fruit: string;
  seed: string;
}

export interface TreeSceneOptions {
  canvas: HTMLCanvasElement;
  colors: TreeColors;
  seed?: number;
  rotate: boolean;
  /** Cap device pixel ratio (small sidebar canvas doesn't need 3x). */
  maxDpr?: number;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** easeOutBack — the springy "pop" for leaves and fruit. */
const backOut = (v: number) => {
  const x = clamp01(v);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

interface Branch {
  group: Group; // positioned at base, oriented along its direction (local +Y)
  mesh: Mesh;
  parent: Branch | null;
  attach: number; // 0..1 along parent
  length: number;
  radius: number;
  birth: number; // progress when it starts growing
  span: number; // progress it takes to reach full length
  depth: number;
}

interface Blob {
  mesh: Mesh;
  branch: Branch;
  birth: number;
  span: number;
  size: number;
  offset: Vector3; // relative to branch tip, in branch-local space
}

const UP = new Vector3(0, 1, 0);

export class TreeScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 0.1, 100);
  private root = new Group();
  private branches: Branch[] = [];
  private leaves: Blob[] = [];
  private fruits: Blob[] = [];
  private cotyledons: Mesh[] = [];
  private seedMesh: Mesh;
  private ground: Mesh;
  private mats: Record<keyof TreeColors, MeshStandardMaterial>;
  private shown = 0;
  private target = 0;
  private raf = 0;
  private running = false;
  private rotate: boolean;
  private auto: { from: number; to: number; t0: number; dur: number } | null = null;
  private onAutoDone: (() => void) | null = null;

  constructor(opts: TreeSceneOptions) {
    this.rotate = opts.rotate;
    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2));
    this.renderer.setClearColor(0x000000, 0);

    const m = (c: string, rough = 0.85) => new MeshStandardMaterial({ color: new Color(c), roughness: rough, metalness: 0, flatShading: true });
    this.mats = {
      leaf: m(opts.colors.leaf),
      leafLight: m(opts.colors.leafLight),
      trunk: m(opts.colors.trunk, 0.95),
      soil: m(opts.colors.soil, 1),
      fruit: m(opts.colors.fruit, 0.5),
      seed: m(opts.colors.seed, 0.7),
    };

    this.scene.add(new HemisphereLight(0xffffff, 0x445566, 1.1));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);

    this.ground = new Mesh(new CircleGeometry(1, 48), this.mats.soil);
    this.ground.rotation.x = -Math.PI / 2;
    this.root.add(this.ground);

    this.seedMesh = new Mesh(new SphereGeometry(0.13, 14, 10), this.mats.seed);
    this.seedMesh.scale.set(1, 0.72, 0.85);
    this.seedMesh.position.set(0, 0.07, 0);
    this.root.add(this.seedMesh);

    this.build(mulberry32(opts.seed ?? 7));
    this.scene.add(this.root);
    this.apply(0);
  }

  /* ── construction ── */

  private addBranch(
    parent: Branch | null,
    attach: number,
    dir: Vector3,
    length: number,
    radius: number,
    birth: number,
    span: number,
    depth: number
  ): Branch {
    const group = new Group();
    group.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
    const geo = new CylinderGeometry(radius * 0.62, radius, 1, 7, 1);
    geo.translate(0, 0.5, 0); // pivot at the base so scale.y grows it upward
    const mesh = new Mesh(geo, this.mats.trunk);
    group.add(mesh);
    (parent ? parent.group : this.root).add(group);
    const b: Branch = { group, mesh, parent, attach, length, radius, birth, span, depth };
    if (parent) {
      // child directions are expressed in WORLD terms; undo the parent's rotation
      const inv = new Quaternion();
      let p: Branch | null = parent;
      const chain: Quaternion[] = [];
      while (p) {
        chain.unshift(p.group.quaternion);
        p = p.parent;
      }
      chain.forEach((q) => inv.multiply(q));
      group.quaternion.premultiply(inv.invert());
    }
    this.branches.push(b);
    return b;
  }

  private build(rand: () => number) {
    const trunk = this.addBranch(null, 0, new Vector3(0, 1, 0), 2.1, 0.16, 0.03, 0.62, 0);

    /* cotyledons: the two first leaves of the sprout, retired as the tree takes over */
    for (const side of [-1, 1]) {
      const leaf = new Mesh(new SphereGeometry(0.12, 10, 6), this.mats.leafLight);
      leaf.scale.set(1.25, 0.28, 0.7);
      leaf.position.set(side * 0.13, 0, 0);
      leaf.rotation.z = side * 0.45;
      this.root.add(leaf);
      this.cotyledons.push(leaf);
    }

    const grow = (parent: Branch, depth: number, worldDir: Vector3) => {
      if (depth > 3) return;
      const count = depth === 1 ? 4 : depth === 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const attach = depth === 1 ? 0.45 + (i / count) * 0.5 : 0.55 + rand() * 0.4;
        const yaw = (i / count) * Math.PI * 2 + rand() * 0.9 + depth;
        const tilt = 0.55 + rand() * 0.45 - depth * 0.05;
        const dir = new Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw));
        dir.add(worldDir.clone().multiplyScalar(0.55)).normalize();
        const length = parent.length * (0.5 + rand() * 0.18);
        const radius = parent.radius * 0.6;
        const birth = parent.birth + parent.span * (0.35 + attach * 0.4);
        const span = 0.2 + rand() * 0.06;
        const b = this.addBranch(parent, attach, dir, length, radius, birth, span, depth);
        if (depth >= 2) this.addLeafCluster(b, rand, depth);
        grow(b, depth + 1, dir);
      }
    };
    grow(trunk, 1, new Vector3(0, 1, 0));

    /* crown on the trunk tip so the young tree reads as a tree before side canopies land */
    this.addLeafCluster(trunk, rand, 1);
  }

  private addLeafCluster(b: Branch, rand: () => number, depth: number) {
    const n = depth === 1 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const size = (depth === 1 ? 0.48 : depth === 2 ? 0.42 : 0.34) * (0.8 + rand() * 0.4);
      const mesh = new Mesh(new IcosahedronGeometry(1, 1), rand() < 0.4 ? this.mats.leafLight : this.mats.leaf);
      mesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      b.group.add(mesh);
      const offset = new Vector3((rand() - 0.5) * 0.35, (rand() - 0.2) * 0.25, (rand() - 0.5) * 0.35);
      const birth = Math.max(0.3, b.birth + b.span * 0.7 + rand() * 0.05);
      this.leaves.push({ mesh, branch: b, birth, span: 0.12, size, offset });
      if (rand() < 0.75) {
        const fruit = new Mesh(new SphereGeometry(1, 10, 8), this.mats.fruit);
        b.group.add(fruit);
        const dir = new Vector3(rand() - 0.5, -0.2 - rand() * 0.4, rand() - 0.5).normalize().multiplyScalar(size * 0.95);
        this.fruits.push({ mesh: fruit, branch: b, birth: 0.86 + rand() * 0.1, span: 0.05, size: 0.075 + rand() * 0.03, offset: offset.clone().add(dir) });
      }
    }
  }

  /* ── growth ── */

  private grownLength(b: Branch, p: number) {
    return b.length * smooth((p - b.birth) / b.span);
  }

  private apply(p: number) {
    for (const b of this.branches) {
      const f = smooth((p - b.birth) / b.span);
      const len = Math.max(0.0001, b.length * f);
      b.mesh.scale.set(0.35 + 0.65 * f, len, 0.35 + 0.65 * f);
      b.mesh.visible = f > 0.002;
      if (b.parent) b.group.position.set(0, this.grownLength(b.parent, p) * b.attach, 0);
    }
    const trunk = this.branches[0];
    const trunkLen = this.grownLength(trunk, p);

    /* sprout leaves ride the trunk tip early, then fade into the trunk */
    const cot = backOut((p - 0.02) / 0.1) * (1 - smooth((p - 0.3) / 0.15));
    for (const c of this.cotyledons) {
      c.visible = cot > 0.01;
      c.scale.set(1.25 * cot, 0.28 * cot, 0.7 * cot);
      c.position.y = Math.min(trunkLen, 0.5) + 0.02;
    }

    for (const l of this.leaves) {
      const s = backOut((p - l.birth) / l.span) * l.size;
      l.mesh.visible = s > 0.002;
      l.mesh.scale.setScalar(Math.max(0.0001, s));
      l.mesh.position.set(l.offset.x, this.grownLength(l.branch, p) + l.offset.y, l.offset.z);
    }
    for (const fr of this.fruits) {
      const s = backOut((p - fr.birth) / fr.span) * fr.size;
      fr.mesh.visible = s > 0.002;
      fr.mesh.scale.setScalar(Math.max(0.0001, s));
      fr.mesh.position.set(fr.offset.x, this.grownLength(fr.branch, p) + fr.offset.y, fr.offset.z);
    }

    /* the patch of soil widens with the tree so the frame never shows its edge */
    this.ground.scale.setScalar(0.55 + smooth(Math.pow(p, 0.6)) * 1.25);

    const seedS = 1 - smooth((p - 0.05) / 0.25) * 0.6;
    this.seedMesh.scale.set(seedS, 0.72 * seedS, 0.85 * seedS);

    /* the camera follows the plant: close on the seed, wide on the full tree */
    const k = smooth(Math.pow(p, 0.6));
    const dist = 2.2 + k * 6.2;
    const ty = 0.12 + k * 1.75;
    this.camera.position.set(0, ty + 0.55 + k * 0.6, dist);
    this.camera.lookAt(0, ty, 0);
  }

  /* ── loop ── */

  setProgress(p: number, instant = false) {
    this.target = clamp01(p);
    this.auto = null;
    if (instant) this.shown = this.target;
    this.kick();
  }

  play(durationSec: number, onDone?: () => void) {
    this.auto = { from: 0, to: 1, t0: performance.now(), dur: durationSec * 1000 };
    this.onAutoDone = onDone ?? null;
    this.shown = 0;
    this.kick();
  }

  setColors(c: TreeColors) {
    for (const k of Object.keys(c) as (keyof TreeColors)[]) this.mats[k].color.set(c[k]);
    this.renderOnce();
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  }

  setRotate(on: boolean) {
    this.rotate = on;
    this.kick();
  }

  private renderOnce() {
    this.apply(this.shown);
    this.renderer.render(this.scene, this.camera);
  }

  private kick() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    let busy = false;
    if (this.auto) {
      const t = clamp01((now - this.auto.t0) / this.auto.dur);
      this.shown = this.auto.from + (this.auto.to - this.auto.from) * (1 - Math.pow(1 - t, 2));
      busy = t < 1;
      if (!busy) {
        this.target = this.shown;
        this.auto = null;
        const cb = this.onAutoDone;
        this.onAutoDone = null;
        cb?.();
      }
    } else if (Math.abs(this.target - this.shown) > 0.0005) {
      this.shown += (this.target - this.shown) * 0.06;
      busy = true;
    } else {
      this.shown = this.target;
    }
    if (this.rotate) {
      this.root.rotation.y += 0.0035;
      busy = true;
    }
    this.renderOnce();
    if (busy && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    else this.running = false;
  };

  resume() {
    this.kick();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    Object.values(this.mats).forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
