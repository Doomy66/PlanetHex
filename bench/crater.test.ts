import { describe, it } from "vitest";
import { buildGrid, type Grid } from "../src/grid/grid";
import { buildHeightField } from "../src/gen/field";
import { REFERENCE_SIZE, SEA_SAMPLE_SIZE } from "../src/grid/coord";
import {
  buildCraterField,
  DEFAULT_CRATER_OPTIONS,
  type CraterField,
  type CraterOptions,
} from "../src/gen/crater";

/**
 * What a crater layer costs, against how many craters are in it.
 *
 * Run with BENCH=1 npx vitest run bench/crater.test.ts
 */

const SEED = "BENCH01";

function time<T>(run: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = run();
  return { ms: performance.now() - t0, value };
}

/** The median of several runs, so one unlucky garbage collection is not the answer. */
function median(runs: number, run: () => unknown): number {
  const times: number[] = [];
  for (let n = 0; n < runs; n++) times.push(time(run).ms);
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

/** A full pass over a display grid, which is what heightsOn would be paying. */
function sweepGrid(grid: Grid, craters: CraterField): number {
  let total = 0;
  for (const face of grid.net) {
    for (const p of face.placements) {
      total += craters.offsetAt(face.face, grid.size, p.i, p.j);
    }
  }
  return total;
}

/** A full pass over the lattice sea level is read off. */
function sweepReference(craters: CraterField): number {
  let total = 0;
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i <= SEA_SAMPLE_SIZE; i++) {
      for (let j = 0; j <= i; j++) total += craters.offsetAt(f, SEA_SAMPLE_SIZE, i, j);
    }
  }
  return total;
}

const COUNTS = [0, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000];

describe.runIf(process.env["BENCH"])("crater cost", () => {
  it("scales with the crater count", () => {
    const g96 = buildGrid(96);
    const g24 = buildGrid(24);
    // Warm the JIT on the shapes the loops will see.
    for (let n = 0; n < 3; n++) {
      const warm = buildCraterField(SEED, { ...DEFAULT_CRATER_OPTIONS, count: 500 });
      sweepGrid(g24, warm);
      sweepReference(warm);
    }

    console.log(
      "\n count |  build |  worst | mean/px | sweep 24 | sweep 96 | sweep ref | redraw 24 | redraw 96",
    );
    console.log(
      "-------|--------|--------|---------|----------|----------|-----------|-----------|----------",
    );
    for (const count of COUNTS) {
      const options: CraterOptions = { ...DEFAULT_CRATER_OPTIONS, count };
      const build = median(3, () => buildCraterField(SEED, options));
      const field = buildCraterField(SEED, options);
      const s24 = median(5, () => sweepGrid(g24, field));
      const s96 = median(5, () => sweepGrid(g96, field));
      const ref = median(5, () => sweepReference(field));
      console.log(
        [
          String(count).padStart(6),
          `${build.toFixed(1).padStart(5)}ms`,
          String(field.worstBucket).padStart(6),
          field.meanTested.toFixed(1).padStart(7),
          `${s24.toFixed(2).padStart(7)}ms`,
          `${s96.toFixed(2).padStart(7)}ms`,
          `${ref.toFixed(2).padStart(8)}ms`,
          `${(build + s24 + ref).toFixed(1).padStart(8)}ms`,
          `${(build + s96 + ref).toFixed(1).padStart(8)}ms`,
        ].join(" | "),
      );
    }
  }, 600000);

  it("reports what the craters actually cover", () => {
    for (const count of [200, 1000, 5000, 25000]) {
      const field = buildCraterField(SEED, { ...DEFAULT_CRATER_OPTIONS, count });
      // Area of the sphere inside a rim, summed, which double counts overlaps and
      // so is the saturation figure rather than the fraction covered.
      let area = 0;
      let visible24 = 0;
      let visible96 = 0;
      // A crater is drawable when its rim spans more than a hex, and a hex at n
      // rows to a face is one twentieth of the sphere over ten n squared of them.
      const hexRadius = (n: number) => Math.acos(1 - 2 / (10 * n * n + 2));
      for (const c of field.craters) {
        area += 2 * Math.PI * (1 - Math.cos(c.radius));
        if (c.radius >= hexRadius(24)) visible24++;
        if (c.radius >= hexRadius(96)) visible96++;
      }
      const largest = field.craters.reduce((m, c) => Math.max(m, c.radius), 0);
      console.log(
        `${String(count).padStart(6)} craters: saturation ${(area / (4 * Math.PI)).toFixed(2)}` +
          `, larger than a hex at 24: ${visible24}, at 96: ${visible96}` +
          `, largest ${((largest * 180) / Math.PI).toFixed(1)} deg`,
      );
    }
  });

  it("measures the whole redraw, field and all", () => {
    const g96 = buildGrid(96);
    const field = buildHeightField(SEED, REFERENCE_SIZE);
    console.log(`buildHeightField(96): ${median(3, () => buildHeightField(SEED, REFERENCE_SIZE)).toFixed(1)} ms (cached between redraws)`);
    let sink = 0;
    console.log(
      `field sample sweep 96: ${median(5, () => {
        for (const face of g96.net) {
          for (const p of face.placements) sink += field.sample(face.face, p.i, p.j, g96.size);
        }
      }).toFixed(1)} ms`,
    );
    if (sink === Infinity) throw new Error("unreachable");
  }, 600000);
});
