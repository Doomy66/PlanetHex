import type { Moon, Orbit, StarSystem } from "../gen/system";
import { basesLabel, hasNaval, hasScout, zoneLabel } from "../gen/base";
import type { SpectralClass, Star } from "../gen/star";

/**
 * The orbit diagram. SystemSpec section 8.
 *
 * The star at one end and the orbits laid out from it, each slot holding what it
 * holds. Schematic rather than to scale, under 8.2: the outer orbits are hundreds
 * of times the inner ones, and a picture honest about that is a picture of empty
 * space with a dot in the corner. The distances are stated on the diagram and in
 * the panel, which is where a number belongs.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The drawing is laid out in these units and scaled to whatever it is given. */
const HEIGHT = 150;
const STAR_X = 56;
const FIRST_ORBIT_X = 130;
const ORBIT_GAP = 82;
const AXIS_Y = 74;
const RIGHT_PAD = 60;

/** How big a star is drawn, by its size class, in the units above. */
const STAR_RADIUS = { giant: 34, ordinary: 20, dwarf: 9 } as const;

/**
 * What each class is drawn in. A star's colour is its temperature, which is the
 * one thing about a star everybody already knows how to read: blue is hot, red
 * is cold, and the Sun is in between.
 */
const STAR_COLOUR: Readonly<Record<SpectralClass, string>> = {
  O: "#9db4ff",
  B: "#bcd0ff",
  A: "#e2e9ff",
  F: "#fbf6e8",
  G: "#ffe9a8",
  K: "#ffc073",
  M: "#ff8a5c",
};

