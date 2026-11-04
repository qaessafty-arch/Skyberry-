"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group } from "three";

export type OrbitFriend = { id: string; name: string; username: string; accent: string; level: number; streak: number };

const PLANET: Record<string, { base: string; glow: string }> = {
  berry: { base: "#d92b6b", glow: "#ff7fb0" }, lagoon: { base: "#1d7fd1", glow: "#6cc8ff" },
  ember: { base: "#e0701f", glow: "#ffc857" }, meadow: { base: "#2f9e6b", glow: "#5eead4" },
};
const ACCENT: Record<string, string> = { berry: "#ff7fb0", sky: "#6cc8ff", mint: "#5eead4", sun: "#ffc857", violet: "#a78bfa" };
const BG: Record<string, string> = { dusk: "#0d0a1f", dawn: "#2a1238", aurora: "#06201f", midnight: "#04040c" };

function Pet({ species, level, still }: { species: string; level: number; still: boolean }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (still || !g.current) return;
    const t = clock.elapsedTime * 0.6;
    g.current.position.set(Math.cos(t) * 2.1, Math.sin(t * 1.3) * 0.3, Math.sin(t) * 2.1);
    g.current.rotation.y = -t + Math.PI / 2;
  });
  const s = 0.32 + Math.min(level, 10) * 0.02;
  const color = species === "cloud-whale" ? "#bfe3ff" : species === "star-moth" ? "#ffe08a" : "#ff9e5e";
  return (
    <group ref={g} position={[2.1, 0, 0]} scale={s}>
      <mesh><sphereGeometry args={[1, 24, 24]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      {species === "berry-fox" && <>
        <mesh position={[-0.55, 0.95, 0]} rotation={[0, 0, 0.25]}><coneGeometry args={[0.35, 0.8, 4]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0.55, 0.95, 0]} rotation={[0, 0, -0.25]}><coneGeometry args={[0.35, 0.8, 4]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, -0.1, -1.3]}><sphereGeometry args={[0.55, 16, 16]} /><meshStandardMaterial color="#fff2e6" /></mesh></>}
      {species === "cloud-whale" && <mesh position={[0, 0.1, -1.2]} rotation={[0.4, 0, 0]}><coneGeometry args={[0.5, 1.1, 3]} /><meshStandardMaterial color={color} /></mesh>}
      {species === "star-moth" && <>
        <mesh position={[-1.1, 0.3, 0]} rotation={[0, 0, 0.6]}><circleGeometry args={[0.9, 3]} /><meshStandardMaterial color="#fff" side={2} emissive="#ffe08a" emissiveIntensity={0.4} /></mesh>
        <mesh position={[1.1, 0.3, 0]} rotation={[0, 0, -0.6]}><circleGeometry args={[0.9, 3]} /><meshStandardMaterial color="#fff" side={2} emissive="#ffe08a" emissiveIntensity={0.4} /></mesh></>}
      <mesh position={[-0.35, 0.2, 0.9]}><sphereGeometry args={[0.12, 8, 8]} /><meshBasicMaterial color="#1a1537" /></mesh>
      <mesh position={[0.35, 0.2, 0.9]}><sphereGeometry args={[0.12, 8, 8]} /><meshBasicMaterial color="#1a1537" /></mesh>
    </group>
  );
}

function FriendOrb({ f, index, total, still, onPick }: { f: OrbitFriend; index: number; total: number; still: boolean; onPick: (f: OrbitFriend) => void }) {
  const g = useRef<Group>(null);
  const radius = 4.2 + (index % 3) * 0.9;
  const phase = (index / Math.max(total, 1)) * Math.PI * 2;
  const speed = 0.12 + (index % 4) * 0.02;
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = still ? 0 : clock.elapsedTime * speed;
    g.current.position.set(Math.cos(phase + t) * radius, Math.sin(phase * 2 + t) * 0.6, Math.sin(phase + t) * radius);
  });
  const c = ACCENT[f.accent] ?? ACCENT.berry!;
  return (
    <group ref={g}>
      <Float speed={still ? 0 : 2} floatIntensity={0.4}>
        <mesh onClick={() => onPick(f)} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
          <sphereGeometry args={[0.32 + Math.min(f.streak, 30) * 0.012, 24, 24]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.55} roughness={0.35} />
        </mesh>
      </Float>
    </group>
  );
}

function Planet({ planet, still }: { planet: string; still: boolean }) {
  const ref = useRef<Group>(null);
  const p = PLANET[planet] ?? PLANET.berry!;
  useFrame((_, d) => { if (!still && ref.current) ref.current.rotation.y += d * 0.12; });
  return (
    <group ref={ref}>
      <mesh><icosahedronGeometry args={[1.5, 3]} /><meshStandardMaterial color={p.base} roughness={0.7} flatShading /></mesh>
      <mesh scale={1.08}><icosahedronGeometry args={[1.5, 2]} /><meshBasicMaterial color={p.glow} transparent opacity={0.12} /></mesh>
    </group>
  );
}

export default function UniverseScene({ planet, theme, species, level, friends, reduceMotion, onPick }: {
  planet: string; theme: string; species: string; level: number; friends: OrbitFriend[]; reduceMotion: boolean; onPick: (f: OrbitFriend) => void;
}) {
  const stars = useMemo(() => ({ count: reduceMotion ? 800 : 2500 }), [reduceMotion]);
  return (
    <Canvas frameloop={reduceMotion ? "demand" : "always"} dpr={[1, 1.75]} camera={{ position: [0, 3.2, 9.5], fov: 48 }}
      gl={{ antialias: true, powerPreference: "low-power" }} aria-label="Interactive 3D Universe. The same information is listed below." role="img">
      <color attach="background" args={[BG[theme] ?? BG.dusk!]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[6, 6, 6]} intensity={90} color="#fff1e6" />
      <pointLight position={[-7, -2, -4]} intensity={40} color="#6cc8ff" />
      <Stars radius={60} depth={40} count={stars.count} factor={3} fade speed={reduceMotion ? 0 : 0.6} />
      <Planet planet={planet} still={reduceMotion} />
      <Pet species={species} level={level} still={reduceMotion} />
      {friends.map((f, i) => <FriendOrb key={f.id} f={f} index={i} total={friends.length} still={reduceMotion} onPick={onPick} />)}
      <OrbitControls enablePan={false} minDistance={6} maxDistance={14} maxPolarAngle={Math.PI * 0.62} autoRotate={!reduceMotion} autoRotateSpeed={0.35} />
    </Canvas>
  );
}
