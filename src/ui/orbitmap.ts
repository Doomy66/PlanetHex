import type { Orbit, StarSystem } from "../gen/system";
import { valueFor } from "../gen/rng";
import type { SpectralClass } from "../gen/star";

/**
 * The system seen from above: the star at the middle, the orbits as the paths
 * they are, and everything the system holds standing somewhere on its own.
 *
 * The companion to the strip of ui/orbits.ts rather than a replacement for it.
 * The strip says what is in what order and how far out, which is what a referee
 * reads; this says what the system looks like, which is what makes it a place
 * rather than a table.
 *
 * Not to scale, and it cannot be: the outer orbit is two hundred times the inner
 * one and a drawing honest about that is a dot in an empty circle. The radii go
 * as a low power of the distance, so the inner orbits stay apart and the outer
 * ones stay on the page, and every distance is written on its own path.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The drawing is square, in these units, and scaled to whatever it is given. */
const SIZE = 1000;
const CENTRE = SIZE / 2;
/** The innermost and outermost path, as a fraction of the half-width. */
const RING = { nearest: 0.14, furthest: 0.93 } as const;
/**
 * How hard the distances are squeezed. One would be true scale and unreadable;
 * a third is close to drawing each orbit a fixed step further out. This leaves
 * the inner system open and still lets the outer orbits read as further away.
 */
const SQUEEZE = 0.42;
/** How far apart two paths must be before both get their distance written on. */
const LABEL_GAP = 62;

const STAR_COLOUR: Readonly<Record<SpectralClass, string>> = {
  O: "#9db4ff",
  B: "#bcd0ff",
  A: "#e2e9ff",
  F: "#fbf6e8",
  G: "#ffe9a8",
  K: "#ffc073",
  M: "#ff8a5c",
};

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export interface OrbitMap {
  readonly element: SVGSVGElement;
  render(system: StarSystem): void;
  /** A picture for the body in an orbit, given when it has been drawn. */
  setPicture(orbitIndex: number, png: string): void;
  setSelected(orbitIndex: number | null): void;
  onSelect(handler: (orbitIndex: number) => void): void;
}

