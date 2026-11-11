"use client";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { PetProps } from "./types";

/**
 * Renders an authored, rigged GLB companion. Expected animation clips (case-insensitive):
 *   Idle, Attention, Happy, Sleepy, React — any missing clip falls back to Idle.
 * The desired clip is resolved every frame from mood + recent events and cross-faded (0.35 s).
 */
export function GlbPet({ url, mood, reactKey, happyKey, onTap, level }: PetProps & { url: string }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, group);
  const timers = useRef({ reactUntil: 0, happyUntil: 0, current: "" });
  // three.js animation actions are external mutable objects: hold them in a ref.
  const mixer = useRef({ actions, names });
  useEffect(() => { mixer.current = { actions, names }; }, [actions, names]);

  useEffect(() => { if (reactKey) timers.current.reactUntil = performance.now() + 1800; }, [reactKey]);
  useEffect(() => { if (happyKey) timers.current.happyUntil = performance.now() + 3200; }, [happyKey]);
  useEffect(() => { scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }, [scene]);

  useFrame(() => {
    const now = performance.now(), tm = timers.current;
    const { actions: acts, names: clipNames } = mixer.current;
    const want = now < tm.reactUntil ? "React" : now < tm.happyUntil ? "Happy" : mood === "sleepy" ? "Sleepy" : "Idle";
    const name = clipNames.find((n) => n.toLowerCase() === want.toLowerCase()) ?? clipNames.find((n) => /idle/i.test(n)) ?? clipNames[0];
    if (!name || name === tm.current) return;
    const next = acts[name];
    if (!next) return;
    if (tm.current) acts[tm.current]?.fadeOut(0.35);
    next.reset().setLoop(want === "React" ? THREE.LoopOnce : THREE.LoopRepeat, Infinity).fadeIn(0.35).play();
    next.clampWhenFinished = want === "React";
    tm.current = name;
  });

  return (
    <group ref={group} scale={0.92 + Math.min(level, 10) * 0.012} onPointerDown={(e) => { e.stopPropagation(); onTap?.(); }}>
      <primitive object={scene} />
    </group>
  );
}
