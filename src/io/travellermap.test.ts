import { describe, expect, it } from "vitest";
import {
  fetchCatalogue,
  fetchMetadata,
  fetchSectorTable,
  parseWorldTable,
  type Fetcher,
} from "./travellermap";

/**
 * Every fixture here is invented. Not one line is a world from a published
 * sector, because the point of fetching the data rather than bundling it is
 * that none of it lives in this repository, and a test file is part of the
 * repository like anything else.
 */
const HEADER =
  "Sector\tSS\tHex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars\t{Ix}\t(Ex)\t[Cx]\tNobility\tW\tRU";

function table(...lines: string[]): string {
  return [HEADER, ...lines].join("\r\n");
}

/** A world line, in the column order the header above gives. */
function line(cells: Partial<Record<string, string>>): string {
  const at = (name: string, fallback = "") => cells[name] ?? fallback;
  return [
    "Test",
    at("SS", "A"),
    at("Hex", "0101"),
    at("Name", "Somewhere"),
    at("UWP", "C430698-9"),
    at("Bases"),
    at("Remarks", "De Na"),
    at("Zone"),
    at("PBG", "613"),
    at("Allegiance", "Na"),
    at("Stars", "K9 V"),
    "{ -1 }",
    "(C53-1)",
    "[6559]",
    "",
    "8",
    "-180",
  ].join("\t");
}

describe("reading a published world table", () => {
  it("reads the columns it wants and ignores the rest", () => {
    const { rows, skipped } = parseWorldTable(
      table(
        line({
          Hex: "1910",
          Name: "Anywhere",
          UWP: "B657744-A",
          Bases: "NS",
          Zone: "A",
          PBG: "703",
          Allegiance: "TeSt",
          Stars: "F7 V M3 V",
          Remarks: "Hi In Cp",
        }),
      ),
    );
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      at: "1910",
      name: "Anywhere",
      uwp: "B657744-A",
      bases: "NS",
      zone: "A",
      pbg: "703",
      allegiance: "TeSt",
      stars: "F7 V M3 V",
      remarks: "Hi In Cp",
    });
  });

  it("finds the columns by name, not by where they sit", () => {
    // The trailing columns come and go between sectors and milieux, so a
    // reader counting from the left is a reader waiting to be wrong.
    const text = ["UWP\tHex\tName", "E000000-0\t0203\tShuffled"].join("\n");
    const { rows } = parseWorldTable(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.at).toBe("0203");
    expect(rows[0]!.name).toBe("Shuffled");
    expect(rows[0]!.uwp).toBe("E000000-0");
  });

  it("copes with a byte order mark, CRLF, blanks and comments", () => {
    const text = `﻿${HEADER}\r\n\r\n# a comment\r\n${line({ Hex: "0102" })}\r\n`;
    const { rows, skipped } = parseWorldTable(text);
    expect(skipped).toEqual([]);
    expect(rows.map((row) => row.at)).toEqual(["0102"]);
  });

  it("returns the worlds in hex order whatever order they arrived in", () => {
    const { rows } = parseWorldTable(
      table(line({ Hex: "0310" }), line({ Hex: "0101" }), line({ Hex: "0205" })),
    );
    expect(rows.map((row) => row.at)).toEqual(["0101", "0205", "0310"]);
  });

  it("reads a dash as nothing, because that is how the format writes none", () => {
    const { rows } = parseWorldTable(table(line({ Bases: "-", Zone: "-", Allegiance: "-" })));
    expect(rows[0]!.bases).toBe("");
    expect(rows[0]!.zone).toBe("");
    expect(rows[0]!.allegiance).toBe("");
  });

  it("keeps a profile it cannot read rather than dropping the world", () => {
    // Published data does carry these - deep space stations, calibration
    // points, things nobody has surveyed. The world is real and its profile is
    // not known, which is a different thing from the line being broken.
    const { rows, skipped } = parseWorldTable(table(line({ UWP: "???????-?", Name: "Unsurveyed" })));
    expect(skipped).toEqual([]);
    expect(rows[0]!.uwp).toBe("???????-?");
    expect(rows[0]!.name).toBe("Unsurveyed");
  });

  it("skips a line whose hex is not a hex, and says which", () => {
    const { rows, skipped } = parseWorldTable(
      table(line({ Hex: "9999" }), line({ Hex: "" }), line({ Hex: "0101" })),
    );
    expect(rows.map((row) => row.at)).toEqual(["0101"]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]!.reason).toMatch(/9999 is not a hex/);
    expect(skipped[1]!.reason).toMatch(/no hex/);
  });

  it("reports a repeated hex and keeps the last of them", () => {
    const { rows, skipped } = parseWorldTable(
      table(line({ Hex: "0101", Name: "First" }), line({ Hex: "0101", Name: "Second" })),
    );
    expect(rows).toHaveLength(2);
    expect(skipped[0]!.reason).toMatch(/0101 appears more than once/);
  });

  it("copes with a row that stops early", () => {
    const text = [HEADER, "Test\tA\t0101\tStub\tC430698-9"].join("\n");
    const { rows, skipped } = parseWorldTable(text);
    expect(skipped).toEqual([]);
    expect(rows[0]!.name).toBe("Stub");
    expect(rows[0]!.pbg).toBe("");
    expect(rows[0]!.stars).toBe("");
  });

  it("says so when there is no header at all", () => {
    const { rows, skipped } = parseWorldTable("nothing\tlike\ta\tsector\tfile");
    expect(rows).toEqual([]);
    expect(skipped.some((one) => one.reason.includes("no header row"))).toBe(true);
  });
});

