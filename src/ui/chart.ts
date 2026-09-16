import { SUB_COLS, SUB_ROWS } from "../location";
import {
  centreOf,
  chartSize,
  dotFor,
  hexPoints,
  COLUMN_STEP,
  HEX_HIGH,
  HEX_WIDE,
  MAIN_COLOURS,
  ZONE_R,
} from "../chartlayout";
import { BORDER_REACH } from "../gen/sector";
import type { ChartWorld, Route, Subsector } from "../gen/subsector";

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
 * the right, and the routes drawn between hexes underneath the lot. What the
 * published maps do in black on white this does in colour, which is the one
 * liberty taken: colour says what kind of world it is without a legend. 4.2.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
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

/**
 * What lies just outside the chart: the worlds within reach of its edge, and the
 * routes that cross it. SectorSpec 4.5.
 */
export interface Around {
  readonly worlds: readonly ChartWorld[];
  readonly routes: readonly Route[];
}

export interface Chart {
  readonly element: SVGSVGElement;
  render(subsector: Subsector, around?: Around): void;
  /** Show or hide the Mains overlay. SubSectorSpec 3.10.4. */
  setMains(show: boolean): void;
  setSelected(at: string | null): void;
  onSelect(handler: (at: string) => void): void;
}

export function createChart(): Chart {
  const svg = make("svg", { class: "chart" });
  const aroundLayer = make("g", { class: "chart-around" });
  const mainLayer = make("g");
  const gridLayer = make("g");
  const routeLayer = make("g");
  const worldLayer = make("g");
  const selectLayer = make("g");
  // The routes go under the worlds and over the grid: they are the thing a hex is
  // read in the context of, not a thing drawn on top of it.
  // Under everything: a Main is the ground the rest of the chart sits on.
  // The neighbours go under everything: they are context, and the chart is what
  // is being read.
  svg.append(aroundLayer, mainLayer, gridLayer, routeLayer, worldLayer, selectLayer);

  const handlers: ((at: string) => void)[] = [];
  const places = new Map<string, { x: number; y: number }>();
  let selected: string | null = null;
  let shown: Subsector | null = null;
  let mainsShown = false;

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    const at = places.get(selected);
    if (at === undefined) return;
    selectLayer.append(make("polygon", { class: "chart-select", points: hexPoints(at.x, at.y) }));
  }

  function render(subsector: Subsector, around?: Around): void {
    shown = subsector;
    gridLayer.replaceChildren();
    routeLayer.replaceChildren();
    worldLayer.replaceChildren();
    aroundLayer.replaceChildren();
    places.clear();

    const worlds = new Map(subsector.worlds.map((world) => [world.at, world]));
    // The chart is its own eight by ten, whichever of the sixteen it is: the
    // hexes carry sector-absolute numbers under 2.2.2, and the drawing does not.
    const first = subsector.worlds[0]?.hex;
    const acrossFrom = first === undefined ? 0 : Math.floor((first.col - 1) / SUB_COLS) * SUB_COLS;
    const downFrom = first === undefined ? 0 : Math.floor((first.row - 1) / SUB_ROWS) * SUB_ROWS;
    // The border is drawn in the same frame, so a hex two columns outside is at
    // local column minus one and the arithmetic does not have to know it.

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
          class: route.kind === "xboat" ? "chart-route chart-xboat" : "chart-route",
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }),
      );
    }

    // What is outside, and the room to draw it in. Without a sector above there
    // is no outside to know about, and the chart is framed on itself as before.
    const { width, height } = chartSize();
    const margin = around === undefined ? 0 : 1;
    const outX = margin * BORDER_REACH * COLUMN_STEP;
    const outY = margin * BORDER_REACH * HEX_HIGH;
    if (around !== undefined) drawAround(around, acrossFrom, downFrom);
    svg.setAttribute(
      "viewBox",
      `${-outX} ${-outY} ${width + outX * 2} ${height + outY * 2}`,
    );
    drawMains();
    drawSelection();
  }

  /**
   * The neighbours, lowlighted. SectorSpec 4.5.
   *
   * Drawn faint and unclickable: they are there to say the chart has edges
   * rather than ends, and a referee who wants one of them opens that subsector.
   * A route crossing the edge is drawn whole, both ends visible, because half a
   * line pointing off the page says less than no line at all.
   */
  function drawAround(around: Around, acrossFrom: number, downFrom: number): void {
    // The grid first, across the whole border, so the edge reads as a chart
    // continuing rather than as a handful of dots floating beside one.
    for (let row = 1 - BORDER_REACH; row <= SUB_ROWS + BORDER_REACH; row++) {
      for (let col = 1 - BORDER_REACH; col <= SUB_COLS + BORDER_REACH; col++) {
        const own = col >= 1 && col <= SUB_COLS && row >= 1 && row <= SUB_ROWS;
        if (own) continue;
        const { x, y } = centreOf(col, row);
        aroundLayer.append(
          make("polygon", { class: "chart-cell chart-faint", points: hexPoints(x, y) }),
        );
      }
    }

    const outside = new Map<string, { x: number; y: number }>();
    for (const world of around.worlds) {
      const where = centreOf(world.hex.col - acrossFrom, world.hex.row - downFrom);
      outside.set(world.at, where);
      const group = make("g");
      const title = make("title");
      title.textContent = `${world.at} ${world.name} ${world.uwp}`;
      group.append(title);
      group.append(
        make("circle", {
          class: `${worldClass(world)} chart-faint`,
          cx: where.x,
          cy: where.y,
          r: dotFor(world.profile.population),
        }),
      );
      // A name, small, on the ones big enough to be why the neighbour matters.
      if (world.profile.population >= 9) {
        const name = make("text", {
          class: "chart-name",
          x: where.x,
          y: where.y + HEX_HIGH * 0.33,
        });
        name.textContent = world.name;
        group.append(name);
      }
      aroundLayer.append(group);
    }
    const at = (hex: string) => places.get(hex) ?? outside.get(hex);
    for (const route of around.routes) {
      const from = at(route.from);
      const to = at(route.to);
      if (from === undefined || to === undefined) continue;
      aroundLayer.append(
        make("line", {
          class:
            route.kind === "xboat"
              ? "chart-route chart-xboat chart-faint"
              : "chart-route chart-faint",
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }),
      );
    }
  }

  /**
   * The Mains, as a tint behind the hexes they run through. SubSectorSpec 3.10.4.
   *
   * A wash rather than a line, because a Main is a region rather than a path:
   * it has no direction and no two ends, and drawing it as a line would mean
   * choosing an order it does not have. Each one gets its own colour off the
   * top so that two that pass close by can be told apart.
   */
  function drawMains(): void {
    mainLayer.replaceChildren();
    if (!mainsShown || shown === null) return;
    for (const [at, main] of shown.mains.entries()) {
      const group = make("g", { class: `chart-main chart-main-${at % MAIN_COLOURS}` });
      const title = make("title");
      title.textContent = `The ${main.name} Main: ${main.hexes.length} worlds within one jump of each other`;
      group.append(title);
      for (const hex of main.hexes) {
        const where = places.get(hex);
        if (where === undefined) continue;
        group.append(make("polygon", { points: hexPoints(where.x, where.y) }));
      }
      mainLayer.append(group);
    }
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
    setMains(show) {
      mainsShown = show;
      drawMains();
    },
    setSelected(at) {
      selected = at;
      drawSelection();
    },
    onSelect(handler) {
      handlers.push(handler);
    },
  };
}
