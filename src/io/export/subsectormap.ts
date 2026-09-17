/**
 * The subsector map as a file. SubSectorSpec 6.2.
 *
 * The same eighty hexes the window draws, written as SVG text that stands on its
 * own: framed on the whole subsector rather than on wherever the user had
 * scrolled, and carrying its own styling, because a file that has to be paired
 * with a stylesheet is a file that will be opened without one.
 *
 * It shares the arithmetic of the panel's map through hexlayout, so the two
 * cannot drift apart, and duplicates only the colours. That duplication is the
 * price of a standalone file and it is the cheap half: a hex in the wrong place
 * would be a different map, while a hex in the wrong blue is the same map in
 * the wrong blue.
 */

import {
  centreOf,
  hexMapSize,
  dotFor,
  hexNumbers,
  hexPoints,
  HEX_HIGH,
  HEX_WIDE,
  MAIN_COLOURS,
  ZONE_R,
} from "../../hexlayout";
import { starsOf, type SubsectorWorld, type Subsector } from "../../gen/subsector";

/** What the exported map is drawn in. The panel's own colours, on paper. */
const MAP_STYLE = `
  .bg { fill: #0a0c10; }
  .cell { fill: none; stroke: #39414d; stroke-width: 1; }
  .at { fill: #59636f; font-size: 11px; text-anchor: middle; }
  .port { fill: #dbe3ec; font-size: 14px; text-anchor: middle; font-weight: 600; }
  .name { fill: #f0f4f9; font-size: 13px; text-anchor: middle; }
  .loud { font-weight: 700; letter-spacing: 0.03em; }
  .wet { fill: #3f7fc4; }
  .dusty { fill: #b08b5e; }
  .airless { fill: #8d96a2; }
  .empty { fill: none; stroke: #7b8694; stroke-width: 1.6; }
  .rock { fill: #9aa5b2; }
  .naval { fill: #e6ebf2; }
  .scout { fill: #9fb0c4; }
  .giant { fill: #d7b273; }
  .ring { fill: none; stroke: #d7b273; stroke-width: 1.4; }
  .zone { fill: none; stroke: #e0b341; stroke-width: 1.6; stroke-dasharray: 5 5; }
  .red { stroke: #e24b4a; }
  .route { stroke: #3d6ea8; stroke-width: 2; opacity: 0.75; }
  .xboat { stroke: #6aa6e8; stroke-width: 3.4; opacity: 0.9; }
  .main-0 { fill: rgba(90, 160, 220, 0.16); }
  .main-1 { fill: rgba(200, 150, 90, 0.16); }
  .main-2 { fill: rgba(140, 200, 140, 0.15); }
  .main-3 { fill: rgba(190, 130, 200, 0.15); }
  .main-4 { fill: rgba(220, 200, 120, 0.14); }
  .title { fill: #e8edf4; font-size: 26px; font-weight: 600; }
  .note { fill: #8e9aa8; font-size: 15px; }
`;

