import { describe, expect, it } from "vitest";
import {
  formatLocation,
  formatSectorHex,
  parseSectorHex,
  SECTOR_COLS,
  SECTOR_ROWS,
  splitLegacyLocation,
  subsectorLetter,
} from "./location";
import { parsePlanet } from "./planet";

describe("sector hex", () => {
  it("reads a four digit location as a column and a row", () => {
    expect(parseSectorHex("1910")).toEqual({ col: 19, row: 10 });
    expect(parseSectorHex("0101")).toEqual({ col: 1, row: 1 });
    expect(parseSectorHex("3240")).toEqual({ col: 32, row: 40 });
  });

  it("allows spaces around and inside it", () => {
    expect(parseSectorHex(" 19 10 ")).toEqual({ col: 19, row: 10 });
  });

  it("refuses anything that is not a square on the chart", () => {
    for (const bad of ["", "191", "19100", "0010", "1900", "3340", "1941", "19x0", "abcd"]) {
      expect(parseSectorHex(bad), bad).toBeNull();
    }
  });

  it("writes a hex back as four digits", () => {
    expect(formatSectorHex({ col: 1, row: 9 })).toBe("0109");
    expect(formatSectorHex({ col: 32, row: 40 })).toBe("3240");
  });

  it("round trips every square on the chart", () => {
    for (let col = 1; col <= SECTOR_COLS; col++) {
      for (let row = 1; row <= SECTOR_ROWS; row++) {
        expect(parseSectorHex(formatSectorHex({ col, row }))).toEqual({ col, row });
      }
    }
  });
});

describe("subsectors", () => {
  // Four across and four down, lettered left to right then top to bottom.
  it("letters the corners of the chart A, D, M and P", () => {
    expect(subsectorLetter({ col: 1, row: 1 })).toBe("A");
    expect(subsectorLetter({ col: 32, row: 1 })).toBe("D");
    expect(subsectorLetter({ col: 1, row: 40 })).toBe("M");
    expect(subsectorLetter({ col: 32, row: 40 })).toBe("P");
  });

  it("puts each of the sixteen letters on eighty squares", () => {
    const counts = new Map<string, number>();
    for (let col = 1; col <= SECTOR_COLS; col++) {
      for (let row = 1; row <= SECTOR_ROWS; row++) {
        const letter = subsectorLetter({ col, row });
        counts.set(letter, (counts.get(letter) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(16);
    for (const [letter, count] of counts) expect(count, letter).toBe(SECTOR_COLS * SECTOR_ROWS / 16);
  });

  it("changes letter across a subsector boundary and not within one", () => {
    expect(subsectorLetter({ col: 8, row: 10 })).toBe("A");
    expect(subsectorLetter({ col: 9, row: 10 })).toBe("B");
    expect(subsectorLetter({ col: 8, row: 11 })).toBe("E");
  });
});

describe("stating a location", () => {
  it("gives the sector, the hex and the subsector it implies", () => {
    expect(formatLocation({ sector: "Spinward Marches", hex: "1910" })).toBe(
      "Spinward Marches 1910 (subsector C)",
    );
  });

  it("says what it has when only one field is filled in", () => {
    expect(formatLocation({ sector: "Spinward Marches", hex: "" })).toBe("Spinward Marches");
    expect(formatLocation({ sector: "", hex: "1910" })).toBe("1910 (subsector C)");
    expect(formatLocation({ sector: "", hex: "" })).toBe("");
  });

  it("ignores a hex it cannot read rather than repeating it back", () => {
    expect(formatLocation({ sector: "Core", hex: "19" })).toBe("Core");
  });
});

describe("older saves", () => {
  it("splits a free text location into a sector and a hex", () => {
    expect(splitLegacyLocation("Spinward Marches 1910")).toEqual({
      sector: "Spinward Marches",
      hex: "1910",
    });
    expect(splitLegacyLocation("Spinward Marches, 1910")).toEqual({
      sector: "Spinward Marches",
      hex: "1910",
    });
  });

  it("keeps text with no hex in it as the sector", () => {
    expect(splitLegacyLocation("somewhere out past Vland")).toEqual({
      sector: "somewhere out past Vland",
      hex: "",
    });
  });

  it("leaves four digits that are not a square on the chart alone", () => {
    expect(splitLegacyLocation("Sector 9999")).toEqual({ sector: "Sector 9999", hex: "" });
  });

  it("loads one, so an old file keeps what the user wrote", () => {
    const planet = parsePlanet(
      JSON.stringify({ version: 1, seed: "ABC", size: 24, location: "Spinward Marches 1910" }),
    );
    expect(planet.sector).toBe("Spinward Marches");
    expect(planet.hex).toBe("1910");
  });

  it("prefers the two fields when a save has them", () => {
    const planet = parsePlanet(
      JSON.stringify({ version: 1, seed: "ABC", size: 24, sector: "Core", hex: "0101" }),
    );
    expect(planet.sector).toBe("Core");
    expect(planet.hex).toBe("0101");
  });
});