function radiusOf(star: Star): number {
  if (star.size === "D") return STAR_RADIUS.dwarf;
  if (star.size === "V" || star.size === "VI") return STAR_RADIUS.ordinary;
  return STAR_RADIUS.giant;
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** A distance as the diagram states it. SystemSpec 3.4.1: one or two figures. */
export function auLabel(au: number): string {
  if (au >= 10) return `${Math.round(au)} AU`;
  if (au >= 1) return `${au.toFixed(1).replace(/\.0$/, "")} AU`;
  return `${au.toFixed(2).replace(/0$/, "")} AU`;
}

/** What an orbit holds, in a word, for the diagram and the panel alike. */
export function contentLabel(orbit: Orbit): string {
  switch (orbit.content.kind) {
    case "world":
      return orbit.content.main ? "Main world" : "World";
    case "giant":
      return "Gas giant";
    case "belt":
      return "Belt";
    default:
      return "Empty";
  }
}

/** How many moons are drawn under a gas giant before the rest are a figure. */
const MOONS_SHOWN = 8;
const MOON_GAP = 9;
const MOON_Y = AXIS_Y + 31;
/**
 * Where the chart's own marks sit: between the zone's label along the top of the
 * strip and the body itself, which is the one band of the slot with nothing in
 * it.
 */
const MARK_Y = 40;
const MARK_GAP = 15;

export interface OrbitDiagram {
  readonly element: SVGSVGElement;
  render(system: StarSystem): void;
  /**
   * Put the picture of a world into the orbit it is in, so the mark on the
   * diagram is the world itself rather than a disc standing in for one.
   *
   * Given after the fact rather than at render, because drawing a world costs
   * about as much as opening one: the diagram goes up at once with discs on it
   * and the worlds arrive as they are drawn.
   */
  setPicture(orbitIndex: number, png: string): void;
  /** Mark a body: an orbit, and a moon of it where one is what is selected. */
  setSelected(orbitIndex: number | null, moon?: number | null): void;
  onSelect(handler: (orbitIndex: number) => void): void;
  /** A moon picked off the strip, under the gas giant it belongs to. */
  onSelectMoon(handler: (orbitIndex: number, moon: number) => void): void;
}

export function createOrbitDiagram(): OrbitDiagram {
  const svg = make("svg", { class: "orbits" });
  const zoneLayer = make("g");
  const axisLayer = make("g");
  const bodyLayer = make("g");
  const selectLayer = make("g");
  svg.append(zoneLayer, axisLayer, bodyLayer, selectLayer);

  const handlers: ((orbitIndex: number) => void)[] = [];
  const moonHandlers: ((orbitIndex: number, moon: number) => void)[] = [];
  const pictures = new Map<number, string>();
  let shown: StarSystem | null = null;
  const groups = new Map<number, SVGGElement>();
  let placed: { index: number; x: number }[] = [];
  let selected: number | null = null;
  let selectedMoon: number | null = null;
  let drawn: readonly Orbit[] = [];

  function xOf(index: number): number {
    const at = placed.findIndex((slot) => slot.index === index);
    return at < 0 ? FIRST_ORBIT_X : placed[at]!.x;
  }

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    selectLayer.append(
      make("circle", {
        class: "orbit-select",
        cx: xOf(selected),
        cy: AXIS_Y,
        r: 28,
      }),
    );
    // A moon selected anywhere is marked here too, so the three views agree
    // about which body is being looked at rather than only which orbit.
    if (selectedMoon === null) return;
    const orbit = drawn.find((held) => held.index === selected);
    if (orbit === undefined || orbit.content.kind !== "giant") return;
    const at = moonPlaces(orbit.content.moons, xOf(selected)).get(selectedMoon);
    if (at === undefined) return;
    selectLayer.append(make("circle", { class: "orbit-moon-select", cx: at, cy: MOON_Y, r: 5 }));
  }

  /** Where each moon's mark sits under its giant, laid out from the middle. */
  function moonPlaces(moons: readonly Moon[], x: number): Map<number, number> {
    const shown = moons.slice(0, MOONS_SHOWN);
    const from = x - ((shown.length - 1) * MOON_GAP) / 2;
    return new Map(shown.map((moon, at) => [moon.index, from + at * MOON_GAP]));
  }

  function render(system: StarSystem): void {
    shown = system;
    pictures.clear();
    groups.clear();
    drawn = system.orbits;
    zoneLayer.replaceChildren();
    axisLayer.replaceChildren();
    bodyLayer.replaceChildren();

    placed = system.orbits.map((orbit, at) => ({
      index: orbit.index,
      x: FIRST_ORBIT_X + at * ORBIT_GAP,
    }));
    const width = (placed.at(-1)?.x ?? FIRST_ORBIT_X) + RIGHT_PAD;
    svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);

    // The habitable zone, drawn behind everything, because it is why most of the
    // systems that matter matter. SystemSpec 8.3.
    const habitable = system.orbits.filter((orbit) => orbit.habitable);
    if (habitable.length > 0) {
      const from = xOf(habitable[0]!.index) - ORBIT_GAP / 2;
      const to = xOf(habitable.at(-1)!.index) + ORBIT_GAP / 2;
      zoneLayer.append(
        make("rect", { class: "orbit-zone", x: from, y: 10, width: to - from, height: HEIGHT - 20 }),
      );
      const label = make("text", { class: "orbit-zone-label", x: (from + to) / 2, y: 22 });
      label.textContent = "habitable";
      zoneLayer.append(label);
    }

    axisLayer.append(
      make("line", {
        class: "orbit-axis",
        x1: STAR_X,
        y1: AXIS_Y,
        x2: width - RIGHT_PAD / 2,
        y2: AXIS_Y,
      }),
    );

    drawStars(system);
    for (const orbit of system.orbits) drawOrbit(orbit, xOf(orbit.index));
    drawSelection();
  }

  function drawStars(system: StarSystem): void {
    const { primary, companion, companionOrbit } = system.stars;
    axisLayer.append(
      make("circle", {
        class: "orbit-star",
        cx: STAR_X,
        cy: AXIS_Y,
        r: radiusOf(primary),
        fill: STAR_COLOUR[primary.spectral],
      }),
    );
    if (companion === null) return;
    // Inside every orbit or outside all of them, which is the only arrangement
    // SystemSpec 2.4 allows and the reason this diagram has one axis.
    const close = companionOrbit === "close";
    axisLayer.append(
      make("circle", {
        class: "orbit-star orbit-companion",
        cx: close ? STAR_X + radiusOf(primary) + 14 : (placed.at(-1)?.x ?? STAR_X) + 34,
        cy: close ? AXIS_Y - radiusOf(primary) - 10 : AXIS_Y,
        r: radiusOf(companion),
        fill: STAR_COLOUR[companion.spectral],
      }),
    );
  }

  function drawOrbit(orbit: Orbit, x: number): void {
    const group = make("g", { class: `orbit orbit-${orbit.content.kind}`, tabindex: 0 });
    group.setAttribute("role", "button");
    group.dataset["orbit"] = String(orbit.index);
    const held = contentLabel(orbit);
    const title = make("title");
    title.textContent = `Orbit ${orbit.index}, ${auLabel(orbit.au)}: ${held}`;
    group.append(title);

    // The whole slot takes the click, not the dot in it: an empty orbit is worth
    // selecting, and a belt is not a shape anybody can hit.
    group.append(
      make("rect", {
        class: "orbit-hit",
        x: x - ORBIT_GAP / 2,
        y: 10,
        width: ORBIT_GAP,
        height: HEIGHT - 20,
      }),
    );
    group.append(make("line", { class: "orbit-tick", x1: x, y1: AXIS_Y - 7, x2: x, y2: AXIS_Y + 7 }));
    group.append(...bodyOf(orbit, x));
    drawChartMarks(group, orbit, x);

    if (orbit.content.kind === "giant") drawMoons(group, orbit.content.moons, x);

    const au = make("text", { class: "orbit-au", x, y: HEIGHT - 26 });
    au.textContent = auLabel(orbit.au);
    const what = make("text", { class: "orbit-label", x, y: HEIGHT - 10 });
    what.textContent = orbit.content.kind === "empty" ? "" : held.toLowerCase();
    group.append(au, what);

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

/**
   * The marks a chart puts on a hex, on the body they are actually about.
   * SubSectorSpec 4.2 draws them against the system as a whole; here there is
   * room to say which world they belong to, and that is the main world: a naval
   * base is a station in its orbit, a scout way station a field on it, and a
   * travel zone is a warning about the world people are going to.
   *
   * The same three marks the chart uses, so a referee who can read one can read
   * the other: the star, the triangle and the dashed ring.
   */
  function drawChartMarks(group: SVGGElement, orbit: Orbit, x: number): void {
    if (shown === null || orbit.index !== shown.bases.orbitIndex) return;
    const kinds: string[] = [];
    if (hasNaval(shown.bases.letter)) kinds.push("naval");
    if (hasScout(shown.bases.letter)) kinds.push("scout");
    if (shown.zone !== "") kinds.push("zone");
    const from = x - ((kinds.length - 1) * MARK_GAP) / 2;

    for (const [at, kind] of kinds.entries()) {
      const cx = from + at * MARK_GAP;
      const mark =
        kind === "naval"
          ? make("polygon", { class: "orbit-naval", points: starPoints(cx, MARK_Y) })
          : kind === "scout"
            ? make("polygon", {
                class: "orbit-scout",
                points: `${cx},${MARK_Y - 5} ${cx + 5},${MARK_Y + 4} ${cx - 5},${MARK_Y + 4}`,
              })
            : make("circle", {
                class: shown.zone === "R" ? "orbit-travel orbit-red" : "orbit-travel",
                cx,
                cy: MARK_Y,
                r: 5.5,
              });
      const title = make("title");
      title.textContent =
        kind === "zone" ? `${zoneLabel(shown.zone)} zone` : `${basesLabel(shown.bases.letter)} base`;
      mark.append(title);
      group.append(mark);
    }
  }

  function starPoints(cx: number, cy: number): string {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 6 : 2.6;
      const angle = (Math.PI / 180) * (i * 36 - 90);
      points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return points.join(" ");
  }

  /**
   * The moons of a gas giant, as a row of marks under it. SystemSpec 4.6.1 makes
   * every one of them a world, and a strip that showed none of them said a gas
   * giant was the end of that orbit rather than the start of it.
   *
   * Each mark is its own moon and picks it out; past eight the rest are a
   * figure, since nine dots and twelve dots look the same and the tree has the
   * list.
   */
  function drawMoons(group: SVGGElement, moons: readonly Moon[], x: number): void {
    const places = moonPlaces(moons, x);
    for (const moon of moons.slice(0, MOONS_SHOWN)) {
      const at = places.get(moon.index)!;
      const mark = make("circle", {
        class: hasPeople(moon) ? "orbit-moon orbit-moon-people" : "orbit-moon",
        cx: at,
        cy: MOON_Y,
        r: 2.6,
      });
      const title = make("title");
      title.textContent = `Moon ${moon.index}: ${moon.uwp}`;
      mark.append(title);
      mark.addEventListener("click", (event) => {
        event.stopPropagation();
        for (const handler of moonHandlers) handler(orbitOfGroup(group), moon.index);
      });
      group.append(mark);
    }
    if (moons.length <= MOONS_SHOWN) return;
    const more = make("text", {
      class: "orbit-moon-more",
      x: x + ((MOONS_SHOWN - 1) * MOON_GAP) / 2 + 9,
      y: MOON_Y + 4,
    });
    more.textContent = `+${moons.length - MOONS_SHOWN}`;
    group.append(more);
  }

  /** Which orbit a drawn group belongs to, so a moon knows its own giant. */
  function orbitOfGroup(group: SVGGElement): number {
    return Number(group.dataset["orbit"] ?? 0);
  }

  /** Whether anybody lives on a moon, which is what marks it out on the strip. */
  function hasPeople(moon: Moon): boolean {
    const population = moon.uwp.slice(4, 5);
    return population !== "0" && population !== "";
  }

  /** What sits in the orbit, drawn. Sizes say kind, not scale. */
  function bodyOf(orbit: Orbit, x: number): SVGElement[] {
    const content = orbit.content;
    switch (content.kind) {
      case "world": {
        const r = content.main ? 20 : 15;
        const picture = pictures.get(orbit.index) ?? null;
        if (picture === null) {
          return [
            make("circle", {
              class: content.main ? "orbit-world orbit-main" : "orbit-world",
              cx: x,
              cy: AXIS_Y,
              r,
            }),
          ];
        }
        // The world itself, clipped to its own edge. The ring around the main
        // world is what marks it out now that both are pictures. SystemSpec 8.5.
        const clip = `world-clip-${orbit.index}`;
        const path = make("clipPath", { id: clip });
        path.append(make("circle", { cx: x, cy: AXIS_Y, r }));
        const image = make("image", {
          class: "orbit-globe",
          href: picture,
          x: x - r,
          y: AXIS_Y - r,
          width: r * 2,
          height: r * 2,
          "clip-path": `url(#${clip})`,
          preserveAspectRatio: "xMidYMid slice",
        });
        const edge = make("circle", {
          class: content.main ? "orbit-edge orbit-edge-main" : "orbit-edge",
          cx: x,
          cy: AXIS_Y,
          r,
        });
        return [path, image, edge];
      }
      case "giant": {
        const r = 19;
        const ring = make("ellipse", { class: "orbit-ring", cx: x, cy: AXIS_Y, rx: 30, ry: 7 });
        const picture = pictures.get(orbit.index) ?? null;
        if (picture === null) {
          return [make("circle", { class: "orbit-giant", cx: x, cy: AXIS_Y, r }), ring];
        }
        const clip = `giant-clip-${orbit.index}`;
        const path = make("clipPath", { id: clip });
        path.append(make("circle", { cx: x, cy: AXIS_Y, r }));
        return [
          path,
          make("image", {
            class: "orbit-globe",
            href: picture,
            x: x - r,
            y: AXIS_Y - r,
            width: r * 2,
            height: r * 2,
            "clip-path": `url(#${clip})`,
            preserveAspectRatio: "xMidYMid slice",
          }),
          make("circle", { class: "orbit-edge", cx: x, cy: AXIS_Y, r }),
          ring,
        ];
      }
      case "belt":
        // A scatter rather than a body, because that is what a belt is. The dots
        // are placed off the orbit's own number so a belt looks the same every
        // time it is drawn.
        return Array.from({ length: 9 }, (_, i) => {
          const spread = ((i * 37 + orbit.index * 11) % 41) / 40 - 0.5;
          return make("circle", {
            class: "orbit-belt",
            cx: x + spread * 34,
            cy: AXIS_Y + (((i * 23 + orbit.index * 7) % 17) / 16 - 0.5) * 20,
            r: 1.8,
          });
        });
      default:
        return [];
    }
  }

  return {
    element: svg,
    render,
    setPicture(orbitIndex, png) {
      const orbit = drawn.find((held) => held.index === orbitIndex);
      if (orbit === undefined) return;
      pictures.set(orbitIndex, png);
      drawOrbit(orbit, xOf(orbitIndex));
      // The selection ring is drawn over the bodies, and redrawing one puts it
      // back underneath.
      drawSelection();
    },
    setSelected(orbitIndex, moon = null) {
      selected = orbitIndex;
      selectedMoon = moon;
      drawSelection();
    },
    onSelect(handler) {
      handlers.push(handler);
    },
    onSelectMoon(handler) {
      moonHandlers.push(handler);
    },
  };
}
