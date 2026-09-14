import { SUB_COLS, SUB_ROWS } from "../location";
import type { ChartWorld, Subsector } from "../gen/subsector";

/**
 * The subsector chart: eighty hexes, drawn the way Traveller draws them.
 * SubSectorSpec 2.1.2 and section 4.
 *
 * Columns of hexes, column 01 on the left, odd columns sitting
 * half a hex higher than even ones, row 01 at the top. This is the opposite
 * convention from the surface hexes of the planet spec section 2, and
 * deliberately not shared with them: a chart hex is one star system and a
 * surface hex is a piece of ground on one planet.
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
const PAD = HEX_WIDE * 0.7;

/** The dot a world is drawn as, by how many people are on it. 4.2.1. */
const DOT = { least: 5, most: 17 } as const;

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
  // Odd columns ride half a hex higher, which is what makes a Traveller chart
  // read as rows rather than as a grid.
  const lift = col % 2 === 1 ? 0 : HEX_HIGH / 2;
  return { x, y: PAD + (row - 1) * HEX_HIGH + HEX_HIGH / 2 + lift };
}

/** The six corners of a flat-topped hex about a centre. */
function hexPoints(x: number, y: number): string {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    out.push(`${x + (HEX_WIDE / 2) * Math.cos(angle)},${y + (HEX_HIGH / 2) * Math.sin(angle)}`);
  }
  return out.join(" ");
}

/** How big a world's dot is. Population, not size: 4.2.1 says why. */
function dotFor(population: number): number {
  const at = Math.min(1, Math.max(0, population / 12));
  return DOT.least + at * (DOT.most - DOT.least);
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
  const worldLayer = make("g");
  const selectLayer = make("g");
  svg.append(gridLayer, worldLayer, selectLayer);

  const handlers: ((at: string) => void)[] = [];
  const places = new Map<string, { x: number; y: number }>();
  let selected: string | null = null;

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selected === null) return;
    const at = places.get(selected);
    if (at === undefined) return;
    selectLayer.append(
      make("polygon", { class: "chart-select", points: hexPoints(at.x, at.y) }),
    );
  }

  function render(subsector: Subsector): void {
    gridLayer.replaceChildren();
    worldLayer.replaceChildren();
    places.clear();

    const worlds = new Map(subsector.worlds.map((world) => [world.at, world]));
    // The chart is its own eight by ten, whichever of the sixteen it is: the
    // hexes carry sector-absolute numbers under 2.2.2, and the drawing does not.
    const first = subsector.worlds[0]?.hex;
    const acrossFrom = first === undefined ? 1 : Math.floor((first.col - 1) / SUB_COLS) * SUB_COLS;
    const downFrom = first === undefined ? 0 : Math.floor((first.row - 1) / SUB_ROWS) * SUB_ROWS;

    for (let row = 1; row <= SUB_ROWS; row++) {
      for (let col = 1; col <= SUB_COLS; col++) {
        const { x, y } = centreOf(col, row);
        const at = `${String(acrossFrom + col).padStart(2, "0")}${String(downFrom + row).padStart(2, "0")}`;
        places.set(at, { x, y });
        drawHex(at, x, y, worlds.get(at) ?? null);
      }
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
      group.append(
        make("circle", {
          class: world.profile.population > 0 ? "chart-world" : "chart-world chart-bare",
          cx: x,
          cy: y,
          r: dotFor(world.profile.population),
        }),
      );
      const port = make("text", { class: "chart-port", x, y: y + HEX_HIGH * 0.06 });
      port.textContent = world.profile.starport;
      group.append(port);
      const name = make("text", { class: "chart-name", x, y: y + HEX_HIGH * 0.33 });
      name.textContent = world.name;
      group.append(name);

      // The marks a referee reads at a glance: a base beside the port, a gas
      // giant where there is one to refuel at, and a warning where the world
      // has earned one.
      if (world.bases !== "") {
        const bases = make("text", { class: "chart-base", x: x - HEX_WIDE * 0.3, y });
        bases.textContent = world.bases;
        group.append(bases);
      }
      if (world.pbg.gasGiants > 0) {
        group.append(
          make("circle", { class: "chart-giant", cx: x + HEX_WIDE * 0.28, cy: y - 6, r: 4 }),
        );
      }
      if (world.zone !== "") {
        group.append(
          make("polygon", {
            class: world.zone === "R" ? "chart-zone chart-red" : "chart-zone",
            points: hexPoints(x, y),
          }),
        );
      }
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
