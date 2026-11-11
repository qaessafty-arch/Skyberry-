/**
 * Pure planet-surface generator (no DOM, no three.js), shared by the Web Worker and the
 * main-thread fallback. Produces RGBA rows bottom-up, ready for THREE.DataTexture.
 */
export const PALETTES: Record<string, { deep: string; shallow: string; shore: string; land: string; high: string }> = {
  berry: { deep: "#0d4573", shallow: "#2a9fd8", shore: "#a8e3fa", land: "#bfdff0", high: "#f2f9fd" },
  lagoon: { deep: "#0a3a5a", shallow: "#14a6c8", shore: "#86e6ef", land: "#3e9a8b", high: "#d4f1ea" },
  ember: { deep: "#173a5e", shallow: "#2d74a6", shore: "#f1d9b8", land: "#d9a874", high: "#fff3e3" },
  meadow: { deep: "#0c3c5d", shallow: "#2a90c2", shore: "#d2ebcb", land: "#82ba8c", high: "#eef8ee" },
};
export type PlanetPixels = { w: number; h: number; map: Uint8Array; bump: Uint8Array; rough: Uint8Array; clouds: Uint8Array };

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
const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Matches three.js colour management (hex is sRGB, stored linear) so the tuned look is unchanged.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const rgb = (hex: string) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

export function generatePlanetPixels(style: string, w: number): PlanetPixels {
  const P = PALETTES[style] ?? PALETTES.berry!;
  const deep = rgb(P.deep), shallow = rgb(P.shallow), shore = rgb(P.shore), land = rgb(P.land), high = rgb(P.high);
  const h = w / 2, n = w * h * 4;
  const map = new Uint8Array(n), bump = new Uint8Array(n), rough = new Uint8Array(n), clouds = new Uint8Array(n);
  const sea = 0.5;
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * Math.PI, row = (h - 1 - y) * w; // bottom-up rows for DataTexture
    const sl = Math.sin(lat), sy = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const sx = sl * Math.cos(lon), sz = sl * Math.sin(lon);
      const height = fbm(sx * 1.6 + 3.1, sy * 1.6, sz * 1.6, 6) + Math.pow(Math.abs(sy), 6) * 0.35;
      const c: [number, number, number] = height < sea ? mix(deep, shallow, smooth(height, 0.3, sea)) : height < sea + 0.025 ? shore : mix(land, high, smooth(height, sea + 0.05, 0.78));
      const detail = 0.94 + 0.12 * noise3(sx * 22, sy * 22, sz * 22);
      const i = (row + x) * 4;
      map[i] = Math.min(255, c[0]! * 255 * detail); map[i + 1] = Math.min(255, c[1]! * 255 * detail); map[i + 2] = Math.min(255, c[2]! * 255 * detail); map[i + 3] = 255;
      const b = Math.min(255, height < sea ? 70 : 70 + (height - sea) * 520);
      bump[i] = bump[i + 1] = bump[i + 2] = b; bump[i + 3] = 255;
      const r = height < sea ? 60 : 225; // glossy seas, matte land
      rough[i] = rough[i + 1] = rough[i + 2] = r; rough[i + 3] = 255;
      const a = smooth(fbm(sx * 2.6 + 11, sy * 3.4, sz * 2.6, 5), 0.5, 0.72);
      clouds[i] = clouds[i + 1] = clouds[i + 2] = 255; clouds[i + 3] = a * 215;
    }
  }
  return { w, h, map, bump, rough, clouds };
}
