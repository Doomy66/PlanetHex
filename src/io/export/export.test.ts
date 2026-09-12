import { describe, expect, it } from "vitest";
import { hexRecords } from "./cells";
import { hexCsv } from "./csv";
import { hexGeoJson } from "./geojson";
import { sectorLine, sectorNotes } from "./sec";
import { worldSheetHtml, worldSheetMarkdown } from "./sheet";
import { buildSurface, shaderFor } from "../../surface";
import { planetDetail } from "../../gen/detail";
import { latticeRef } from "../../grid/coord";
import { newPlanet, type Planet } from "../../planet";
import type { Poi } from "../../poi";

/**
 * The exports of 6.17 to 6.19. None of these touches the document, so all of
 * them can be read back here as the text a save would write.
 *
 * The coarsest level throughout. It is 362 hexes rather than 92,162, and nothing
 * being checked is about how many there are.
 */

const SIZE = 6;
const SEED = "TESTSEED";

function world(over: Partial<Planet> = {}): Planet {
  return { ...newPlanet(SEED), name: "Regina", sector: "Spinward Marches", hex: "1910", size: SIZE, ...over };
}

const detailOf = (planet: Planet) => planetDetail(planet.seed, planet.uwp);

function surfaceOf(planet: Planet) {
  return buildSurface(planet, detailOf(planet), SIZE);
}

function recordsOf(planet: Planet) {
  const surface = surfaceOf(planet);
  return hexRecords(surface, planet.pois, shaderFor(surface, "terrain"));
}

const poi = (kind: Poi["kind"], name: string): Poi => ({
  kind,
  name,
  narrative: "Somewhere to put down.",
  ref: latticeRef(0, 4, 2, SIZE),
});

/* The hex records everything else is built on ---------------------------- */

