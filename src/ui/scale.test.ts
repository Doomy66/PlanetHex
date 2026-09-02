import { describe, expect, it } from "vitest";
import { formatDistance, formatPrecise, ICO_EDGE_ANGLE, niceDistance, stepKm } from "./scale";

describe("stepKm", () => {
  it("spaces hexes by the face edge divided by the row count", () => {
    // A face edge always spans the same angle, so its length depends only on size.
    const earth = 12742;
    expect(stepKm(earth, 24)).toBeCloseTo((ICO_EDGE_ANGLE * (earth / 2)) / 24, 9);
    expect(stepKm(earth, 48)).toBeCloseTo(stepKm(earth, 24) / 2, 9);
  });

  it("scales with the planet", () => {
    expect(stepKm(2000, 24)).toBeCloseTo(stepKm(1000, 24) * 2, 9);
  });
});

describe("niceDistance", () => {
  it("rounds down to 1, 2 or 5 times a power of ten", () => {
    expect(niceDistance(944)).toBe(500);
    expect(niceDistance(28.2)).toBe(20);
    expect(niceDistance(1)).toBe(1);
    expect(niceDistance(9999)).toBe(5000);
    expect(niceDistance(0.34)).toBe(0.2);
  });

  it("never returns more than it was given", () => {
    for (let n = 1; n < 500; n++) {
      const km = n * 7.3;
      expect(niceDistance(km)).toBeLessThanOrEqual(km);
      expect(niceDistance(km)).toBeGreaterThan(km / 10);
    }
  });

  it("has nothing to show for nothing", () => {
    expect(niceDistance(0)).toBe(0);
    expect(niceDistance(-5)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("reads plainly at each magnitude", () => {
    expect(formatDistance(500)).toBe("500 km");
    expect(formatDistance(5000)).toBe("5,000 km");
    expect(formatDistance(0.5)).toBe("0.5 km");
  });
});

describe("formatPrecise", () => {
  it("keeps a decimal where a hex is small enough for rounding to lie", () => {
    expect(formatPrecise(2.68)).toBe("2.7 km");
    expect(formatPrecise(28.6)).toBe("28.6 km");
    expect(formatPrecise(0.42)).toBe("0.42 km");
  });

  it("drops the decimal once it stops telling the reader anything", () => {
    expect(formatPrecise(293)).toBe("293 km");
    expect(formatPrecise(1410)).toBe("1,410 km");
  });

  it("is the hex size a scale bar would report for a known world", () => {
    // 12,742km across at size 24: a face edge is a fixed angle, so this follows.
    expect(formatPrecise(stepKm(12742, 24))).toBe("294 km");
  });
});
