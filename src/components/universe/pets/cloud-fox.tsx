"use client";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COAT, TailGeometry, bodyGeometry, earGeometry, furNoiseTexture, headGeometry, irisTexture, legGeometry, ruffGeometry } from "./fox-geometry";
import { FurMesh, makeFurMaterials } from "./fur";
import type { PetProps } from "./types";

/**
 * PIP — the Skyberry cloud fox (procedural real-time version).
 * Rig: root → body → (ruff, neck → head → eyes/lids/ears/nose, legs, tail).
 * Behaviour: a small state machine blends idle / attention / happy / sleepy / react poses with
 * critically-damped springs, so every transition is smooth and nothing loops mechanically.
 */
const damp = THREE.MathUtils.damp;
const BODY_Y = 0.5;

type Mode = "idle" | "attention" | "happy" | "sleepy" | "react";

export function CloudFox({ mood, level, accessory, reactKey, happyKey, reduceMotion, quality, onTap }: PetProps) {
  const shells = quality === "high" ? 20 : 12;
  const assets = useMemo(() => {
    const noise = furNoiseTexture();
    const tail = new TailGeometry();
    return {
      noise, tail,
      body: bodyGeometry(), ruff: ruffGeometry(), head: headGeometry(),
      earOuter: earGeometry(false), earInner: earGeometry(true),
      legF: legGeometry(0.35, true), legH: legGeometry(0.37, false),
      bodyFur: makeFurMaterials(shells, noise, { length: 0.032, density: 2.2, gravity: 0.5 }),
      headFur: makeFurMaterials(shells, noise, { length: 0.02, density: 2.6, gravity: 0.2 }),
      ruffFur: makeFurMaterials(shells, noise, { length: 0.055, density: 1.8, gravity: 0.6 }),
      tailFur: makeFurMaterials(shells, noise, { length: 0.1, density: 1.4, gravity: 0.5, tipTint: "#ffffff", grain: 0.38 }),
      earFur: makeFurMaterials(Math.max(6, Math.round(shells / 2)), noise, { length: 0.014, density: 3.4, gravity: 0.05 }),
      legFur: makeFurMaterials(Math.max(6, Math.round(shells / 2)), noise, { length: 0.012, density: 3, gravity: 0.1 }),
      skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color("#dff4ff") }),
      earSkin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, sheen: 0.8, sheenColor: new THREE.Color("#dff4ff") }),
      innerEar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
      nose: new THREE.MeshPhysicalMaterial({ color: COAT.nose, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 }),
      eye: new THREE.MeshPhysicalMaterial({ map: irisTexture(), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 }),
      lid: new THREE.MeshStandardMaterial({ color: COAT.silverLight, roughness: 0.9 }),
      scarf: new THREE.MeshStandardMaterial({ color: "#48b9f2", roughness: 0.75 }),
      collar: new THREE.MeshPhysicalMaterial({ color: "#eef7fc", roughness: 0.35, metalness: 0.2, clearcoat: 1 }),
      charm: new THREE.MeshPhysicalMaterial({ color: "#e8f7ff", emissive: "#42d5e8", emissiveIntensity: 0.6, roughness: 0.15, clearcoat: 1 }),
    };
  }, [shells]);
  useEffect(() => () => {
    Object.values(assets).forEach((a) => {
      if (Array.isArray(a)) a.forEach((m) => m.dispose());
      else if (a && typeof (a as { dispose?: () => void }).dispose === "function") (a as { dispose: () => void }).dispose();
    });
  }, [assets]);

  // rig refs
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), neck = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const earL = useRef<THREE.Group>(null), earR = useRef<THREE.Group>(null), lidL = useRef<THREE.Mesh>(null), lidR = useRef<THREE.Mesh>(null);
  const eyeL = useRef<THREE.Mesh>(null), eyeR = useRef<THREE.Mesh>(null), tailPivot = useRef<THREE.Group>(null);
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];

  // brain state (refs: no React re-renders per frame)
  const brain = useRef({ mode: (mood === "sleepy" ? "sleepy" : "idle") as Mode, until: 0, nextBlink: 1.5, blink: 0, earTwitch: 0, nextTwitch: 3,
    look: new THREE.Vector2(), lastPointer: -10, pointer: new THREE.Vector2(), tapPoint: new THREE.Vector3(), hop: 0,
    s: { bodyY: BODY_Y, neckX: 0, headY: 0, headX: 0, headZ: 0, ears: 0, lids: 0, wagAmp: 0.08, wagFreq: 1.1, curl: 0, tuck: 0, breath: 0 } });
  const tailCurve = useMemo(() => new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(() => new THREE.Vector3())), []);

  // external events → behaviour
  useEffect(() => { const b = brain.current; if (b.mode !== "react") b.mode = mood === "sleepy" ? "sleepy" : "idle"; }, [mood]);
  useEffect(() => { if (!reactKey) return; const b = brain.current; b.mode = "react"; b.until = performance.now() / 1000 + 1.8; b.hop = 1; }, [reactKey]);
  useEffect(() => { if (!happyKey) return; const b = brain.current; b.mode = "happy"; b.until = performance.now() / 1000 + 3.2; b.hop = 1; }, [happyKey]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const now = performance.now() / 1000;
    const b = brain.current, s = b.s;

    // pointer attention: if the user moved over the scene recently, Pip watches them
    if (!b.pointer.equals(state.pointer)) { b.pointer.copy(state.pointer); b.lastPointer = now; }
    if ((b.mode === "react" || b.mode === "happy") && now > b.until) b.mode = mood === "sleepy" ? "sleepy" : "idle";
    const attentive = now - b.lastPointer < 2.5 && b.mode !== "sleepy";
    const mode: Mode = b.mode === "idle" && attentive ? "attention" : b.mode;

    // targets per mode
    const tg = { bodyY: BODY_Y, neckX: 0.05, headY: 0, headX: 0, headZ: 0, ears: 0, lids: 0, wagAmp: 0.08, wagFreq: 1.1, curl: 0, tuck: 0 };
    const drift = reduceMotion ? 0 : 1;
    tg.headY = 0.18 * Math.sin(t * 0.37) * drift; // gentle idle look-around
    tg.headX = 0.06 * Math.sin(t * 0.23 + 1) * drift;
    if (mode === "attention") {
      tg.headY = THREE.MathUtils.clamp(b.pointer.x * 0.75, -0.75, 0.75);
      tg.headX = THREE.MathUtils.clamp(-b.pointer.y * 0.35, -0.3, 0.35);
      tg.ears = 1; tg.wagAmp = 0.12;
    } else if (mode === "happy") {
      tg.ears = 0.7; tg.wagAmp = 0.42; tg.wagFreq = 5.2; tg.headZ = 0.12 * Math.sin(t * 3); tg.lids = 0.35; tg.neckX = -0.12;
    } else if (mode === "react") {
      tg.ears = 1; tg.wagAmp = 0.3; tg.wagFreq = 4; tg.headZ = 0.22; tg.headY = 0.25; tg.neckX = -0.08;
    } else if (mode === "sleepy") {
      tg.bodyY = 0.27; tg.neckX = 0.62; tg.headY = 0.35; tg.headZ = 0.18; tg.ears = -0.9; tg.lids = 1; tg.wagAmp = 0.02; tg.wagFreq = 0.4; tg.curl = 1; tg.tuck = 1;
    }

    // springs (frame-rate independent)
    const k = reduceMotion ? 50 : 6;
    for (const key of Object.keys(tg) as (keyof typeof tg)[]) s[key] = damp(s[key], tg[key], key === "lids" ? 18 : k, dt);

    // blink (not while sleeping) and ear twitch
    if (!reduceMotion && mode !== "sleepy" && now > b.nextBlink) { b.blink = 1; b.nextBlink = now + 2 + Math.random() * 4; }
    b.blink = damp(b.blink, 0, 14, dt);
    if (!reduceMotion && now > b.nextTwitch) { b.earTwitch = 1; b.nextTwitch = now + 3 + Math.random() * 5; }
    b.earTwitch = damp(b.earTwitch, 0, 7, dt);
    b.hop = damp(b.hop, 0, 3.2, dt);

    // breathing: slow, deeper when asleep
    const breathRate = mode === "sleepy" ? 0.8 : 1.6;
    const breath = reduceMotion ? 0 : Math.sin(t * breathRate);

    // apply rig
    if (body.current) {
      const hop = Math.sin(Math.min(1, 1 - b.hop) * Math.PI) * 0.12 * (b.hop > 0.02 ? 1 : 0);
      body.current.position.y = s.bodyY + hop;
      body.current.scale.set(1 + breath * 0.012, 1 + breath * 0.018, 1);
    }
    if (neck.current) neck.current.rotation.x = s.neckX;
    if (head.current) head.current.rotation.set(s.headX, s.headY, s.headZ);
    const lid = Math.max(s.lids, b.blink);
    const lidRot = -1.75 + lid * 3.05; // open: lid tucked under the brow fur
    if (lidL.current) lidL.current.rotation.x = lidRot;
    if (lidR.current) lidR.current.rotation.x = lidRot;
    const eyeYaw = mode === "attention" ? THREE.MathUtils.clamp(b.pointer.x * 0.35, -0.35, 0.35) : 0;
    if (eyeL.current) eyeL.current.rotation.y = eyeYaw;
    if (eyeR.current) eyeR.current.rotation.y = eyeYaw;
    const earBase = 0.32, earUp = s.ears * 0.22;
    if (earL.current) earL.current.rotation.set(-0.12 - earUp * 0.4 + (s.ears < 0 ? -s.ears * 0.5 : 0), 0, earBase - earUp + b.earTwitch * 0.25);
    if (earR.current) earR.current.rotation.set(-0.12 - earUp * 0.4 + (s.ears < 0 ? -s.ears * 0.5 : 0), 0, -earBase + earUp);

    // legs: tuck under the body when lying down
    legs.forEach((l, i) => {
      if (!l.current) return;
      const front = i < 2;
      l.current.rotation.x = s.tuck * (front ? -1.35 : 1.25);
      l.current.scale.y = 1 - s.tuck * 0.35;
    });

    // tail: spine re-posed each frame (wag + slow sway, curls around the body when sleeping)
    const wag = Math.sin(t * s.wagFreq) * s.wagAmp;
    const awake = [[0, 0, 0], [0, 0.05, -0.18], [0, 0.18, -0.36], [0, 0.34, -0.47], [0, 0.46, -0.5]]; // plume angled back and up
    const curled = [[0, 0, 0], [0.13, -0.16, -0.1], [0.33, -0.24, 0.1], [0.36, -0.25, 0.38], [0.2, -0.24, 0.6]];
    tailCurve.points.forEach((pt, i) => {
      const a = awake[i]!, c = curled[i]!, f = Math.pow(i / 4, 1.3);
      pt.set(THREE.MathUtils.lerp(a[0]!, c[0]!, s.curl) + wag * f, THREE.MathUtils.lerp(a[1]!, c[1]!, s.curl), THREE.MathUtils.lerp(a[2]!, c[2]!, s.curl));
    });
    assets.tail.pose(tailCurve);
    if (tailPivot.current) tailPivot.current.rotation.y = wag * 0.6;
    if (reduceMotion) state.invalidate();
  });

  const tap = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onTap?.(); };
  const scarf = accessory === "cloud_scarf";
  const charm = accessory === "star_charm";
  const grow = 0.9 + Math.min(level, 10) * 0.012; // Pip grows a little with each level

  return (
    <group ref={root} scale={grow} rotation={[0, -0.42, 0]} onPointerDown={tap}>
      <group ref={body} position={[0, BODY_Y, 0]}>
        <FurMesh geometry={assets.body} materials={assets.bodyFur} />
        <FurMesh geometry={assets.ruff} materials={assets.ruffFur} position={[0, 0.13, 0.33]} />

        {/* legs: shoulders/hips → paws on the ground */}
        {([[0.11, -0.08, 0.3, true], [-0.11, -0.08, 0.3, true], [0.12, -0.06, -0.32, false], [-0.12, -0.06, -0.32, false]] as const).map(([x, y, z, f], i) => (
          <group key={i} ref={legs[i]} position={[x, y, z]}>
            <FurMesh geometry={f ? assets.legF : assets.legH} materials={assets.legFur} />
          </group>
        ))}

        <group ref={neck} position={[0, 0.2, 0.4]}>
          <group ref={head} position={[0, 0.17, 0.07]} scale={0.92}>
            <FurMesh geometry={assets.head} materials={assets.headFur} />
            <mesh position={[0, -0.075, 0.425]} scale={[0.048, 0.034, 0.04]} material={assets.nose}><sphereGeometry args={[1, 24, 16]} /></mesh>
            {([[1, eyeL, lidL], [-1, eyeR, lidR]] as const).map(([side, eRef, lRef]) => (
              <group key={side} position={[0.092 * side, 0.046, 0.212]} rotation={[0, 0.36 * side, 0]}>
                <mesh ref={eRef} material={assets.eye} rotation={[0, -Math.PI / 2, 0]}><sphereGeometry args={[0.055, 32, 24]} /></mesh>
                <mesh ref={lRef} material={assets.lid}><sphereGeometry args={[0.056, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
              </group>
            ))}
            {([[1, earL], [-1, earR]] as const).map(([side, ref]) => (
              <group key={side} ref={ref} position={[0.13 * side, 0.14, -0.04]}>
                <FurMesh geometry={assets.earOuter} materials={assets.earFur} />
                <mesh geometry={assets.earInner} material={assets.innerEar} />
              </group>
            ))}
          </group>
          {scarf && (
            <mesh position={[0, -0.02, 0.02]} rotation={[1.35, 0, 0]} material={assets.scarf} castShadow>
              <torusGeometry args={[0.21, 0.045, 16, 48]} />
            </mesh>
          )}
          {charm && (
            <group>
              <mesh position={[0, -0.03, 0.05]} rotation={[1.25, 0, 0]} material={assets.collar}><torusGeometry args={[0.19, 0.011, 10, 56]} /></mesh>
              <mesh position={[0, -0.115, 0.275]} rotation={[0.2, 0.6, 0]} scale={[1, 1.35, 1]} material={assets.charm}><octahedronGeometry args={[0.036, 0]} /></mesh>
            </group>
          )}
        </group>

        <group ref={tailPivot} position={[0, 0.06, -0.5]}>
          <FurMesh geometry={assets.tail.geometry} materials={assets.tailFur} />
        </group>
      </group>
    </group>
  );
}
