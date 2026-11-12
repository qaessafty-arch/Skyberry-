"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor, Stars } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { HomePlanet, MiniPlanet } from "./planet";
import { PetRenderer } from "./pets/registry";
import type { Accessory, PetMood } from "./pets/types";

export type OrbitFriend = { id: string; name: string; username: string; accent: string; level: number; streak: number; planet: string };

const ACCENT: Record<string, string> = { berry: "#9fb3ff", sky: "#70d0f8", mint: "#7fe6d4", sun: "#ffd28a", violet: "#c3b6ff" };
const SKIES: Record<string, { zenith: string; horizon: string; glow: string }> = {
  dusk: { zenith: "#06152a", horizon: "#16507c", glow: "#48b9f2" },
  dawn: { zenith: "#0d2945", horizon: "#3d7fb0", glow: "#ffcf9e" },
  aurora: { zenith: "#04172a", horizon: "#0c4658", glow: "#42d5e8" },
  midnight: { zenith: "#030a14", horizon: "#0b2340", glow: "#2a6f9f" },
};
const PLANET_R = 2.15;

function SkyDome({ theme }: { theme: string }) {
  const s = SKIES[theme] ?? SKIES.dusk!;
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uZ: { value: new THREE.Color(s.zenith) }, uH: { value: new THREE.Color(s.horizon) }, uG: { value: new THREE.Color(s.glow) } },
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 uZ; uniform vec3 uH; uniform vec3 uG; varying vec3 vD;
      void main(){ float h = clamp(vD.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(uH, uZ, smoothstep(0.42, 0.95, h));
        c += uG * 0.22 * exp(-pow((h - 0.47) * 9.0, 2.0));      // glow band at the horizon
        c += uG * 0.08 * pow(max(0.0, dot(vD, normalize(vec3(-0.6, 0.15, -0.8)))), 6.0); // distant nebula haze
        gl_FragColor = vec4(c, 1.0); }`,
  }), [s.zenith, s.horizon, s.glow]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh material={mat} scale={90}><sphereGeometry args={[1, 48, 32]} /></mesh>;
}

/** Soft, grounded contact shadow that follows the planet's curvature at Pip's feet. */
function ContactBlob() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(5,18,34,.55)"); gr.addColorStop(0.55, "rgba(5,18,34,.22)"); gr.addColorStop(1, "rgba(5,18,34,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return <mesh rotation={[-Math.PI / 2, 0, -0.42]} position={[0, 0.006, -0.02]} scale={[0.9, 1.45, 1]}><planeGeometry /><meshBasicMaterial map={tex} transparent depthWrite={false} /></mesh>;
}

function FriendWorld({ f, index, total, selected, still, onPick }: { f: OrbitFriend; index: number; total: number; selected: boolean; still: boolean; onPick: (f: OrbitFriend) => void }) {
  const g = useRef<THREE.Group>(null);
  const spread = total <= 1 ? 0 : index / (total - 1) - 0.5;
  const base = useMemo(() => new THREE.Vector3(spread * 9 + (index % 2 ? 0.6 : -0.6), 1.3 + (index % 3) * 0.75, -7 - (index % 3) * 1.6), [spread, index]);
  const size = 0.32 + Math.min(f.streak, 30) * 0.012;
  useFrame((s) => {
    if (!g.current) return;
    const t = still ? 0 : s.clock.elapsedTime;
    g.current.position.set(base.x, base.y + Math.sin(t * 0.4 + index) * 0.08, base.z);
    g.current.rotation.y = t * 0.08;
    const k = selected ? 1.18 : 1;
    g.current.scale.setScalar(THREE.MathUtils.damp(g.current.scale.x, k, 6, 0.016));
  });
  return (
    <group ref={g} onClick={(e) => { e.stopPropagation(); onPick(f); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      <MiniPlanet style={f.planet} color={ACCENT[f.accent] ?? ACCENT.sky!} size={size} />
      {selected && <mesh rotation={[Math.PI / 2.3, 0, 0]}><torusGeometry args={[size * 1.55, 0.008, 8, 96]} /><meshBasicMaterial color="#d9f2ff" transparent opacity={0.8} /></mesh>}
    </group>
  );
}

/** Frames Pip for the viewport: portrait screens pull the camera back so the whole fox fits. */
function FrameCamera({ framing = "default" }: { framing?: "default" | "face" }) {
  const { camera, size, controls } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const face = framing === "face";
    const dist = (face ? 1.05 : 3.15) * Math.pow(Math.min(1.9, Math.max(1, 1.15 / aspect)), 0.6);
    const dir = new THREE.Vector3(face ? -0.15 : 0.42, face ? 0.12 : 0.36, 1).normalize();
    const target = new THREE.Vector3(face ? 0.12 : 0, face ? 0.86 : 0.55, face ? 0.45 : 0);
    camera.position.copy(dir.multiplyScalar(dist)).add(target);
    camera.lookAt(target);
    (controls as unknown as { update?: () => void } | null)?.update?.();
  }, [camera, size.width, size.height, controls, framing]);
  return null;
}

export type UniverseSceneProps = {
  planet: string; theme: string; species: string; level: number; mood: PetMood; accessory: Accessory;
  friends: OrbitFriend[]; selectedFriend: string | null; reduceMotion: boolean; quality: "high" | "low";
  reactKey: number; happyKey: number; framing?: "default" | "face";
  /** Stop rendering entirely (leaving the page, hidden tab, scrolled away). */
  paused?: boolean;
  /** Pet lab only. */
  forceIdle?: "none" | "sit" | "stretch" | "yawn";
  /** Software-rendered WebGL (no GPU): render only when something changes. */
  software?: boolean;
  onPickFriend: (f: OrbitFriend | null) => void; onPetTap: () => void;
};

export default function UniverseScene(p: UniverseSceneProps) {
  // Adaptive quality: if a real device can't keep up, step down once (fewer fur layers, dpr 1, lighter shadows).
  const [degraded, setDegraded] = useState(false);
  const quality = degraded || p.software ? "low" : p.quality;
  const still = p.reduceMotion || Boolean(p.software);
  return (
    <Canvas shadows frameloop={p.paused ? "never" : still ? "demand" : "always"} dpr={degraded || p.software ? 1 : quality === "high" ? [1, 1.75] : [1, 1.3]}
      camera={{ position: [1.25, 1.12, 3.55], fov: 36, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => p.onPickFriend(null)}
      role="img"
      aria-label="Interactive 3D Universe. Drag to look around, tap Pip to interact. The same information is listed below the scene.">
      <PerformanceMonitor ms={300} iterations={8} threshold={0.75} onDecline={() => setDegraded(true)} onFallback={() => setDegraded(true)} />
      <SkyDome theme={p.theme} />
      <Stars radius={70} depth={25} count={quality === "high" ? 2200 : 900} factor={2.6} saturation={0} fade speed={still ? 0 : 0.35} />

      <hemisphereLight args={["#d4efff", "#3a6488", 0.55]} />
      <directionalLight position={[0.5, -0.6, 2.5]} intensity={0.55} color="#cfeeff" /> {/* soft bounce from the planet */}
      <directionalLight castShadow position={[2.6, 4.6, 3.4]} intensity={3.1} color="#fff5ea"
        shadow-mapSize={[quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024]} shadow-bias={-0.0005} shadow-normalBias={0.025}
        shadow-camera-left={-1.6} shadow-camera-right={1.6} shadow-camera-top={1.8} shadow-camera-bottom={-1.2} shadow-camera-near={1} shadow-camera-far={12} />
      <directionalLight position={[-3.5, 1.6, -3.2]} intensity={1.6} color="#9fdcf8" /> {/* cyan rim for the fur silhouette */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 4, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#70d0f8" position={[-4, 1, -3]} scale={[4, 3, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#42d5e8" position={[3, 2, -4]} scale={2} />
      </Environment>

      <HomePlanet style={p.planet} radius={PLANET_R} quality={quality} still={still} />
      <ContactBlob />
      <Suspense fallback={null}>
        <PetRenderer species={p.species} mood={p.mood} level={p.level} accessory={p.accessory} reactKey={p.reactKey} happyKey={p.happyKey}
          reduceMotion={still} quality={quality} onTap={p.onPetTap} forceIdle={p.forceIdle} />
      </Suspense>
      {p.friends.slice(0, 12).map((f, i) => (
        <FriendWorld key={f.id} f={f} index={i} total={Math.min(p.friends.length, 12)} selected={p.selectedFriend === f.id} still={still} onPick={p.onPickFriend} />
      ))}

      <FrameCamera framing={p.framing} />
      <OrbitControls makeDefault enabled={p.framing !== "face"} target={[0, 0.55, 0]} enablePan={false} minDistance={2.2} maxDistance={7}
        minPolarAngle={0.85} maxPolarAngle={1.5} enableDamping dampingFactor={0.08} rotateSpeed={0.6} zoomSpeed={0.6} />
    </Canvas>
  );
}
