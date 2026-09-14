import { SUB_COLS, SUB_ROWS } from "../location";
import type { ChartWorld, Subsector } from "../gen/subsector";

/**
 * The subsector chart: eighty hexes, drawn the way Traveller draws them.
 * SubSectorSpec 2.1.2 and section 4.
 *
 * Columns of hexes, column 01 on the left, even columns sitting half a hex lower
 * than odd ones, row 01 at the top. This is the opposite convention from the
 * surface hexes of the planet spec section 2, and deliberately not shared with
 * them: a chart hex is one star system and a surface hex is a piece of ground on
 * one planet.
 *
 * A hex is laid out the way every published subsector map lays one out, because
 * a referee already knows how to read one of those: the hex number small at the
 * top, the starport letter above the world, the world as a disc in the middle,
 * its name under it, the bases as their own marks to the left, a gas giant to
 * the right, and the lanes drawn between hexes underneath the lot. What the
 * published maps do in black on white this does in colour, which is the one
 * liberty taken: colour says what kind of world it is without a legend. 4.2.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A hex, in drawing units: HEX_WIDE corner to corner across, and flat topped, so
 * that columns can be offset against each other the way a Traveller chart offsets
 * them. A flat topped hex of that width stands the square root of three quarters
 * of it high, and its columns step three quarters of it apart.
 */
const HEX_WIDE = 100;
const HEX_HIGH = (HEX_WIDE * Math.sqrt(3)) / 2;
const COLUMN_STEP = HEX_WIDE * 0.75;
const PAD = HEX_WIDE * 0.45;

/**
 * The world itself, and the ring a travel zone puts round it. A world is drawn
 * as a dot, sized by population and coloured by what is on its surface, with the
 * key beside the chart saying which is which. 4.2.2.
 */
const DOT = { least: 6, most: 12 } as const;
const ZONE_R = 20;

