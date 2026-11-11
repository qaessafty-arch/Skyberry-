"use client";
import { forwardRef, useMemo } from "react";
import * as THREE from "three";
import type { ThreeElements } from "@react-three/fiber";

/**
 * Shell-textured fur on top of three's physically based MeshStandardMaterial.
 * Layer 0 is the opaque undercoat; layers 1..N are pushed out along the normal and keep only
 * the texels whose strand value survives at that height, which reads as individual hairs.
 * Hairs darken at the root (occlusion), droop slightly with gravity and catch an icy tip tint.
 */
export type FurOptions = { length: number; density: number; gravity?: number; tipTint?: THREE.ColorRepresentation; roughness?: number; grain?: number };

export function makeFurMaterials(shells: number, noise: THREE.Texture, o: FurOptions) {
  const tip = new THREE.Color(o.tipTint ?? "#d9f2ff");
  const mats: THREE.MeshPhysicalMaterial[] = [];
  for (let i = 0; i <= shells; i++) {
    const h = i / shells;
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: o.roughness ?? 0.82, metalness: 0, side: THREE.FrontSide,
      sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color("#dff4ff") });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uShell = { value: h };
      shader.uniforms.uFurLen = { value: o.length };
      shader.uniforms.uDensity = { value: o.density };
      shader.uniforms.uGravity = { value: o.gravity ?? 0.35 };
      shader.uniforms.uNoise = { value: noise };
      shader.uniforms.uTip = { value: tip };
      shader.uniforms.uGrain = { value: o.grain ?? 0.12 };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uShell; uniform float uFurLen; uniform float uDensity; uniform float uGravity; attribute float furMask; varying vec2 vFurUv; varying float vShell; varying float vMask;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed += normalize(objectNormal) * uShell * uFurLen * furMask;
          transformed.y -= uShell * uShell * uFurLen * uGravity * furMask;
          vFurUv = uv * uDensity; vShell = uShell; vMask = furMask;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D uNoise; uniform vec3 uTip; uniform float uGrain; varying vec2 vFurUv; varying float vShell; varying float vMask;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float strand = texture2D(uNoise, vFurUv).r;
          if (vShell > 0.0 && (vMask < 0.05 || strand < 0.18 + vShell * 0.8)) discard;
          diffuseColor.rgb *= mix(0.86, 1.04, vShell) * (1.0 - uGrain + uGrain * 1.6 * strand); // strand texture on every layer
          diffuseColor.rgb = mix(diffuseColor.rgb, uTip, vShell * vShell * 0.28);`);
    };
    m.customProgramCacheKey = () => "skyberry-fur";
    mats.push(m);
  }
  return mats;
}

/** Renders a geometry with its fur shells. Only the undercoat casts shadows (cheap). */
export const FurMesh = forwardRef<THREE.Group, { geometry: THREE.BufferGeometry; materials: THREE.Material[] } & ThreeElements["group"]>(
  function FurMesh({ geometry, materials, ...group }, ref) {
    const layers = useMemo(() => materials.map((m, i) => ({ m, i })), [materials]);
    return (
      <group ref={ref} {...group}>
        {layers.map(({ m, i }) => (
          <mesh key={i} geometry={geometry} material={m} castShadow={i === 0} receiveShadow={i === 0} renderOrder={i} />
        ))}
      </group>
    );
  },
);
