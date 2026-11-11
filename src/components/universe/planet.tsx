"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { generatePlanetPixels, type PlanetPixels } from "./planet-gen";
import * as THREE from "three";

/** Stored `planet` values (user data) → visual palettes. Labels are what users see. */
export const PLANETS: Record<string, { label: string; deep: string; shallow: string; shore: string; land: string; high: string; atmo: string }> = {
  berry: { label: "Glacier", deep: "#0d4573", shallow: "#2a9fd8", shore: "#a8e3fa", land: "#bfdff0", high: "#f2f9fd", atmo: "#8fdcff" },
  lagoon: { label: "Lagoon", deep: "#0a3a5a", shallow: "#14a6c8", shore: "#86e6ef", land: "#3e9a8b", high: "#d4f1ea", atmo: "#70e2ee" },
  ember: { label: "Dune", deep: "#173a5e", shallow: "#2d74a6", shore: "#f1d9b8", land: "#d9a874", high: "#fff3e3", atmo: "#ffd9a8" },
  meadow: { label: "Meadow", deep: "#0c3c5d", shallow: "#2a90c2", shore: "#d2ebcb", land: "#82ba8c", high: "#eef8ee", atmo: "#a8e6c4" },
};

type Textures = { map: THREE.DataTexture; bump: THREE.DataTexture; rough: THREE.DataTexture; clouds: THREE.DataTexture };
const cache = new Map<string, Textures>();
const pending = new Map<string, Promise<Textures>>();
let worker: Worker | null | undefined;
let seq = 0;
const waiters = new Map<number, (px: PlanetPixels) => void>();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./planet.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; px: PlanetPixels }>) => { waiters.get(e.data.id)?.(e.data.px); waiters.delete(e.data.id); };
  } catch { worker = null; }
  return worker;
}
function toTextures(px: PlanetPixels): Textures {
  const t = (data: Uint8Array, srgb = false) => {
    const tx = new THREE.DataTexture(data, px.w, px.h, THREE.RGBAFormat);
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter;
    tx.generateMipmaps = true; tx.anisotropy = 4; tx.needsUpdate = true;
    return tx;
  };
  return { map: t(px.map, true), bump: t(px.bump), rough: t(px.rough), clouds: t(px.clouds, true) };
}
/** Planet textures, generated in a Web Worker (main-thread fallback at low resolution). Cached per style+size. */
function loadTextures(style: string, w: number): Promise<Textures> {
  const key = `${style}:${w}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const wk = getWorker();
  const p = new Promise<PlanetPixels>((resolve) => {
    if (!wk) { resolve(generatePlanetPixels(style, Math.min(w, 256))); return; }
    const id = ++seq; waiters.set(id, resolve); wk.postMessage({ id, style, w });
  }).then((px) => { const tx = toTextures(px); cache.set(key, tx); pending.delete(key); return tx; });
  pending.set(key, p);
  return p;
}
function usePlanetTextures(style: string, w: number) {
  const [tex, setTex] = useState<Textures | null>(() => cache.get(`${style}:${w}`) ?? null);
  useEffect(() => {
    let alive = true;
    void loadTextures(style, w).then((t) => { if (alive) setTex(t); });
    return () => { alive = false; };
  }, [style, w]);
  return tex;
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
  const tex = usePlanetTextures(style, quality === "high" ? 1024 : 512);
  const clouds = useRef<THREE.Mesh>(null);
  const P = PLANETS[style] ?? PLANETS.berry!;
  useFrame((_, dt) => { if (!still && clouds.current) clouds.current.rotation.y += dt * 0.012; });
  return (
    <group position={[0, -radius, 0]}>
      <mesh receiveShadow rotation={[0.25, 2.2, 0]}>
        <sphereGeometry args={[radius, quality === "high" ? 160 : 96, quality === "high" ? 120 : 72]} />
        {tex
          ? <meshStandardMaterial key="surface" map={tex.map} bumpMap={tex.bump} bumpScale={0.6} roughnessMap={tex.rough} roughness={1} metalness={0} />
          : <meshStandardMaterial key="base" color={P.land} roughness={0.9} />}
      </mesh>
      {tex && (
        <mesh ref={clouds} scale={1.012} rotation={[0.2, 0.4, 0]}>
          <sphereGeometry args={[radius, 96, 72]} />
          <meshStandardMaterial map={tex.clouds} transparent depthWrite={false} roughness={1} opacity={0.85} />
        </mesh>
      )}
      <Atmosphere radius={radius} color={P.atmo} power={5} strength={0.42} />
    </group>
  );
}

/** A friend's small world in the distance. */
export function MiniPlanet({ style, color, size }: { style: string; color: string; size: number }) {
  const tex = usePlanetTextures(style, 256);
  return (
    <group>
      <mesh>
        <sphereGeometry args={[size, 48, 36]} />
        {tex
          ? <meshStandardMaterial key="surface" map={tex.map} roughnessMap={tex.rough} roughness={1} emissive={color} emissiveIntensity={0.08} />
          : <meshStandardMaterial key="base" color={color} roughness={0.8} />}
      </mesh>
      <Atmosphere radius={size} color={color} power={2.4} strength={1.2} />
    </group>
  );
}
