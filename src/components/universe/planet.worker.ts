/// <reference lib="webworker" />
import { generatePlanetPixels } from "./planet-gen";

// Generates planet surfaces off the main thread so the page never freezes.
self.onmessage = (e: MessageEvent<{ id: number; style: string; w: number }>) => {
  const { id, style, w } = e.data;
  const px = generatePlanetPixels(style, w);
  (self as unknown as Worker).postMessage({ id, px }, [px.map.buffer, px.bump.buffer, px.rough.buffer, px.clouds.buffer]);
};