describe("hex records", () => {
  it("describes every hex of the level", () => {
    expect(recordsOf(world())).toHaveLength(362);
  });

  it("names each hex as the panels name it", () => {
    for (const record of recordsOf(world())) {
      expect(record.name).toMatch(/^F\d\dR\d\dC\d\d$/);
    }
  });

  it("keeps every hex on the globe", () => {
    for (const record of recordsOf(world())) {
      expect(record.latitude).toBeGreaterThanOrEqual(-90);
      expect(record.latitude).toBeLessThanOrEqual(90);
      expect(record.longitude).toBeGreaterThanOrEqual(-180);
      expect(record.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("gives twelve hexes five sides and the rest six", () => {
    const pentagons = recordsOf(world()).filter((record) => record.sides === 5);
    expect(pentagons).toHaveLength(12);
  });

  // Spec 6.17.1.1: a hex straddling the antimeridian is one ring in the place it
  // is, not a shape stretched across the whole world. The two pole hexes are the
  // exception and are checked on their own below: a cap does span every
  // longitude, because that is what being over the pole means.
  it("keeps every outline together rather than wrapping it round the world", () => {
    for (const record of recordsOf(world())) {
      if (Math.abs(record.latitude) > 89) continue;
      const longitudes = record.outline.map(([, lon]) => lon);
      expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThan(180);
    }
  });

  it("closes the two pole hexes over the pole itself", () => {
    const poles = recordsOf(world()).filter((record) => Math.abs(record.latitude) > 89);
    expect(poles).toHaveLength(2);
    for (const pole of poles) {
      expect(pole.outline.some(([lat]) => Math.abs(lat) === 90)).toBe(true);
    }
  });

  it("says which hex a point of interest fell on", () => {
    const planet = world({ pois: [poi("starport", "Regina Down")] });
    const carrying = recordsOf(planet).filter((record) => record.pois.length > 0);
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.pois[0]!.name).toBe("Regina Down");
  });

  it("agrees with itself about land and terrain", () => {
    for (const record of recordsOf(world())) {
      expect(record.land).toBe(record.relief > 0);
      expect(record.terrain).not.toBe("");
    }
  });
});

/* CSV, Spec 6.17.3 -------------------------------------------------------- */

describe("the hex table", () => {
  const rows = (text: string) => text.trimEnd().split("\r\n");

  it("writes a header and one row per hex", () => {
    const lines = rows(hexCsv(recordsOf(world())));
    expect(lines[0]).toMatch(/^hex,latitude,longitude,/);
    expect(lines).toHaveLength(363);
  });

  /**
   * A row split the way the format says to split it: a comma inside quotes is
   * part of the field. A naive split would pass on a file the quoting is broken
   * in, which is the thing worth checking.
   */
  const fieldsOf = (row: string): string[] => {
    const out: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i]!;
      if (quoted) {
        if (c !== '"') field += c;
        else if (row[i + 1] === '"') (field += '"'), i++;
        else quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === ",") (out.push(field), (field = ""));
      else field += c;
    }
    out.push(field);
    return out;
  };

  it("writes the same number of fields on every row", () => {
    const lines = rows(hexCsv(recordsOf(world())));
    const columns = fieldsOf(lines[0]!).length;
    for (const line of lines) expect(fieldsOf(line)).toHaveLength(columns);
  });

  // The colour is written as the panel writes it, commas and all, so it is the
  // one field on an ordinary row that has to be quoted.
  it("quotes the colour rather than letting it become three columns", () => {
    const lines = rows(hexCsv(recordsOf(world())));
    expect(fieldsOf(lines[1]!).some((value) => /^rgb\(\d+,\d+,\d+\)$/.test(value))).toBe(true);
  });

  it("quotes a name with a comma in it rather than starting a new column", () => {
    const planet = world({ pois: [{ ...poi("comment", 'Port "Nine", east side') }] });
    const line = rows(hexCsv(recordsOf(planet))).find((row) => row.includes("Nine"))!;
    expect(line).toContain('"Port ""Nine"", east side"');
  });

  it("ends every line the way the format asks", () => {
    expect(hexCsv(recordsOf(world())).endsWith("\r\n")).toBe(true);
  });
});

/* GeoJSON, Spec 6.17.2 ---------------------------------------------------- */

describe("the hex polygons", () => {
  const parse = (planet: Planet) => {
    const surface = surfaceOf(planet);
    return JSON.parse(
      hexGeoJson(hexRecords(surface, planet.pois, shaderFor(surface, "terrain")), {
        planet,
        size: SIZE,
        seaLevel: surface.seaLevel,
        diameterKm: surface.diameterKm,
      }),
    ) as {
      type: string;
      planethex: Record<string, unknown>;
      features: {
        geometry: { type: string; coordinates: number[][][] | number[] };
        properties: Record<string, unknown>;
      }[];
    };
  };

  it("is a feature collection with a feature per hex", () => {
    const parsed = parse(world());
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(362);
  });

  it("closes every ring, as the format requires", () => {
    for (const feature of parse(world()).features) {
      const ring = (feature.geometry.coordinates as number[][][])[0]!;
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      // A hexagon and its repeated first corner; a pentagon, five and one; a
      // pole hex, its corners and the two points that close it over the pole.
      expect(ring.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("writes longitude before latitude", () => {
    for (const feature of parse(world()).features) {
      for (const [lon, lat] of (feature.geometry.coordinates as number[][][])[0]!) {
        expect(Math.abs(lat!)).toBeLessThanOrEqual(90);
        expect(Math.abs(lon!)).toBeLessThanOrEqual(360);
      }
    }
  });

  it("says which world it is", () => {
    expect(parse(world()).planethex).toMatchObject({ name: "Regina", seed: SEED, detail: SIZE });
  });

  // Spec 6.17.2.2: the hex is the shape, the point of interest is the point.
  it("adds a point for each point of interest", () => {
    const parsed = parse(world({ pois: [poi("starport", "Regina Down")] }));
    const points = parsed.features.filter((f) => f.geometry.type === "Point");
    expect(points).toHaveLength(1);
    expect(points[0]!.properties).toMatchObject({ kind: "starport", name: "Regina Down" });
  });
});

/* The sector line, Spec 6.18 ---------------------------------------------- */

describe("the sector line", () => {
  // Split on the line ending alone. Trimming the whole file first would take the
  // trailing tab off with it, and the last column is one the format has.
  const linesOf = (planet: Planet) =>
    sectorLine(planet)
      .split("\n")
      .filter((line) => line !== "");
  const fieldsOf = (planet: Planet) => linesOf(planet)[1]!.split("\t");

  it("writes a header and one world", () => {
    const lines = linesOf(world());
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split("\t")[0]).toBe("Hex");
  });

  it("gives every column the header names", () => {
    const lines = linesOf(world());
    expect(lines[1]!.split("\t")).toHaveLength(lines[0]!.split("\t").length);
  });

  it("carries the hex, the name and the profile", () => {
    const fields = fieldsOf(world({ uwp: "A788899-C" }));
    expect(fields[0]).toBe("1910");
    expect(fields[1]).toBe("Regina");
    expect(fields[2]).toBe("A788899-C");
  });

  it("works the trade codes out into the remarks", () => {
    expect(fieldsOf(world({ uwp: "A788899-C" }))[4]).toContain("Ri");
  });

  it("puts a world with no hex somewhere rather than nowhere", () => {
    expect(fieldsOf(world({ hex: "" }))[0]).toBe("0000");
    expect(fieldsOf(world({ hex: "9999" }))[0]).toBe("0000");
  });

  it("keeps a name with a tab in it on one line and in one column", () => {
    const fields = fieldsOf(world({ name: "Regina\tCredo" }));
    expect(fields[1]).toBe("Regina Credo");
  });

  it("writes three digits of PBG", () => {
    expect(fieldsOf(world())[6]).toMatch(/^\d{3}$/);
  });

  it("says in its notes what it had nothing to say about", () => {
    expect(sectorNotes(world())).toContain("Bases, zone and stars are blank");
  });
});

/* The world sheet, Spec 6.19 ---------------------------------------------- */

describe("the world sheet", () => {
  const input = (planet: Planet) => ({
    planet,
    detail: detailOf(planet),
    size: SIZE,
    cells: 362,
  });

  it("leads with the planet's name", () => {
    expect(worldSheetMarkdown(input(world())).startsWith("# Regina\n")).toBe(true);
  });

  it("spells the profile out position by position", () => {
    const text = worldSheetMarkdown(input(world({ uwp: "A788899-C" })));
    expect(text).toContain("Starport A");
    expect(text).toContain("Tech level C");
    expect(text).toContain("an excellent starport");
  });

  it("names the subsector the hex falls in", () => {
    expect(worldSheetMarkdown(input(world()))).toContain("subsector");
  });

  it("lists the points of interest with their hexes", () => {
    const text = worldSheetMarkdown(input(world({ pois: [poi("starport", "Regina Down")] })));
    expect(text).toContain("### Regina Down");
    expect(text).toMatch(/Starport · F\d\dR\d\dC\d\d/);
  });

  it("leaves out a section there is nothing to put in", () => {
    expect(worldSheetMarkdown(input(world()))).not.toContain("## Points of interest");
    expect(worldSheetMarkdown(input(world()))).not.toContain("## Narrative");
  });

  it("keeps a pipe in the prose out of the table", () => {
    const text = worldSheetMarkdown(input(world({ name: "Regina | Credo" })));
    expect(text).toContain("# Regina | Credo");
  });

  it("writes a page that stands on its own", () => {
    const html = worldSheetHtml(input(world()));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("</html>");
  });

  it("escapes what the user wrote rather than letting it be markup", () => {
    const html = worldSheetHtml(input(world({ narrative: "<script>alert(1)</script>" })));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("says the same things in both files", () => {
    const planet = world({ uwp: "A788899-C", narrative: "A world worth the trip." });
    const md = worldSheetMarkdown(input(planet));
    const html = worldSheetHtml(input(planet));
    for (const said of ["Regina", "A788899-C", "A world worth the trip.", "Spinward Marches"]) {
      expect(md).toContain(said);
      expect(html).toContain(said);
    }
  });
});
