import * as THREE from "three";

/**
 * Procedural geometry for Pip, the Skyberry cloud fox.
 * Shapes are smooth, deformed surfaces (not stacked primitives) with baked vertex colours
 * that describe the coat: cloud-white base, silver-blue saddle, cream muzzle, sky-tinted tips.
 * Everything here is built once and reused; only the tail is re-posed each frame.
 */

export const COAT = {
  cloud: new THREE.Color("#f6fbff"),
  silver: new THREE.Color("#a7c2d8"),
  silverLight: new THREE.Color("#cfe0ec"),
  saddle: new THREE.Color("#7896b2"),
  sky: new THREE.Color("#8fd0f2"),
  cream: new THREE.Color("#f3e7d8"),
  innerEar: new THREE.Color("#ecc9b9"),
  sock: new THREE.Color("#6d8ca6"),
  nose: new THREE.Color("#1b2836"),
};

const ss = THREE.MathUtils.smoothstep;
const lerpColor = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1));

/** furMask: per-vertex fur length multiplier (0 = bare, e.g. around the eyes; 1 = full coat). */
function finish(geo: THREE.BufferGeometry, colors: number[], mask?: number[]) {
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const n = geo.attributes.position!.count;
  geo.setAttribute("furMask", new THREE.Float32BufferAttribute(mask ?? new Array(n).fill(1), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Torso: long, deep-chested, tucked at the waist. Faces +Z. */
export function bodyGeometry() {
  const geo = new THREE.SphereGeometry(1, 64, 44);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    const front = ss(d.z, -0.2, 1); // 0 at rump → 1 at chest
    // deep chest, slimmer waist and hips
    const girth = 0.86 + 0.22 * front - 0.12 * Math.exp(-((d.z + 0.15) ** 2) / 0.08);
    let x = v.x * 0.3 * girth;
    let y = v.y * 0.29 * (0.9 + 0.2 * front);
    const z = v.z * 0.56;
    // belly tuck + slightly arched back
    if (d.y < 0) y *= 0.86 - 0.08 * Math.exp(-((d.z + 0.1) ** 2) / 0.1);
    y += 0.035 * Math.cos(d.z * 1.4);
    x *= 1 + 0.04 * Math.sin(d.y * 3);
    p.setXYZ(i, x, y, z);
    // coat: silver saddle on the back, white belly, cream bib at the chest
    let c = lerpColor(COAT.cloud, COAT.silver, ss(d.y, -0.05, 0.55));
    c = lerpColor(c, COAT.saddle, ss(d.y, 0.35, 0.9) * (0.7 + 0.3 * (1 - front)));
    c = lerpColor(c, COAT.cream, ss(d.z, 0.45, 0.95) * ss(-d.y, -0.6, 0.2) * 0.85);
    colors.push(c.r, c.g, c.b);
  }
  return finish(geo, colors);
}

/** Fluffy neck ruff that joins head and chest. */
export function ruffGeometry() {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    p.setXYZ(i, v.x * 0.25 * (1 + 0.1 * Math.abs(d.y)), v.y * 0.26, v.z * 0.24 + 0.03 * ss(d.z, 0, 1));
    const c = lerpColor(COAT.cloud, COAT.cream, ss(d.z, 0.2, 0.9) * ss(-d.y, -0.4, 0.6) * 0.7);
    const s = lerpColor(c, COAT.silverLight, ss(d.y, 0.3, 0.9) * ss(-d.z, -0.3, 0.6));
    colors.push(s.r, s.g, s.b);
  }
  return finish(geo, colors);
}

/** Head with a tapered fox muzzle, full cheeks and a soft brow. Muzzle points +Z. */
export const EYE_DIR = new THREE.Vector3(0.36, 0.2, 0.91).normalize(); // mirrored for the other eye
export function headGeometry() {
  const geo = new THREE.SphereGeometry(1, 72, 52);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [], mask: number[] = [];
  const eyeL = EYE_DIR.clone(), eyeR = EYE_DIR.clone().setX(-EYE_DIR.x); // eye sockets
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    let x = v.x * 0.25, y = v.y * 0.225, z = v.z * 0.235;
    // muzzle: pull the lower front forward and narrow it towards the nose
    const m = ss(d.z, 0.25, 1) * ss(-d.y, -0.75, 0.35);
    z += 0.2 * m;
    x *= 1 - 0.52 * m;
    y = y * (1 - 0.38 * m) - 0.035 * m;
    // full cheeks (classic fox ruff) and a flatter skull top
    const cheek = ss(Math.abs(d.x), 0.55, 0.95) * ss(-d.y, -0.2, 0.6);
    x *= 1 + 0.24 * cheek; y -= 0.03 * cheek;
    if (d.y > 0.3) x *= 1 - 0.12 * ss(d.y, 0.3, 1); // narrower crown → triangular fox skull
    if (d.y > 0.5) y *= 0.94;
    const nearEye = Math.max(d.dot(eyeL), d.dot(eyeR));
    const bare = ss(nearEye, 0.955, 0.985);           // eye sockets: no fur over the eyes
    const nose = ss(d.z, 0.93, 0.99) * ss(-d.y, -0.6, 0.2);
    mask.push(Math.max(0, (1 - bare) * (1 - nose) * (1 - 0.65 * m) * (1 + 0.6 * cheek)));
    p.setXYZ(i, x, y, z);
    // coat: silver crown and back of head, white cheeks, cream muzzle, sky blush on the brow
    let c = lerpColor(COAT.cloud, COAT.silver, ss(d.y, 0.15, 0.75) * (1 - 0.6 * m));
    c = lerpColor(c, COAT.silverLight, ss(-d.z, 0.1, 0.8) * 0.5);
    c = lerpColor(c, COAT.cream, m * 0.9);
    c = lerpColor(c, COAT.cloud, cheek * 0.8);
    c = lerpColor(c, COAT.sky, ss(d.y, 0.55, 0.95) * ss(d.z, -0.1, 0.5) * 0.35);
    c = lerpColor(c, COAT.saddle, ss(nearEye, 0.9, 0.955) * (1 - bare) * 0.45); // soft dark rim around the eyes
    colors.push(c.r, c.g, c.b);
  }
  return finish(geo, colors, mask);
}

