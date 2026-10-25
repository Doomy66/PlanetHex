import { describe, expect, it } from "vitest";
import { chartedSeed, importSector, importSubsector, type ChartedSource } from "./charted";
import { parseWorldTable, type SectorMetadata, type WorldRow } from "./travellermap";
import { subsectorSeedFor } from "../gen/sector";
import { systemSeedFor } from "../gen/subsector";
import { mainWorldSeed } from "../gen/system";
import { subsectorOf, parseSubsectorDoc } from "../subsector";
import { sectorOf, parseSectorDoc, subsectorIn } from "../sector";
import { seedFrom } from "../planet";

/**
 * Invented worlds, as everywhere in these tests. The point of fetching the
 * published data rather than bundling it is that none of it lives here.
 */
const SOURCE: ChartedSource = {
  origin: "travellermap",
  sector: "Testward Marches",
  abbreviation: "Test",
  x: -4,
  y: -1,
  milieu: "M1105",
};

function row(over: Partial<WorldRow> = {}): WorldRow {
  return {
    at: "0101",
    name: "Somewhere",
    uwp: "C430698-9",
    bases: "",
    zone: "",
    pbg: "613",
    allegiance: "Na",
    stars: "K9 V",
    remarks: "De Na Ni Po",
    ...over,
  };
}

/** A spread across four subsectors, so slicing by letter has something to do. */
const ROWS: WorldRow[] = [
  row({ at: "0101", name: "Aay" }),
  row({ at: "0810", name: "Bee" }),
  row({ at: "0901", name: "Cee" }),
  row({ at: "1910", name: "Dee", uwp: "B657744-A", bases: "NS", allegiance: "TeSt", pbg: "703" }),
];

/** The same, with the borders and routes a published sector comes with. */
const CHARTED_META: SectorMetadata = {
  names: new Map([["A", "First"], ["C", "Third"]]),
  borders: [
    { allegiance: "TeSt", label: "Test Hegemony", labelAt: "0102", hexes: ["0101", "0102", "0201", "0101"] },
  ],
  routes: [{ from: "0101", to: "0810" }],
  allegiances: [{ code: "TeSt", name: "The Test Hegemony", short: "Hegemony" }],
};

const META: SectorMetadata = {
  names: new Map([
    ["A", "First"],
    ["C", "Third"],
  ]),
  borders: [],
  routes: [],
  allegiances: [],
};

describe("the seed a published sector is rebuilt from", () => {
  it("is keyed on where the sector is and nothing else", () => {
    expect(chartedSeed(-4, -1)).toBe(seedFrom("travellermap", "-4,-1"));
    expect(chartedSeed(-4, -1)).not.toBe(chartedSeed(-4, 0));
  });

  it("gives the same answer every time it is asked", () => {
    expect(chartedSeed(3, 7)).toBe(chartedSeed(3, 7));
  });

  it("does not move when the milieu, the name or a profile does", () => {
    // AppSpec 8.5.2. A world's ground is its ground
    // whichever century you look at it in, and a Second Survey correction
    // to its UWP must not move its coastline.
    const other = { ...SOURCE, milieu: "M1120", sector: "Renamed" };
    const a = importSector(ROWS, SOURCE, META).doc;
    const b = importSector(
      ROWS.map((one) => ({ ...one, uwp: "X000000-0" })),
      other,
      META,
    ).doc;
    expect(b.seed).toBe(a.seed);
  });
});

describe("importing a subsector", () => {
  it("takes its seed from the sector's, down the ordinary chain", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third");
    expect(doc.seed).toBe(subsectorSeedFor(chartedSeed(SOURCE.x, SOURCE.y), "C"));
  });

  it("holds only the worlds of its own letter", () => {
    const { doc, report } = importSubsector(ROWS, SOURCE, "C", "Third");
    expect(doc.overrides.map((one) => one.at)).toEqual(["1910"]);
    expect(report.worlds).toBe(1);
  });

  it("puts the published world in the hex and nothing else anywhere", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third");
    const worlds = subsectorOf(doc).worlds;
    expect(worlds).toHaveLength(1);
    expect(worlds[0]!.at).toBe("1910");
    expect(worlds[0]!.name).toBe("Dee");
    expect(worlds[0]!.uwp).toBe("B657744-A");
    expect(worlds[0]!.allegiance).toBe("TeSt");
    expect(worlds[0]!.bases).toBe("A");
    expect(worlds[0]!.pbg).toEqual({ multiplier: 7, belts: 0, gasGiants: 3 });
  });

  it("leans neither way, because nothing on it was rolled", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third");
    expect(doc.shifts).toEqual({ population: 0, tech: 0 });
    expect(doc.density).toBe("none");
  });
});