/* The fetching, with the fetch handed in rather than the global replaced. */

function answering(byUrl: Record<string, string>): Fetcher {
  return (url) => {
    const body = Object.entries(byUrl).find(([part]) => url.includes(part))?.[1];
    if (body === undefined) {
      return Promise.resolve(new Response("no", { status: 404 }));
    }
    return Promise.resolve(new Response(body, { status: 200 }));
  };
}

describe("asking travellermap for a sector", () => {
  it("lists the official sectors, in name order", async () => {
    const universe = JSON.stringify({
      Sectors: [
        { X: 1, Y: 2, Tags: "Official OTU", Abbreviation: "Zzzz", Names: [{ Text: "Zedland" }] },
        { X: 3, Y: 4, Tags: "Official OTU", Abbreviation: "Aaaa", Names: [{ Text: "Ayeland" }] },
        { X: 5, Y: 6, Tags: "Unofficial OTU", Abbreviation: "Nope", Names: [{ Text: "Left out" }] },
      ],
    });
    const found = await fetchCatalogue(answering({ "/api/universe": universe }));
    expect(found.map((one) => one.name)).toEqual(["Ayeland", "Zedland"]);
    expect(found[0]).toEqual({ name: "Ayeland", abbreviation: "Aaaa", x: 3, y: 4 });
  });

  it("reads the subsector names off the metadata", async () => {
    const metadata = JSON.stringify({
      Subsectors: [
        { Name: "Alpha", Index: "A" },
        { Name: "", Index: "B" },
        { Name: "Charlie", Index: "C" },
      ],
    });
    const { names } = await fetchMetadata("Test", answering({ "/metadata": metadata }));
    expect(names.get("A")).toBe("Alpha");
    expect(names.get("C")).toBe("Charlie");
    // An unnamed subsector is not a subsector called "".
    expect(names.has("B")).toBe(false);
  });

  it("explains a refusal rather than throwing whatever came back", async () => {
    const refusing: Fetcher = () => Promise.resolve(new Response("", { status: 503 }));
    await expect(fetchSectorTable("Test", refusing)).rejects.toThrow(/answered 503/);
  });

  it("explains a connection that failed", async () => {
    const broken: Fetcher = () => Promise.reject(new Error("getaddrinfo ENOTFOUND"));
    await expect(fetchSectorTable("Test", broken)).rejects.toThrow(/Could not reach/);
  });

  it("asks for the right sector at the right era", async () => {
    let asked = "";
    const watching: Fetcher = (url) => {
      asked = url;
      return Promise.resolve(new Response(table(line({})), { status: 200 }));
    };
    await fetchSectorTable("Spin", watching);
    expect(asked).toBe("https://travellermap.com/data/Spin/tab?milieu=M1105");
  });
});
