import { describe, expect, it } from "vitest";
import { allegiancesIn, tidyAllegiances, unnamedCodes, withAllegiances } from "./polities";
import { NOTHING_CHARTED, nameOfAllegiance, type ChartedMap } from "./charted-map";

const ROW = (code: string, name = "", short = "") => ({ code, name, short });

describe("tidying what the polity dialog collected", () => {
  it("trims and keeps what was typed", () => {
    const tidy = tidyAllegiances([ROW("  ZhIN ", " Zhodani Consulate ", " Consulate ")]);
    expect(tidy.kept).toEqual([{ code: "ZhIN", name: "Zhodani Consulate", short: "Consulate" }]);
  });

  it("leaves the case alone", () => {
    // Shouting ZhIN back as ZHIN would be correcting the setting's spelling.
    expect(tidyAllegiances([ROW("ZhIN")]).kept[0]!.code).toBe("ZhIN");
    expect(tidyAllegiances([ROW("CsIm")]).kept[0]!.code).toBe("CsIm");
  });

  it("drops a row with no code at all", () => {
    const tidy = tidyAllegiances([ROW(""), ROW("  "), ROW("ImDd", "Imperium")]);
    expect(tidy.kept.map((one) => one.code)).toEqual(["ImDd"]);
    // A wholly blank row is somebody who changed their mind, not a loss.
    expect(tidy.uncoded).toBe(0);
  });

  it("says when a named row had no code to keep it under", () => {
    const tidy = tidyAllegiances([ROW("", "The Hanse")]);
    expect(tidy.kept).toEqual([]);
    expect(tidy.uncoded).toBe(1);
  });

  it("keeps the first of a repeated code and says so", () => {
    const tidy = tidyAllegiances([ROW("ImDd", "First"), ROW("ImDd", "Second")]);
    expect(tidy.kept).toEqual([{ code: "ImDd", name: "First", short: "" }]);
    expect(tidy.repeated).toEqual(["ImDd"]);
  });

  it("treats two codes differing only in case as one", () => {
    // Two rows the map would draw as two polities and a reader would read as
    // one. A typo, caught here rather than on the map.
    const tidy = tidyAllegiances([ROW("ImDd", "One"), ROW("IMDD", "Two")]);
    expect(tidy.kept).toHaveLength(1);
    expect(tidy.repeated).toEqual(["IMDD"]);
  });

  it("cuts a code longer than the column it is stored in", () => {
    expect(tidyAllegiances([ROW("TooLongToFit")]).kept[0]!.code).toBe("TooL");
  });

  it("sorts by code, so the file does not churn", () => {
    const one = tidyAllegiances([ROW("ZhIN"), ROW("CsIm"), ROW("ImDd")]).kept;
    const two = tidyAllegiances([ROW("ImDd"), ROW("ZhIN"), ROW("CsIm")]).kept;
    expect(one.map((x) => x.code)).toEqual(["CsIm", "ImDd", "ZhIN"]);
    expect(two).toEqual(one);
  });
});

describe("where the table is kept", () => {
  it("gives a document with nothing else a charted map for it", () => {
    const made = withAllegiances(undefined, [{ code: "ImDd", name: "Imperium", short: "" }]);
    expect(made?.allegiances).toHaveLength(1);
    expect(made?.borders).toEqual([]);
    expect(made?.routes).toEqual([]);
  });

  it("leaves the borders and the routes where they were", () => {
    const held: ChartedMap = {
      borders: [{ allegiance: "ImDd", label: "", labelAt: "", hexes: ["0101", "0102", "0103"] }],
      routes: [{ from: "0101", to: "0102" }],
      allegiances: [{ code: "ImDd", name: "Old", short: "" }],
    };
    const made = withAllegiances(held, [{ code: "ZhIN", name: "New", short: "" }]);
    expect(made?.borders).toEqual(held.borders);
    expect(made?.routes).toEqual(held.routes);
    expect(made?.allegiances).toEqual([{ code: "ZhIN", name: "New", short: "" }]);
  });

  it("goes back to nothing when the last row is removed", () => {
    // A document should say only what somebody put in it: an empty table is
    // not a fact about the sector.
    expect(withAllegiances(NOTHING_CHARTED, [])).toBeUndefined();
    expect(withAllegiances(undefined, [])).toBeUndefined();
  });

  it("keeps the charted map where there are still borders under it", () => {
    const held: ChartedMap = {
      borders: [{ allegiance: "ImDd", label: "", labelAt: "", hexes: ["0101", "0102", "0103"] }],
      routes: [],
      allegiances: [{ code: "ImDd", name: "Imperium", short: "" }],
    };
    expect(withAllegiances(held, [])?.borders).toHaveLength(1);
  });

  it("reads back as nothing where a document has no table", () => {
    expect(allegiancesIn(undefined)).toEqual([]);
  });

  it("is what the readouts spell the code out from", () => {
    const made = withAllegiances(undefined, [
      { code: "ZhIN", name: "Zhodani Consulate", short: "Consulate" },
      { code: "Hn", name: "The Hanse", short: "" },
    ])!;
    expect(nameOfAllegiance(made, "ZhIN")).toBe("Consulate");
    // No short name, so the full one does the work.
    expect(nameOfAllegiance(made, "Hn")).toBe("The Hanse");
    // And a code nobody has named is still its own code rather than nothing.
    expect(nameOfAllegiance(made, "ImDd")).toBe("ImDd");
  });
});

describe("the codes a table has no name for", () => {
  const named = [{ code: "ImDd", name: "Imperium", short: "" }];

  it("offers a code a world wears that nothing names", () => {
    expect(unnamedCodes(["ImDd", "ZhIN"], named)).toEqual(["ZhIN"]);
  });

  it("offers each one once, however many worlds wear it", () => {
    expect(unnamedCodes(["ZhIN", "ZhIN", "ZhIN"], named)).toEqual(["ZhIN"]);
  });

  it("ignores case when deciding something is already named", () => {
    expect(unnamedCodes(["imdd"], named)).toEqual([]);
  });

  it("ignores the blanks", () => {
    expect(unnamedCodes(["", "  ", "ImDd"], named)).toEqual([]);
  });

  it("offers nothing where every code is named", () => {
    expect(unnamedCodes(["ImDd"], named)).toEqual([]);
    expect(unnamedCodes([], named)).toEqual([]);
  });

  it("sorts them, so the same sector offers the same list twice", () => {
    expect(unnamedCodes(["ZhIN", "CsIm", "SwCf"], [])).toEqual(["CsIm", "SwCf", "ZhIN"]);
  });
});
