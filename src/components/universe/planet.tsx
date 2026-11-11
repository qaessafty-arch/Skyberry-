"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Stored `planet` values (user data) → visual palettes. Labels are what users see. */
export const PLANETS: Record<string, { label: string; deep: string; shallow: string; shore: string; land: string; high: string; atmo: string }> = {
  berry: { label: "Glacier", deep: "#0d4573", shallow: "#2a9fd8", shore: "#a8e3fa", land: "#bfdff0", high: "#f2f9fd", atmo: "#8fdcff" },
  lagoon: { label: "Lagoon", deep: "#0a3a5a", shallow: "#14a6c8", shore: "#86e6ef", land: "#3e9a8b", high: "#d4f1ea", atmo: "#70e2ee" },
  ember: { label: "Dune", deep: "#173a5e", shallow: "#2d74a6", shore: "#f1d9b8", land: "#d9a874", high: "#fff3e3", atmo: "#ffd9a8" },
  meadow: { label: "Meadow", deep: "#0c3c5d", shallow: "#2a90c2", shore: "#d2ebcb", land: "#82ba8c", high: "#eef8ee", atmo: "#a8e6c4" },
};

// ── small seamless 3D value-noise (sampled on the sphere, so textures have no seams) ──
function hash(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x: number, y: number, z: number, oct: number) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

type Textures = { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture; clouds: THREE.CanvasTexture };
const cache = new Map<string, Textures>();

function buildTextures(style: string, w: number): Textures {
  const key = `${style}:${w}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const P = PLANETS[style] ?? PLANETS.berry!;
  const h = w / 2;
  const cols = [P.deep, P.shallow, P.shore, P.land, P.high].map((c) => new THREE.Color(c));
  const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const cMap = mk(), cBump = mk(), cRough = mk(), cCloud = mk();
  const iMap = cMap.getContext("2d")!.createImageData(w, h), iBump = cBump.getContext("2d")!.createImageData(w, h);
  const iRough = cRough.getContext("2d")!.createImageData(w, h), iCloud = cCloud.getContext("2d")!.createImageData(w, h);
  const tmp = new THREE.Color();
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const sx = Math.sin(lat) * Math.cos(lon), sy = Math.cos(lat), sz = Math.sin(lat) * Math.sin(lon);
      const e = fbm(sx * 1.6 + 3.1, sy * 1.6, sz * 1.6, 6);
      const polar = Math.pow(Math.abs(sy), 6) * 0.35; // icy caps
      const height = e + polar;
      const sea = 0.5;
      if (height < sea) tmp.copy(cols[0]!).lerp(cols[1]!, THREE.MathUtils.smoothstep(height, 0.3, sea));
      else if (height < sea + 0.025) tmp.copy(cols[2]!);
      else tmp.copy(cols[3]!).lerp(cols[4]!, THREE.MathUtils.smoothstep(height, sea + 0.05, 0.78));
      const detail = 0.94 + 0.12 * noise3(sx * 22, sy * 22, sz * 22);
      const i = (y * w + x) * 4;
      iMap.data[i] = Math.min(255, tmp.r * 255 * detail); iMap.data[i + 1] = Math.min(255, tmp.g * 255 * detail); iMap.data[i + 2] = Math.min(255, tmp.b * 255 * detail); iMap.data[i + 3] = 255;
      const b = height < sea ? 70 : 70 + (height - sea) * 520;
      iBump.data[i] = iBump.data[i + 1] = iBump.data[i + 2] = Math.min(255, b); iBump.data[i + 3] = 255;
      const r = height < sea ? 60 : 225; // glossy seas, matte land
      iRough.data[i] = iRough.data[i + 1] = iRough.data[i + 2] = r; iRough.data[i + 3] = 255;
      const cl = fbm(sx * 2.6 + 11, sy * 3.4, sz * 2.6, 5);
      const a = THREE.MathUtils.smoothstep(cl, 0.5, 0.72);
      iCloud.data[i] = iCloud.data[i + 1] = iCloud.data[i + 2] = 255; iCloud.data[i + 3] = a * 215;
    }
  }
  cMap.getContext("2d")!.putImageData(iMap, 0, 0); cBump.getContext("2d")!.putImageData(iBump, 0, 0);
  cRough.getContext("2d")!.putImageData(iRough, 0, 0); cCloud.getContext("2d")!.putImageData(iCloud, 0, 0);
  const t = (c: HTMLCanvasElement, srgb = false) => { const tx = new THREE.CanvasTexture(c); if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
  const out = { map: t(cMap, true), bump: t(cBump), rough: t(cRough), clouds: t(cCloud, true) };
  cache.set(key, out);
  return out;
}

const atmoVertex = `varying vec3 vN; varying vec3 vP;
void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const atmoFragment = `uniform vec3 uColor; uniform float uPower; uniform float uStrength; varying vec3 vN; varying vec3 vP;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), uPower); gl_FragColor = vec4(uColor, f * uStrength); }`;

export function Atmosphere({ radius, color, power = 2.6, strength = 1.1 }: { radius: number; color: string; power?: number; strength?: number }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: atmoVertex, fragmentShader: atmoFragment, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
  }), [color, power, strength]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh material={mat} scale={radius * 1.045}><sphereGeometry args={[1, 64, 48]} /></mesh>;
}

/** The home planet Pip stands on. Large radius so the horizon curves gently beneath the pet. */
export function HomePlanet({ style, radius, quality, still }: { style: string; radius: number; quality: "high" | "low"; still: boolean }) {
  const tex = useMemo(() => buildTextures(style, quality === "high" ? 1024 : 512), [style, quality]);
  const clouds = useRef<THREE.Mesh>(null);
  const P = PLANETS[style] ?? PLANETS.berry!;
  useFrame((_, dt) => { if (!still && clouds.current) clouds.current.rotation.y += dt * 0.012; });
  return (
    <group position={[0, -radius, 0]}>
      <mesh receiveShadow rotation={[0.25, 2.2, 0]}>
        <sphereGeometry args={[radius, quality === "high" ? 160 : 96, quality === "high" ? 120 : 72]} />
        <meshStandardMaterial map={tex.map} bumpMap={tex.bump} bumpScale={0.6} roughnessMap={tex.rough} roughness={1} metalness={0} />
      </mesh>
      <mesh ref={clouds} scale={1.012} rotation={[0.2, 0.4, 0]}>
        <sphereGeometry args={[radius, 96, 72]} />
        <meshStandardMaterial map={tex.clouds} transparent depthWrite={false} roughness={1} opacity={0.85} />
      </mesh>
      <Atmosphere radius={radius} color={P.atmo} power={5} strength={0.42} />
    </group>
  );
}

/** A friend's small world in the distance. */
export function MiniPlanet({ style, color, size }: { style: string; color: string; size: number }) {
  const tex = useMemo(() => buildTextures(style, 256), [style]);
  return (
    <group>
      <mesh>
        <sphereGeometry args={[size, 48, 36]} />
        <meshStandardMaterial map={tex.map} roughnessMap={tex.rough} roughness={1} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      <Atmosphere radius={size} color={color} power={2.4} strength={1.2} />
    </group>
  );
}
