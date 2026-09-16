import {
  centreOf,
  dotFor,
  hexPoints,
  HEX_HIGH,
  HEX_WIDE,
  COLUMN_STEP,
  PAD,
} from "../chartlayout";
import { SECTOR_COLS, SECTOR_ROWS, SUB_COLS, SUB_ROWS } from "../location";
import type { Sector } from "../gen/sector";
import type { ChartWorld } from "../gen/subsector";

/**
 * The sector map: thirty-two hexes across and forty down, with its sixteen
 * subsectors marked out on it. SectorSpec section 4.
 *
 * The same hexes in the same places as a subsector chart — the arithmetic is
 * shared through chartlayout — over sixteen times the area. What changes is what
 * a hex can hold at that size: a world is a dot and nothing else, because a
 * thousand names is not a map, and the names are one level down where there is
 * room for them.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** How many people a world needs before it is worth a name at this size. */
const NAMED_FROM = 9;

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** What colour a world is drawn, the same four the chart uses. */
function worldClass(world: ChartWorld): string {
  const { hydrographics, atmosphere, population } = world.profile;
  if (population === 0) return "sec-world sec-empty";
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "sec-world sec-wet";
  if (atmosphere >= 2) return "sec-world sec-dusty";
  return "sec-world sec-airless";
}

export interface SectorMap {
  readonly element: SVGSVGElement;
  render(sector: Sector): void;
  setSelected(letter: string | null, at: string | null): void;
  /** A subsector picked, by letter: the one the pointer went down on. */
  onPickSubsector(handler: (letter: string) => void): void;
  onPickHex(handler: (at: string) => void): void;
}

export function createSectorMap(): SectorMap {
  const svg = make("svg", { class: "sectormap" });
  const gridLayer = make("g");
  const routeLayer = make("g");
  const worldLayer = make("g");
  const frameLayer = make("g");
  const selectLayer = make("g");
  svg.append(gridLayer, routeLayer, worldLayer, frameLayer, selectLayer);

  const pickedSubsector: ((letter: string) => void)[] = [];
  const pickedHex: ((at: string) => void)[] = [];
  const places = new Map<string, { x: number; y: number }>();
  let selectedLetter: string | null = null;
  let selectedHex: string | null = null;

  function drawSelection(): void {
    selectLayer.replaceChildren();
    if (selectedLetter !== null) {
      const at = frameOf(selectedLetter);
      selectLayer.append(make("rect", { class: "sec-chosen", ...at }));
    }
    if (selectedHex !== null) {
      const where = places.get(selectedHex);
      if (where !== undefined) {
        selectLayer.append(
          make("polygon", { class: "sec-pick", points: hexPoints(where.x, where.y) }),
        );
      }
    }
  }

  /** The box round one subsector, in drawing units. */
  function frameOf(letter: string): { x: number; y: number; width: number; height: number } {
    const at = "ABCDEFGHIJKLMNOP".indexOf(letter.toUpperCase());
    const across = at % 4;
    const down = Math.floor(at / 4);
    const left = PAD + across * SUB_COLS * COLUMN_STEP;
    // Even columns ride half a hex lower, so a box has to start above the
    // highest corner in it and finish below the lowest.
    const top = PAD + down * SUB_ROWS * HEX_HIGH - HEX_HIGH / 2;
    return {
      x: left,
      y: top,
      width: SUB_COLS * COLUMN_STEP + HEX_WIDE / 4,
      height: SUB_ROWS * HEX_HIGH + HEX_HIGH,
    };
  }

  function render(sector: Sector): void {
    gridLayer.replaceChildren();
    routeLayer.replaceChildren();
    worldLayer.replaceChildren();
    frameLayer.replaceChildren();
    places.clear();

    const worlds = new Map(sector.worlds.map((world) => [world.at, world]));
    for (let row = 1; row <= SECTOR_ROWS; row++) {
      for (let col = 1; col <= SECTOR_COLS; col++) {
        const { x, y } = centreOf(col, row);
        const at = `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;
        places.set(at, { x, y });
        gridLayer.append(make("polygon", { class: "sec-cell", points: hexPoints(x, y) }));
      }
    }

    for (const route of sector.routes) {
      const from = places.get(route.from);
      const to = places.get(route.to);
      if (from === undefined || to === undefined) continue;
      routeLayer.append(
        make("line", {
          class: route.kind === "xboat" ? "sec-route sec-xboat" : "sec-route",
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        }),
      );
    }

    for (const [at, world] of worlds) {
      const where = places.get(at);
      if (where === undefined) continue;
      const group = make("g", { class: "sec-hex" });
      const title = make("title");
      title.textContent = `${at} ${world.name} ${world.uwp}`;
      group.append(title);
      group.append(
        make("circle", {
          class: worldClass(world),
          cx: where.x,
          cy: where.y,
          r: dotFor(world.profile.population),
        }),
      );
      if (world.profile.population >= NAMED_FROM) {
        const name = make("text", { class: "sec-name", x: where.x, y: where.y + HEX_HIGH * 0.42 });
        name.textContent = world.name;
        group.append(name);
      }
      group.addEventListener("click", () => {
        for (const handler of pickedHex) handler(at);
      });
      worldLayer.append(group);
    }

    // The sixteen boxes over the top, each one a way in. SectorSpec 4.3.
    for (const letter of "ABCDEFGHIJKLMNOP") {
      const box = frameOf(letter);
      const group = make("g", { class: "sec-frame", tabindex: 0, role: "button" });
      const title = make("title");
      title.textContent = `Subsector ${letter}`;
      group.append(title);
      group.append(make("rect", { class: "sec-box", ...box }));
      const mark = make("text", {
        class: "sec-letter",
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
      mark.textContent = letter;
      group.append(mark);
      const open = () => {
        for (const handler of pickedSubsector) handler(letter);
      };
      group.addEventListener("dblclick", open);
      group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
      frameLayer.append(group);
    }

    const width = PAD * 2 + (SECTOR_COLS - 1) * COLUMN_STEP + HEX_WIDE;
    const height = PAD * 2 + SECTOR_ROWS * HEX_HIGH + HEX_HIGH / 2;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    drawSelection();
  }

  return {
    element: svg,
    render,
    setSelected(letter, at) {
      selectedLetter = letter;
      selectedHex = at;
      drawSelection();
    },
    onPickSubsector(handler) {
      pickedSubsector.push(handler);
    },
    onPickHex(handler) {
      pickedHex.push(handler);
    },
  };
}