/** A tag, with its attributes, written out. */
function tag(name: string, attrs: Record<string, string | number>, inner = ""): string {
  const written = Object.entries(attrs)
    .map(([key, value]) => `${key}="${esc(String(value))}"`)
    .join(" ");
  return inner === "" ? `<${name} ${written} />` : `<${name} ${written}>${esc(inner)}</${name}>`;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** What colour a world is drawn, by what is on its surface. 4.2.2. */
function worldClass(world: SubsectorWorld): string {
  const { hydrographics, atmosphere, population } = world.profile;
  if (population === 0) return "empty";
  if (hydrographics > 0 && atmosphere >= 2 && atmosphere <= 9) return "wet";
  if (atmosphere >= 2) return "dusty";
  return "airless";
}

/** A star, for the naval base mark. */
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
 * The subsector map as standalone SVG. SubSectorSpec 6.2.
 *
 * Titled, because a file leaves the application and has to say what it is when
 * it turns up in somebody's downloads folder six months later.
 */
export function subsectorMapSvg(subsector: Subsector, sector = "", showMains = true): string {
  const { width, height } = hexMapSize();
  const head = 74;
  const first = subsector.worlds[0]?.hex;
  const numbers = hexNumbers(first?.col ?? 1, first?.row ?? 1);
  const places = new Map<string, { x: number; y: number }>();
  for (const [row, line] of numbers.entries()) {
    for (const [col, at] of line.entries()) {
      places.set(at, centreOf(col + 1, row + 1));
    }
  }

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + head}" width="${width}" height="${height + head}">`,
    `<style>${MAP_STYLE}</style>`,
    tag("rect", { class: "bg", x: 0, y: 0, width, height: height + head }),
    tag(
      "text",
      { class: "title", x: PAD_LEFT, y: 34 },
      `Subsector ${subsector.letter}${sector === "" ? "" : ` of ${sector}`}`,
    ),
    tag(
      "text",
      { class: "note", x: PAD_LEFT, y: 58 },
      `${subsector.worlds.length} systems · ${subsector.density} density · seed ${subsector.seed}`,
    ),
    `<g transform="translate(0 ${head})">`,
  ];

  // The Mains underneath, the hexes over them, the routes over those.
  if (showMains) {
    for (const [at, main] of subsector.mains.entries()) {
      out.push(`<g class="main-${at % MAIN_COLOURS}">`);
      for (const hex of main.hexes) {
        const where = places.get(hex);
        if (where !== undefined) out.push(tag("polygon", { points: hexPoints(where.x, where.y) }));
      }
      out.push("</g>");
    }
  }

  for (const [at, where] of places) {
    out.push(tag("polygon", { class: "cell", points: hexPoints(where.x, where.y) }));
    out.push(tag("text", { class: "at", x: where.x, y: where.y - HEX_HIGH * 0.33 }, at));
  }

  for (const route of subsector.routes) {
    const from = places.get(route.from);
    const to = places.get(route.to);
    if (from === undefined || to === undefined) continue;
    out.push(
      tag("line", {
        class: route.kind === "xboat" ? "route xboat" : "route",
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      }),
    );
  }

  for (const world of subsector.worlds) {
    const where = places.get(world.at);
    if (where === undefined) continue;
    out.push(...worldMarks(world, where));
  }

  out.push("</g>", "</svg>", "");
  return out.join("\n");
}

const PAD_LEFT = 24;

/** One world and its marks, in the arrangement 4.2 lays out. */
function worldMarks(world: SubsectorWorld, where: { x: number; y: number }): string[] {
  const { x, y } = where;
  const out: string[] = [];
  if (world.zone !== "") {
    out.push(
      tag("circle", { class: world.zone === "R" ? "zone red" : "zone", cx: x, cy: y, r: ZONE_R }),
    );
  }
  out.push(tag("text", { class: "port", x, y: y - HEX_HIGH * 0.13 }, world.profile.starport));
  if (world.profile.size === 0) {
    for (const [dx, dy] of [
      [-6, -4],
      [5, -5],
      [0, 0],
      [-4, 5],
      [7, 3],
      [2, 7],
    ]) {
      out.push(tag("circle", { class: "rock", cx: x + dx!, cy: y + dy!, r: 2 }));
    }
  } else {
    out.push(
      tag("circle", {
        class: worldClass(world),
        cx: x,
        cy: y,
        r: dotFor(world.profile.population),
      }),
    );
  }
  const loud = world.profile.population >= 9;
  out.push(
    tag(
      "text",
      { class: loud ? "name loud" : "name", x, y: y + HEX_HIGH * 0.33 },
      loud ? world.name.toUpperCase() : world.name,
    ),
  );
  const left = x - HEX_WIDE * 0.3;
  const both = world.bases === "A";
  if (both || world.bases === "N") {
    out.push(tag("polygon", { class: "naval", points: starPoints(left, both ? y - 8 : y) }));
  }
  if (both || world.bases === "S") {
    const at = both ? y + 9 : y;
    out.push(
      tag("polygon", {
        class: "scout",
        points: `${left},${at - 5} ${left + 5},${at + 4} ${left - 5},${at + 4}`,
      }),
    );
  }
  if (world.pbg.gasGiants > 0) {
    const gx = x + HEX_WIDE * 0.27;
    const gy = y - 4;
    out.push(tag("circle", { class: "giant", cx: gx, cy: gy, r: 4.5 }));
    out.push(tag("ellipse", { class: "ring", cx: gx, cy: gy, rx: 8, ry: 2.6 }));
  }
  return out;
}