/** How big a world's dot is. Population, not size: 4.2.1 says why. */
function dotFor(population: number): number {
  const at = Math.min(1, Math.max(0, population / 12));
  return DOT.least + at * (DOT.most - DOT.least);
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** The middle of the hex at a column and row of the chart, in drawing units. */
function centreOf(col: number, row: number): { x: number; y: number } {
  const x = PAD + (col - 1) * COLUMN_STEP + HEX_WIDE / 2;
  // Even columns ride half a hex lower, which is what makes a Traveller chart
  // read as columns of worlds rather than as a grid.
  const drop = col % 2 === 0 ? HEX_HIGH / 2 : 0;
  return { x, y: PAD + (row - 1) * HEX_HIGH + HEX_HIGH / 2 + drop };
}

/**
 * The six corners of a flat-topped hex about a centre.
 *
 * Written out rather than swept round in sixty degree steps, because a circle
 * sampled every sixty degrees and then squashed to the hex's height is not a
 * hexagon: the four slanted corners land short of the full height, and the chart
 * tiles with a gap down every seam. A flat-topped hex has its corners at the
 * ends of the horizontal axis and at a quarter of the width either side of the
 * middle, top and bottom.
 */
function hexPoints(x: number, y: number): string {
  const wide = HEX_WIDE / 2;
  const quarter = HEX_WIDE / 4;
  const high = HEX_HIGH / 2;
  return [
    `${x + wide},${y}`,
    `${x + quarter},${y + high}`,
    `${x - quarter},${y + high}`,
    `${x - wide},${y}`,
    `${x - quarter},${y - high}`,
    `${x + quarter},${y - high}`,
  ].join(" ");
}

/**
 * What colour a world is drawn. The published charts have only black, so this is
 * the one thing here they do not do: water and air is blue, a dry world with air
 * is tan, an airless rock is grey, and a world nobody lives on is hollow.
 */
function worldClass(world: ChartWorld): string {
  const { hydrographics, atmosphere, population } = world.profile;
  if (population === 0) return "chart-world chart-empty";
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "chart-world chart-wet";
  if (atmosphere >= 2) return "chart-world chart-dusty";
  return "chart-world chart-airless";
}

export interface Chart {
  readonly element: SVGSVGElement;
  render(subsector: Subsector): void;
  setSelected(at: string | null): void;
  onSelect(handler: (at: string) => void): void;
}

export function createChart(): Chart {
  const svg = make("svg", { class: "chart" });
  const gridLayer = make("g");
  const routeLayer = make("g");
  const worldLayer = make("g");
  const selectLayer = make("g");
  // The lanes go under the worlds and over the grid: they are the thing a hex is
  // read in the context of, not a thing drawn on top of it.
  svg.append(gridLayer, routeLayer, worldLayer, selectLayer);

  const handlers: ((at: string) => void)[] = [];
  const places = new Map<string, { x: number; y: number }>();
  let selected: string | null = null;

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    const at = places.get(selected);
    if (at === undefined) return;
    selectLayer.append(make("polygon", { class: "chart-select", points: hexPoints(at.x, at.y) }));
  }

  function render(subsector: Subsector): void {
    gridLayer.replaceChildren();
    routeLayer.replaceChildren();
    worldLayer.replaceChildren();
    places.clear();

    const worlds = new Map(subsector.worlds.map((world) => [world.at, world]));
    // The chart is its own eight by ten, whichever of the sixteen it is: the
    // hexes carry sector-absolute numbers under 2.2.2, and the drawing does not.
    const first = subsector.worlds[0]?.hex;
    const acrossFrom = first === undefined ? 0 : Math.floor((first.col - 1) / SUB_COLS) * SUB_COLS;
    const downFrom = first === undefined ? 0 : Math.floor((first.row - 1) / SUB_ROWS) * SUB_ROWS;

    for (let row = 1; row <= SUB_ROWS; row++) {
      for (let col = 1; col <= SUB_COLS; col++) {
        const { x, y } = centreOf(col, row);
        const at = `${String(acrossFrom + col).padStart(2, "0")}${String(downFrom + row).padStart(2, "0")}`;
        places.set(at, { x, y });
        drawHex(at, x, y, worlds.get(at) ?? null);
      }
    }

    for (const route of subsector.routes) {
      const from = places.get(route.from);
      const to = places.get(route.to);
      if (from === undefined || to === undefined) continue;
      routeLayer.append(
        make("line", {
          class: route.main ? "chart-route chart-main" : "chart-route",
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }),
      );
    }

    const width = PAD * 2 + (SUB_COLS - 1) * COLUMN_STEP + HEX_WIDE;
    const height = PAD * 2 + SUB_ROWS * HEX_HIGH + HEX_HIGH / 2;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    drawSelection();
  }

  function drawHex(at: string, x: number, y: number, world: ChartWorld | null): void {
    const group = make("g", { class: world === null ? "chart-hex" : "chart-hex chart-full" });
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    const title = make("title");
    title.textContent = world === null ? `${at}, empty` : `${at} ${world.name} ${world.uwp}`;
    group.append(title);
    group.append(make("polygon", { class: "chart-cell", points: hexPoints(x, y) }));

    // Every hex says which it is, occupied or not: an empty hex still has to be
    // referrable. SubSectorSpec 4.2.
    const digits = make("text", { class: "chart-at", x, y: y - HEX_HIGH * 0.33 });
    digits.textContent = at;
    group.append(digits);

    if (world !== null) {
      if (world.zone !== "") {
        group.append(
          make("circle", {
            class: world.zone === "R" ? "chart-zone chart-red" : "chart-zone",
            cx: x,
            cy: y,
            r: ZONE_R,
          }),
        );
      }

      // The port is read before the world is: it is what decides whether the
      // world can be reached at all.
      const port = make("text", { class: "chart-port", x, y: y - HEX_HIGH * 0.13 });
      port.textContent = world.profile.starport;
      group.append(port);

      if (world.profile.size === 0) drawBelt(group, x, y);
      else {
        group.append(
          make("circle", {
            class: worldClass(world),
            cx: x,
            cy: y,
            r: dotFor(world.profile.population),
          }),
        );
      }

      // A name in capitals is the published shorthand for a world with a
      // billion people on it, the one population figure worth seeing across a
      // table.
      const loud = world.profile.population >= 9;
      const name = make("text", {
        class: loud ? "chart-name chart-loud" : "chart-name",
        x,
        y: y + HEX_HIGH * 0.33,
      });
      name.textContent = loud ? world.name.toUpperCase() : world.name;
      group.append(name);

      // Bases to the left and a gas giant to the right, each its own mark, as
      // the charts have always drawn them: a star is a naval base and a
      // triangle a scout way station.
      const left = x - HEX_WIDE * 0.3;
      const both = world.bases === "A";
      if (both || world.bases === "N") drawStar(group, left, both ? y - 8 : y);
      if (both || world.bases === "S") drawTriangle(group, left, both ? y + 9 : y);
      if (world.pbg.gasGiants > 0) drawGiant(group, x + HEX_WIDE * 0.27, y - 4);
    }

    group.addEventListener("click", () => {
      for (const handler of handlers) handler(at);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      for (const handler of handlers) handler(at);
    });
    (world === null ? gridLayer : worldLayer).append(group);
  }

  /** An asteroid belt, which the charts draw as a scatter rather than a world. */
  function drawBelt(group: SVGGElement, x: number, y: number): void {
    const rocks = [
      [-6, -4],
      [5, -5],
      [0, 0],
      [-4, 5],
      [7, 3],
      [2, 7],
    ];
    for (const [dx, dy] of rocks) {
      group.append(make("circle", { class: "chart-rock", cx: x + dx!, cy: y + dy!, r: 2 }));
    }
  }

  /** A naval base. */
  function drawStar(group: SVGGElement, x: number, y: number): void {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 7 : 3;
      const angle = (Math.PI / 180) * (i * 36 - 90);
      points.push(`${x + r * Math.cos(angle)},${y + r * Math.sin(angle)}`);
    }
    group.append(make("polygon", { class: "chart-naval", points: points.join(" ") }));
  }

  /** A scout way station. */
  function drawTriangle(group: SVGGElement, x: number, y: number): void {
    group.append(
      make("polygon", {
        class: "chart-scout",
        points: `${x},${y - 6} ${x + 6},${y + 5} ${x - 6},${y + 5}`,
      }),
    );
  }

  /** Somewhere to skim fuel, which is why it is on the chart at all. */
  function drawGiant(group: SVGGElement, x: number, y: number): void {
    group.append(make("circle", { class: "chart-giant", cx: x, cy: y, r: 4.5 }));
    group.append(make("ellipse", { class: "chart-giant-ring", cx: x, cy: y, rx: 8, ry: 2.6 }));
  }

  return {
    element: svg,
    render,
    setSelected(at) {
      selected = at;
      drawSelection();
    },
    onSelect(handler) {
      handlers.push(handler);
    },
  };
}
