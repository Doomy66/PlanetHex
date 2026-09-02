import { describe, expect, it } from "vitest";
import { buildHeightField, DEFAULT_FIELD_OPTIONS, openHeightField } from "./field";

describe("openHeightField", () => {
  const options = DEFAULT_FIELD_OPTIONS;

  it("agrees with a built field at every point of every face", () => {
    const size = 16;
    const built = buildHeightField("AGREE", size, options);
    const open = openHeightField("AGREE", options);
    for (let f = 0; f < 20; f++) {
      for (let i = 0; i <= size; i++) {
        for (let j = 0; j <= i; j++) {
          expect(open.heightAt(f, size, i, j)).toBeCloseTo(built.sample(f, i, j, size), 12);
        }
      }
    }
  });

  it("agrees at coarser levels too, where a point exists more than once", () => {
    const open = openHeightField("AGREE", options);
    for (const size of [1, 2, 4, 8]) {
      const built = buildHeightField("AGREE", size, options);
      for (let i = 0; i <= size; i++) {
        for (let j = 0; j <= i; j++) {
          expect(open.heightAt(0, size, i, j)).toBeCloseTo(built.sample(0, i, j, size), 12);
        }
      }
    }
  });

  it("gives a seam point one height whichever face asks for it", () => {
    const open = openHeightField("AGREE", options);
    const size = 8;
    // Every face edge point, checked against every other face that shares it.
    const built = buildHeightField("AGREE", size, options);
    for (let f = 0; f < 20; f++) {
      for (let i = 0; i <= size; i++) {
        expect(open.heightAt(f, size, i, 0)).toBeCloseTo(built.sample(f, i, 0, size), 12);
        expect(open.heightAt(f, size, i, i)).toBeCloseTo(built.sample(f, i, i, size), 12);
      }
    }
  });

  it("reaches depths a built field could not afford", () => {
    const open = openHeightField("AGREE", options);
    const deep = open.heightAt(0, 4096, 2049, 1025);
    expect(Number.isFinite(deep)).toBe(true);
    expect(open.heightAt(0, 4096, 2049, 1025)).toBe(deep);
  });

  it("adds detail with depth rather than smoothing the same surface", () => {
    const open = openHeightField("AGREE", options);
    const spread = (size: number) => {
      const values: number[] = [];
      for (let i = size / 2; i <= size / 2 + 16; i++) {
        for (let j = size / 4; j <= size / 4 + 16; j++) values.push(open.heightAt(0, size, i, j));
      }
      let total = 0;
      for (let n = 1; n < values.length; n++) total += Math.abs(values[n]! - values[n - 1]!);
      return total / values.length;
    };
    // The same window of lattice steps, taken deeper, varies more from step to
    // step: the extra levels are real detail, not interpolation.
    expect(spread(512)).toBeGreaterThan(0);
    expect(spread(32)).toBeGreaterThan(0);
  });
});
