/**
 * A gas giant, drawn. SystemSpec 8.1.
 *
 * The worlds of a system are the globes the planet view draws, and a gas giant
 * beside them as a flat disc looks like the one thing on the diagram nobody
 * bothered with. It has no surface to generate - there is nothing to land on -
 * so this is a picture rather than a world: bands, a shaded limb, and a tilt,
 * all drawn from the seed so the same giant comes up the same way.
 *
 * Cheap, unlike a world: no height field, no grid, no renderer. A few dozen
 * strips of colour on a canvas.
 */

import { valueFor } from "../gen/rng";

/**
 * The palettes a giant can be. Jupiter's ochres, Saturn's cream, and the two
 * pale blues of the ice giants, which is the range the solar system actually
 * shows and about as far as anybody can say a gas giant looks.
 */
const PALETTES: readonly (readonly [string, string, string])[] = [
  ["#c9a06a", "#e3c89a", "#8f6b44"],
  ["#d9c49a", "#f0e2bf", "#a8926a"],
  ["#b9c8d8", "#dfe9f2", "#8fa2b6"],
  ["#8fa8c4", "#c3d6e6", "#6b839c"],
  ["#c08a6a", "#e0b394", "#8a5f45"],
];

/** How many bands a giant carries across its face. */
const BANDS = { fewest: 7, most: 16 } as const;

const cache = new Map<string, string>();

function draw(seed: string, px: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return "";

  const pick = (stream: string, index = 0) => valueFor(`${seed}:giant:${stream}`, index);
  const palette = PALETTES[Math.floor(pick("palette") * PALETTES.length)]!;
  const bands = BANDS.fewest + Math.floor(pick("bands") * (BANDS.most - BANDS.fewest + 1));
  const r = px / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = palette[0]!;
  ctx.fillRect(0, 0, px, px);

  // Bands run across the face, wider at the equator and squeezed at the poles,
  // which is what a sphere does to lines of latitude seen side on.
  for (let i = 0; i < bands; i++) {
    const from = Math.asin(Math.max(-1, Math.min(1, (i / bands) * 2 - 1)));
    const to = Math.asin(Math.max(-1, Math.min(1, ((i + 1) / bands) * 2 - 1)));
    const y0 = r + (from / (Math.PI / 2)) * r;
    const y1 = r + (to / (Math.PI / 2)) * r;
    const shade = pick("band", i);
    ctx.fillStyle = shade < 0.45 ? palette[1]! : shade < 0.8 ? palette[0]! : palette[2]!;
    ctx.globalAlpha = 0.55 + pick("band-alpha", i) * 0.45;
    ctx.fillRect(0, y0, px, Math.max(1, y1 - y0));
  }
  ctx.globalAlpha = 1;

  // A storm, on about half of them. One oval, because two look like a pattern.
  if (pick("storm") < 0.5) {
    const y = r + (pick("storm-lat") - 0.5) * r * 1.1;
    const x = r + (pick("storm-long") - 0.5) * r * 1.2;
    ctx.fillStyle = palette[2]!;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y, px * 0.11, px * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The limb: lit from the same side the globes are, so a giant and a world on
  // one diagram are under one sun.
  const light = ctx.createRadialGradient(r * 0.65, r * 0.6, r * 0.1, r, r, r);
  light.addColorStop(0, "rgba(255,255,255,0.18)");
  light.addColorStop(0.55, "rgba(0,0,0,0)");
  light.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, px, px);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/** A gas giant as a PNG, drawn once per seed and size. */
export function giantImage(seed: string, px: number): string {
  const key = `${seed}|${px}`;
  const held = cache.get(key);
  if (held !== undefined) return held;
  const url = draw(seed, px);
  cache.set(key, url);
  return url;
}