export function createOrbitMap(): OrbitMap {
  const svg = make("svg", { class: "orbitmap", viewBox: `0 0 ${SIZE} ${SIZE}` });
  const pathLayer = make("g");
  const zoneLayer = make("g");
  const bodyLayer = make("g");
  const selectLayer = make("g");
  svg.append(zoneLayer, pathLayer, bodyLayer, selectLayer);

  const handlers: ((orbitIndex: number) => void)[] = [];
  const pictures = new Map<number, string>();
  const groups = new Map<number, SVGGElement>();
  let drawn: readonly Orbit[] = [];
  /** The system on the paths, held so a picture arriving later can be placed. */
  let shown: StarSystem | null = null;
  let places = new Map<number, { x: number; y: number; r: number }>();
  let selected: number | null = null;

  /** Where an orbit's path sits, as a radius in drawing units. */
  function radiusOf(orbit: Orbit, all: readonly Orbit[]): number {
    const near = all[0]!.au;
    const far = all.at(-1)!.au;
    const span = Math.pow(far, SQUEEZE) - Math.pow(near, SQUEEZE);
    const at = span === 0 ? 0 : (Math.pow(orbit.au, SQUEEZE) - Math.pow(near, SQUEEZE)) / span;
    return CENTRE * (RING.nearest + at * (RING.furthest - RING.nearest));
  }

  /** Where a body stands on its path. Fixed by the seed, so it never jumps. */
  function angleOf(system: StarSystem, orbit: Orbit): number {
    return valueFor(`${system.seed}:where`, orbit.index) * Math.PI * 2;
  }

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    const at = places.get(selected);
    if (at === undefined) return;
    selectLayer.append(
      make("circle", { class: "map-select", cx: at.x, cy: at.y, r: at.r + 14 }),
    );
  }

  function render(system: StarSystem): void {
    pictures.clear();
    groups.clear();
    places = new Map();
    drawn = system.orbits;
    shown = system;
    pathLayer.replaceChildren();
    zoneLayer.replaceChildren();
    bodyLayer.replaceChildren();

    // The habitable zone as the ring it is, between the paths either side of it.
    const habitable = system.orbits.filter((orbit) => orbit.habitable);
    if (habitable.length > 0) {
      const inner = radiusOf(habitable[0]!, system.orbits);
      const outer = radiusOf(habitable.at(-1)!, system.orbits);
      const width = Math.max(26, outer - inner);
      zoneLayer.append(
        make("circle", {
          class: "map-zone",
          cx: CENTRE,
          cy: CENTRE,
          r: (inner + outer) / 2,
          "stroke-width": width + 18,
        }),
      );
      const label = make("text", { class: "map-zone-label", x: CENTRE, y: CENTRE - (inner + outer) / 2 - 12 });
      label.textContent = "habitable";
      zoneLayer.append(label);
    }

    // The distance sits under its own path, and only where there is room for it:
    // the inner paths crowd together under the squeeze of SQUEEZE, and four
    // figures stacked on top of each other say less than one that can be read.
    let lastLabel = -Infinity;
    for (const orbit of system.orbits) {
      const r = radiusOf(orbit, system.orbits);
      pathLayer.append(make("circle", { class: "map-path", cx: CENTRE, cy: CENTRE, r }));
      if (r - lastLabel < LABEL_GAP) continue;
      lastLabel = r;
      const label = make("text", { class: "map-au", x: CENTRE, y: CENTRE + r - 8 });
      label.textContent = `${orbit.au} AU`;
      pathLayer.append(label);
    }

    drawStar(system);
    for (const orbit of system.orbits) drawBody(system, orbit);
    drawSelection();
  }

  function drawStar(system: StarSystem): void {
    const { primary, companion, companionOrbit } = system.stars;
    bodyLayer.append(
      make("circle", {
        class: "map-star",
        cx: CENTRE,
        cy: CENTRE,
        r: 26,
        fill: STAR_COLOUR[primary.spectral],
      }),
    );
    if (companion === null) return;
    // A close companion rides beside the primary; a far one sits outside every
    // path. SystemSpec 2.4 allows nothing in between.
    const close = companionOrbit === "close";
    bodyLayer.append(
      make("circle", {
        class: "map-star",
        cx: close ? CENTRE + 40 : CENTRE,
        cy: close ? CENTRE : CENTRE - CENTRE * RING.furthest - 26,
        r: close ? 16 : 20,
        fill: STAR_COLOUR[companion.spectral],
      }),
    );
  }

  function drawBody(system: StarSystem, orbit: Orbit): void {
    const content = orbit.content;
    const radius = radiusOf(orbit, system.orbits);
    const angle = angleOf(system, orbit);
    const x = CENTRE + Math.cos(angle) * radius;
    const y = CENTRE + Math.sin(angle) * radius;
    const r = sizeOf(orbit);
    places.set(orbit.index, { x, y, r });

    const group = make("g", { class: `map-body map-${content.kind}`, tabindex: 0 });
    group.setAttribute("role", "button");
    const title = make("title");
    title.textContent = `Orbit ${orbit.index}, ${orbit.au} AU`;
    group.append(title);
    group.append(make("circle", { class: "map-hit", cx: x, cy: y, r: Math.max(r + 12, 24) }));

    if (content.kind === "belt") {
      // A belt is drawn as the belt: a scattering all the way round its path.
      for (let i = 0; i < 90; i++) {
        const at = (i / 90) * Math.PI * 2;
        const wobble = 1 + (valueFor(`${system.seed}:belt:${orbit.index}`, i) - 0.5) * 0.06;
        group.append(
          make("circle", {
            class: "map-rock",
            cx: CENTRE + Math.cos(at) * radius * wobble,
            cy: CENTRE + Math.sin(at) * radius * wobble,
            r: 2.6,
          }),
        );
      }
    } else if (content.kind !== "empty") {
      const picture = pictures.get(orbit.index) ?? null;
      if (picture === null) {
        group.append(
          make("circle", {
            class: content.kind === "giant" ? "map-giant" : "map-world",
            cx: x,
            cy: y,
            r,
          }),
        );
      } else {
        const clip = `map-clip-${orbit.index}`;
        const path = make("clipPath", { id: clip });
        path.append(make("circle", { cx: x, cy: y, r }));
        group.append(
          path,
          make("image", {
            href: picture,
            x: x - r,
            y: y - r,
            width: r * 2,
            height: r * 2,
            "clip-path": `url(#${clip})`,
            preserveAspectRatio: "xMidYMid slice",
          }),
          make("circle", {
            class:
              content.kind === "world" && content.main ? "map-edge map-edge-main" : "map-edge",
            cx: x,
            cy: y,
            r,
          }),
        );
      }
      if (content.kind === "giant") {
        group.append(
          make("ellipse", { class: "map-ring", cx: x, cy: y, rx: r * 1.7, ry: r * 0.42 }),
        );
      }
    }

    group.addEventListener("click", () => {
      for (const handler of handlers) handler(orbit.index);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      for (const handler of handlers) handler(orbit.index);
    });

    const already = groups.get(orbit.index);
    if (already === undefined) bodyLayer.append(group);
    else already.replaceWith(group);
    groups.set(orbit.index, group);
  }

  /** How big a body is drawn. Kind, not scale: a giant beside a world. */
  function sizeOf(orbit: Orbit): number {
    switch (orbit.content.kind) {
      case "giant":
        return 26;
      case "world":
        return orbit.content.main ? 22 : 16;
      default:
        return 6;
    }
  }

  return {
    element: svg,
    render,
    setPicture(orbitIndex, png) {
      const orbit = drawn.find((held) => held.index === orbitIndex);
      if (orbit === undefined) return;
      pictures.set(orbitIndex, png);
      if (shown !== null) drawBody(shown, orbit);
      drawSelection();
    },
    setSelected(orbitIndex) {
      selected = orbitIndex;
      drawSelection();
    },
    onSelect(handler) {
      handlers.push(handler);
    },
  };
}