describe("importing a whole sector", () => {
  it("carries all sixteen subsectors, named where the data names them", () => {
    const { doc } = importSector(ROWS, SOURCE, META);
    expect(doc.subsectors).toHaveLength(16);
    expect(doc.subsectors.find((one) => one.letter === "A")!.doc.name).toBe("First");
    // A letter the metadata does not name still has to be there, or the sector
    // would roll one of its own in the gap.
    expect(doc.subsectors.find((one) => one.letter === "B")!.doc.name).toBe("Subsector B");
  });

  it("puts out exactly the published worlds and no others", () => {
    const { doc, report } = importSector(ROWS, SOURCE, META);
    const worlds = sectorOf(doc).worlds;
    expect(worlds).toHaveLength(ROWS.length);
    expect(report.worlds).toBe(ROWS.length);
    expect(worlds.map((one) => one.at).sort()).toEqual(["0101", "0810", "0901", "1910"]);
  });

  it("gives the same documents every time", () => {
    const once = importSector(ROWS, SOURCE, META).doc;
    const twice = importSector(ROWS, SOURCE, META).doc;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe("a subsector is the same subsector either way", () => {
  // AppSpec 1.3, and the thing most likely to be got wrong: a subsector taken
  // out of an imported sector and the same subsector imported on its own have
  // to be one subsector, down to the seed every world below it hangs from.

  it("matches hex for hex and seed for seed", () => {
    const whole = importSector(ROWS, SOURCE, META).doc;
    const alone = importSubsector(ROWS, SOURCE, "C", "Third").doc;
    const sliced = subsectorIn(whole, "C");

    expect(sliced.seed).toBe(alone.seed);
    expect(subsectorOf(sliced).worlds).toEqual(subsectorOf(alone).worlds);
  });

  it("hangs the same world seed off both", () => {
    const alone = importSubsector(ROWS, SOURCE, "C", "Third").doc;
    const world = subsectorOf(alone).worlds[0]!;
    const expected = mainWorldSeed(systemSeedFor(alone.seed, "1910"));
    expect(world.seed).toBe(expected);
    // And that is reachable from the sector's position alone, which is the
    // whole promise: anybody who imports this sector gets this world.
    const chain = mainWorldSeed(
      systemSeedFor(subsectorSeedFor(chartedSeed(-4, -1), "C"), "1910"),
    );
    expect(world.seed).toBe(chain);
  });
});

describe("what the published columns become", () => {
  const made = (over: Partial<WorldRow>) =>
    importSubsector([row({ at: "0101", ...over })], SOURCE, "A", "First").doc.overrides[0]!;

  it("sorts the base letters into naval, scout, both or neither", () => {
    // T5 writes a letter per base; a map here draws two marks.
    expect(made({ bases: "N" }).bases).toBe("N");
    expect(made({ bases: "S" }).bases).toBe("S");
    expect(made({ bases: "NS" }).bases).toBe("A");
    expect(made({ bases: "KM" }).bases).toBe("N");
    expect(made({ bases: "NW" }).bases).toBe("A");
    expect(made({ bases: "RT" }).bases).toBe("N");
    expect(made({ bases: "V" }).bases).toBe("S");
    expect(made({ bases: "" }).bases).toBe("");
    // An embassy is not a base anything here draws.
    expect(made({ bases: "E" }).bases).toBe("");
  });

  it("keeps amber and red, reddens forbidden and drops unabsorbed", () => {
    expect(made({ zone: "A" }).zone).toBe("A");
    expect(made({ zone: "R" }).zone).toBe("R");
    expect(made({ zone: "F" }).zone).toBe("R");
    expect(made({ zone: "U" }).zone).toBe("");
    expect(made({ zone: "" }).zone).toBe("");
  });

  it("writes an empty bases and zone rather than leaving them out", () => {
    // Left out, the generator would hand the world a base of its own on the
    // next load. "No naval base" is a fact about the world, not a silence.
    const held = made({ bases: "", zone: "" });
    expect(held.bases).toBe("");
    expect(held.zone).toBe("");
  });

  it("keeps the published remarks as a note rather than losing them", () => {
    const held = made({ remarks: "Hi In Cp O:1910" });
    expect(held.note).toContain("Hi In Cp O:1910");
  });
});

describe("worlds the published data cannot fully describe", () => {
  it("says so on a profile nothing can read, instead of inventing one", () => {
    const { doc, report } = importSubsector(
      [row({ at: "0101", name: "Calibration Point", uwp: "???????-?" })],
      SOURCE,
      "A",
      "First",
    );
    const held = doc.overrides[0]!;
    expect(report.unreadable).toEqual(["0101"]);
    expect(held.name).toBe("Calibration Point");
    // No uwp override at all, so nothing claims the rolled digits are canon,
    // and the note says why.
    expect(held.uwp).toBeUndefined();
    expect(held.note).toMatch(/not a readable UWP/);
  });

  it("names an unnamed world after its hex rather than letting one be rolled", () => {
    const { doc, report } = importSubsector(
      [row({ at: "0203", name: "" })],
      SOURCE,
      "A",
      "First",
    );
    expect(report.unnamed).toEqual(["0203"]);
    expect(doc.overrides[0]!.name).toBe("0203");
  });
});

describe("an imported document saved and read back", () => {
  it("comes back the same, provenance and all", () => {
    const { doc } = importSector(ROWS, SOURCE, META);
    const read = parseSectorDoc(JSON.stringify(doc));
    expect(read.source).toEqual(SOURCE);
    expect(read.seed).toBe(doc.seed);
    expect(sectorOf(read).worlds).toEqual(sectorOf(doc).worlds);
  });

  it("keeps a subsector's worlds and provenance across a save", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third");
    const read = parseSubsectorDoc(JSON.stringify(doc));
    expect(read.source).toEqual(SOURCE);
    expect(subsectorOf(read).worlds).toEqual(subsectorOf(doc).worlds);
  });

  it("carries the borders, the routes and the polity names in the file", () => {
    // The whole of an imported sector lives in its own document: a seed, a
    // density, overrides, and this. Nothing is fetched again to redraw it, so
    // a sector saved today opens with its frontiers on a machine that has
    // never heard of travellermap.
    const { doc } = importSector(ROWS, SOURCE, CHARTED_META);
    const read = parseSectorDoc(JSON.stringify(doc));
    expect(read.charted?.borders).toEqual(CHARTED_META.borders);
    expect(read.charted?.routes).toEqual(CHARTED_META.routes);
    expect(read.charted?.allegiances).toEqual(CHARTED_META.allegiances);
  });

  it("still prefers the published routes after a save", () => {
    // 8.8.2: the published express legs replace the ones worked out from the
    // ports, and they have to go on doing it once the file has been read back.
    const { doc } = importSector(ROWS, SOURCE, CHARTED_META);
    const read = parseSectorDoc(JSON.stringify(doc));
    const xboat = sectorOf(read).routes.filter((route) => route.kind === "xboat");
    expect(xboat).toEqual([{ from: "0101", to: "0810", kind: "xboat" }]);
  });

  it("gives a subsector the whole sector's borders, so an edge is not cut", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third", CHARTED_META);
    const read = parseSubsectorDoc(JSON.stringify(doc));
    expect(read.charted?.borders).toEqual(CHARTED_META.borders);
  });

  it("drops provenance it cannot read without losing the worlds", () => {
    const { doc } = importSubsector(ROWS, SOURCE, "C", "Third");
    const damaged = { ...JSON.parse(JSON.stringify(doc)), source: { origin: "somewhere else" } };
    const read = parseSubsectorDoc(JSON.stringify(damaged));
    expect(read.source).toBeUndefined();
    expect(subsectorOf(read).worlds).toHaveLength(1);
  });
});

describe("end to end, from a table to a sector", () => {
  it("reads a table and puts its worlds where the table says", () => {
    const text = [
      "Sector\tSS\tHex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars",
      "Test\tA\t0101\tOne\tB564500-A\tN\tAg Ni\t\t103\tTeSt\tG2 V",
      "Test\tP\t3240\tTwo\tX000000-0\t\tBa\tR\t000\t\tM5 V",
    ].join("\r\n");
    const { rows, skipped } = parseWorldTable(text);
    expect(skipped).toEqual([]);
    const { doc } = importSector(rows, SOURCE, { ...META, names: new Map() });
    const worlds = sectorOf(doc).worlds;
    expect(worlds.map((one) => one.at)).toEqual(["0101", "3240"]);
    expect(worlds[0]!.bases).toBe("N");
    expect(worlds[1]!.zone).toBe("R");
    expect(worlds[1]!.allegiance).toBe("Na");
  });
});
