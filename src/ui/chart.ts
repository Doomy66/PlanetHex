import { SUB_COLS, SUB_ROWS } from "../location";
import type { ChartWorld, Subsector } from "../gen/subsector";

/**
 * The subsector chart: eighty hexes, drawn the way Traveller draws them.
 * SubSectorSpec 2.1.2 and section 4.
 *
 * Columns of hexes, column 01 on the left, odd columns sitting half a hex higher
 * than even ones, row 01 at the top. This is the opposite convention from the
 * surface hexes of the planet spec section 2, and deliberately not shared with
 * them: a chart hex is one star system and a surface hex is a piece of ground on
 * one planet.
 *
 * The contents of a hex are laid out the way every published subsector map lays
 * them out, because a referee already knows how to read one of those: the hex
 * number small at the top, the world as a circle in the middle, its name under
 * the circle and its profile under the name, bases to the left, a gas giant to
 * the upper right, and a travel zone as a ring around the world rather than
 * around the hex. 4.2.
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
const PAD = HEX_WIDE * 0.5;

/** The world itself, and the ring a travel zone puts round it. */
const WORLD_R = 7.5;
const ZONE_R = 26;

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

/**
 * What a world is drawn as. The published maps colour by what is on the surface,
 * which is the one thing a glance at a chart should tell you: water is blue,
 * a dry world is grey, and an asteroid belt is not a circle at all.
 */
function worldClass(world: ChartWorld): string {
  const { hydrographics, atmosphere, population } = world.profile;
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "chart-world chart-wet";
  if (population > 0) return "chart-world chart-dry";
  return "chart-world chart-bare";
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
    selectLayer.append(make("polygon", { class: "chart-select", points: hexPoints(at.x, at.y) }));
  }

  function render(subsector: Subsector): void {
    gridLayer.replaceChildren();
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
    const digits = make("text", { class: "chart-at", x, y: y - HEX_HIGH * 0.34 });
    digits.textContent = at;
    group.append(digits);

    if (world !== null) {
      // The ring goes on first, under everything, so that the world sits in it.
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

      if (world.profile.size === 0) drawBelt(group, x, y);
      else group.append(make("circle", { class: worldClass(world), cx: x, cy: y, r: WORLD_R }));

      // A name in capitals is the published shorthand for a world with a
      // billion people on it, which is the one population figure worth seeing
      // from across the table.
      const high = world.profile.population >= 9;
      const name = make("text", { class: high ? "chart-name chart-loud" : "chart-name", x, y: y + HEX_HIGH * 0.22 });
      name.textContent = high ? world.name.toUpperCase() : world.name;
      group.append(name);

      const uwp = make("text", { class: "chart-uwp", x, y: y + HEX_HIGH * 0.4 });
      uwp.textContent = world.uwp;
      group.append(uwp);

      // The two marks a referee looks for before anything else: somewhere to
      // report to, and somewhere to refuel.
      if (world.bases !== "") {
        const bases = make("text", { class: "chart-base", x: x - HEX_WIDE * 0.26, y: y + 4 });
        bases.textContent = world.bases;
        group.append(bases);
      }
      if (world.pbg.gasGiants > 0) {
        group.append(
          make("circle", {
            class: "chart-giant",
            cx: x + HEX_WIDE * 0.2,
            cy: y - HEX_HIGH * 0.17,
            r: 4.5,
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

  /** An asteroid belt, which the maps draw as a scatter rather than a world. */
  function drawBelt(group: SVGGElement, x: number, y: number): void {
    const rocks = [
      [-5, -3],
      [4, -4],
      [0, 0],
      [-3, 4],
      [6, 2],
      [2, 6],
    ];
    for (const [dx, dy] of rocks) {
      group.append(make("circle", { class: "chart-rock", cx: x + dx!, cy: y + dy!, r: 1.7 }));
    }
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