/* The subsector as a table. SubSectorSpec 6.3 -------------------------------- */

const COLUMNS = [
  "hex",
  "name",
  "uwp",
  "starport",
  "size",
  "atmosphere",
  "hydrographics",
  "population",
  "government",
  "law",
  "tech",
  "bases",
  "zone",
  "pbg",
  "belts",
  "gas_giants",
  "stars",
  "trade_codes",
  "allegiance",
  "system_seed",
  "world_seed",
] as const;

/**
 * The subsector as a CSV. SubSectorSpec 6.3.
 *
 * Every derived figure in its own column, which the sector file cannot do: that
 * format packs seven digits into one field because a map reads it, and a
 * spreadsheet wants to sort on the population.
 */
export function subsectorCsv(subsector: Subsector): string {
  const lines = [COLUMNS.join(",")];
  for (const world of subsector.worlds) {
    const p = world.profile;
    lines.push(
      [
        world.at,
        world.name,
        world.uwp,
        p.starport,
        p.size,
        p.atmosphere,
        p.hydrographics,
        p.population,
        p.government,
        p.law,
        p.tech,
        world.bases,
        world.zone,
        `${world.pbg.multiplier}${world.pbg.belts}${world.pbg.gasGiants}`,
        world.pbg.belts,
        world.pbg.gasGiants,
        starsOf(world),
        world.trade.map((code) => code.code).join(" "),
        "Na",
        world.systemSeed,
        world.seed,
      ]
        .map((value) => field(String(value)))
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * A value as one CSV field. Quoted where it holds a comma, a quote, or a line
 * break, and a quote inside a quoted field is doubled, which is the whole of the
 * escaping the format has.
 */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/* The subsector as a document. SubSectorSpec 6.4 ----------------------------- */

/** What the HTML sheet is styled in, so it prints and hands over as it is. */
const SHEET_STYLE = `
  :root { color-scheme: light; }
  body { font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
         max-width: 44rem; margin: 2.5rem auto; padding: 0 1.25rem; color: #1b1f24; }
  h1 { font-size: 1.9rem; margin: 0 0 0.2rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 0.6rem; border-bottom: 1px solid #d8dde3;
       padding-bottom: 0.3rem; }
  h3 { font-size: 1.05rem; margin: 1.4rem 0 0.2rem; }
  p { margin: 0.4rem 0; }
  .subtitle, .note { color: #5c6570; }
  .profile { font-family: ui-monospace, Consolas, monospace; }
  ul { padding-left: 1.2rem; }
  footer { margin-top: 2.5rem; color: #79828d; font-size: 0.85rem; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } }
`;

/**
 * The subsector sheet, in HTML. SubSectorSpec 6.4.
 *
 * The same document as the Markdown, for printing and for handing to a player.
 * It carries its own styling, because a page that has to be paired with a
 * stylesheet is a page that will be opened without one — the planet spec 6.19
 * settled that for one world and it holds for eighty.
 */
export function subsectorSheetHtml(
  subsector: Subsector,
  sector = "",
  notes: (at: string) => string = () => "",
): string {
  const title = `Subsector ${subsector.letter}${sector === "" ? "" : ` of ${sector}`}`;
  const inhabited = subsector.worlds.filter((world) => world.profile.population > 0).length;
  const out: string[] = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${SHEET_STYLE}</style>`,
    "</head><body>",
    `<h1>${esc(title)}</h1>`,
    `<p class="subtitle">${subsector.worlds.length} systems in eighty hexes, ${inhabited} of them inhabited. ` +
      `${esc(subsector.density)} density, seed ${esc(subsector.seed)}.</p>`,
  ];

  if (subsector.mains.length > 0) {
    out.push("<h2>Mains</h2>", "<ul>");
    for (const main of subsector.mains) {
      out.push(
        `<li><b>The ${esc(main.name)} Main</b>: ${main.hexes.length} worlds, every one within ` +
          `one jump of another — ${esc(main.hexes.join(", "))}.</li>`,
      );
    }
    out.push("</ul>");
  }

  const xboat = subsector.routes.filter((route) => route.kind === "xboat");
  if (xboat.length > 0) {
    out.push(
      "<h2>The X-boat network</h2>",
      `<p>${esc(xboat.map((route) => `${route.from}–${route.to}`).join(", "))}.</p>`,
    );
  }

  out.push("<h2>The worlds</h2>");
  for (const world of subsector.worlds) {
    const note = notes(world.at);
    out.push(
      `<h3>${esc(world.name)} — ${esc(world.at)}</h3>`,
      `<p class="note"><span class="profile">${esc(world.uwp)}</span> · ${esc(starsOf(world))} · ` +
        `PBG ${world.pbg.multiplier}${world.pbg.belts}${world.pbg.gasGiants} · ` +
        `${esc(basesWords(world))} · ${esc(zoneWords(world))}</p>`,
    );
    const trade = world.trade.map((code) => `${code.code} ${code.label}`).join(", ");
    if (trade !== "") out.push(`<p>Trade: ${esc(trade)}</p>`);
    if (note !== "") out.push(`<p>${esc(note)}</p>`);
  }

  out.push("<footer>Generated by PlanetHex.</footer>", "</body></html>", "");
  return out.join("\n");
}

function basesWords(world: SubsectorWorld): string {
  if (world.bases === "A") return "naval and scout bases";
  if (world.bases === "N") return "a naval base";
  if (world.bases === "S") return "a scout base";
  return "no bases";
}

function zoneWords(world: SubsectorWorld): string {
  if (world.zone === "A") return "amber zone";
  if (world.zone === "R") return "red zone";
  return "green";
}

/** What one world gets said about it on the sheet. */
function worldLines(world: SubsectorWorld, note: string): string[] {
  const p = world.profile;
  const bases = basesWords(world);
  const zone = zoneWords(world);
  const trade = world.trade.map((code) => `${code.code} ${code.label}`).join(", ");
  return [
    `### ${world.name} — ${world.at}`,
    "",
    `**${world.uwp}** · ${starsOf(world)} · PBG ${world.pbg.multiplier}${world.pbg.belts}${world.pbg.gasGiants} · ${bases} · ${zone}`,
    "",
    trade === "" ? "" : `Trade: ${trade}`,
    trade === "" ? "" : "",
    `Population digit ${p.population}, tech level ${p.tech}, law level ${p.law}.`,
    "",
    note === "" ? "" : note,
    note === "" ? "" : "",
  ].filter((line, at, all) => !(line === "" && all[at - 1] === ""));
}

/**
 * The subsector sheet, in Markdown. SubSectorSpec 6.4.
 *
 * The eighty systems written up to be read rather than parsed, the way the
 * planet spec 6.19 writes one world up. A referee reads this at the table; the
 * sector file is for the software.
 */
export function subsectorSheetMarkdown(
  subsector: Subsector,
  sector = "",
  notes: (at: string) => string = () => "",
): string {
  const title = `Subsector ${subsector.letter}${sector === "" ? "" : ` of ${sector}`}`;
  const inhabited = subsector.worlds.filter((world) => world.profile.population > 0).length;
  const out: string[] = [
    `# ${title}`,
    "",
    `${subsector.worlds.length} systems in eighty hexes, ${inhabited} of them inhabited. ` +
      `${subsector.density} density, seed ${subsector.seed}.`,
    "",
  ];

  if (subsector.mains.length > 0) {
    out.push("## Mains", "");
    for (const main of subsector.mains) {
      out.push(
        `- **The ${main.name} Main**: ${main.hexes.length} worlds, every one within one jump of another — ${main.hexes.join(", ")}.`,
        "",
      );
    }
  }

  const xboat = subsector.routes.filter((route) => route.kind === "xboat");
  if (xboat.length > 0) {
    out.push("## The X-boat network", "");
    out.push(xboat.map((route) => `${route.from}–${route.to}`).join(", ") + ".", "");
  }

  out.push("## The worlds", "");
  for (const world of subsector.worlds) out.push(...worldLines(world, notes(world.at)));
  out.push("---", "", "Generated by PlanetHex.", "");
  return out.join("\n");
}