/** Tall, slightly cupped fox ear. Base at y=0, tip at +Y, open side faces +Z. */
export function earGeometry(inner = false) {
  const h = inner ? 0.21 : 0.27, r = inner ? 0.07 : 0.11;
  const geo = new THREE.ConeGeometry(r, h, 28, 10, false);
  geo.translate(0, h / 2, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = v.y / h;
    // flatten front-to-back, cup the front face, lean the tip forward
    let z = v.z * 0.62;
    if (!inner && z > 0) z *= 0.55;
    z += 0.05 * t * t;
    p.setXYZ(i, v.x, v.y, z + (inner ? 0.022 : 0));
    const c = inner ? lerpColor(COAT.innerEar, COAT.cloud, t * 0.5) : lerpColor(COAT.saddle, COAT.silverLight, ss(t, 0.2, 0.7)).lerp(COAT.sky, ss(t, 0.78, 1) * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  return finish(geo, colors);
}

/** Slender leg tapering into a sock-coloured paw. Hip/shoulder at y=0, paw at y=-len. */
export function legGeometry(len: number, front: boolean) {
  const geo = new THREE.CapsuleGeometry(0.06, len, 8, 20);
  geo.translate(0, -len / 2, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = THREE.MathUtils.clamp(-v.y / len, 0, 1.1); // 0 top → 1 paw
    const thick = front ? 1.15 - 0.45 * ss(t, 0, 0.75) + 0.12 * Math.exp(-((t - 0.45) ** 2) / 0.01) : 1.6 - 0.95 * ss(t, 0, 0.55) + 0.1 * Math.exp(-((t - 0.5) ** 2) / 0.01);
    let x = v.x * thick, z = v.z * thick;
    if (t > 0.9) { z += 0.045 * ss(t, 0.9, 1.05); x *= 1.2; } // compact paw
    p.setXYZ(i, x, v.y, z);
    const c = lerpColor(front ? COAT.cloud : COAT.silverLight, COAT.sock, ss(t, 0.45, 0.85));
    colors.push(c.r, c.g, c.b);
  }
  return finish(geo, colors);
}

/** Iris texture: layered radial gradient with fibres, a dark limbal ring and a catchlight. */
export function irisTexture() {
  const s = 256, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#f4f8fb"; g.fillRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  const iris = g.createRadialGradient(cx, cy, 8, cx, cy, s * 0.42);
  iris.addColorStop(0, "#0b2e48"); iris.addColorStop(0.32, "#1e6f9f"); iris.addColorStop(0.7, "#45b4e6"); iris.addColorStop(0.93, "#155b88"); iris.addColorStop(1, "#0a2238");
  g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, s * 0.42, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.22; g.strokeStyle = "#bfeeff";
  for (let a = 0; a < 140; a++) { // fibres
    const ang = (a / 140) * Math.PI * 2, r0 = s * 0.14, r1 = s * (0.3 + 0.1 * Math.sin(a * 7.3));
    g.lineWidth = 1 + (a % 3 === 0 ? 1 : 0);
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = "#06121d"; g.beginPath(); g.ellipse(cx, cy, s * 0.13, s * 0.15, 0, 0, Math.PI * 2); g.fill(); // pupil
  g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.ellipse(cx - s * 0.11, cy - s * 0.12, s * 0.06, s * 0.05, -0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(cx + s * 0.1, cy + s * 0.1, s * 0.025, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Strand-density texture for shell fur: one random value per texel = one hair. */
export function furNoiseTexture(size = 512) {
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = Math.pow(rand(), 0.85) * 255;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bushy tail as a tube whose spine is re-posed every frame (wag, sway, curl).
 * Allocates once; `pose(spine)` rewrites positions/normals in place so all fur shells follow.
 */
export class TailGeometry {
  readonly geometry = new THREE.BufferGeometry();
  private readonly rings = 44;
  private readonly sides = 22;
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;

  constructor() {
    const count = (this.rings + 1) * (this.sides + 1);
    this.pos = new Float32Array(count * 3);
    this.nrm = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2), col = new Float32Array(count * 3), idx: number[] = [];
    for (let r = 0; r <= this.rings; r++) {
      const s = r / this.rings;
      // silver at the root → soft sky band → bright white brush tip
      let c = lerpColor(COAT.silver, COAT.cloud, ss(s, 0.02, 0.4));
      c = lerpColor(c, COAT.sky, ss(s, 0.42, 0.6) * (1 - ss(s, 0.6, 0.76)) * 0.15);
      c = lerpColor(c, COAT.cloud, ss(s, 0.72, 0.9));
      for (let k = 0; k <= this.sides; k++) {
        const i = r * (this.sides + 1) + k;
        uv[i * 2] = k / this.sides; uv[i * 2 + 1] = s * 3.2;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        if (r < this.rings && k < this.sides) {
          const a = i, b = i + this.sides + 1;
          idx.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise seen from outside (normals point outward)
        }
      }
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.geometry.setAttribute("furMask", new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    this.geometry.setIndex(idx);
  }

  /** Radius profile: slim root, full brush in the middle, soft rounded tip. */
  private radius(s: number) {
    // slim root → full brush around 55% → soft point at the tip
    return 0.012 + 0.15 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.85) + 0.03 * (1 - s) * (1 - s);
  }

  pose(curve: THREE.Curve<THREE.Vector3>) {
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(1, 0, 0);
    for (let r = 0; r <= this.rings; r++) {
      const s = r / this.rings;
      curve.getPointAt(s, p);
      curve.getTangentAt(s, t);
      n.crossVectors(t, up).normalize();
      if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
      b.crossVectors(t, n).normalize();
      const rad = this.radius(s);
      for (let k = 0; k <= this.sides; k++) {
        const a = (k / this.sides) * Math.PI * 2, i = (r * (this.sides + 1) + k) * 3;
        const cx = Math.cos(a), cy = Math.sin(a);
        const nx = n.x * cx + b.x * cy, ny = n.y * cx + b.y * cy, nz = n.z * cx + b.z * cy;
        this.pos[i] = p.x + nx * rad; this.pos[i + 1] = p.y + ny * rad; this.pos[i + 2] = p.z + nz * rad;
        this.nrm[i] = nx; this.nrm[i + 1] = ny; this.nrm[i + 2] = nz;
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.normal!.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose() { this.geometry.dispose(); }
}
