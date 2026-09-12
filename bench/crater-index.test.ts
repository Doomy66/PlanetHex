import { describe, it } from "vitest";
import { buildGrid, type Grid } from "../src/grid/grid";
import { SEA_SAMPLE_SIZE } from "../src/grid/coord";
import { buildCraterField, DEFAULT_CRATER_OPTIONS, type CraterField } from "../src/gen/crater";

/** How the crater cost moves with the resolution of the bucket index. */

const SEED = "BENCH01";

function median(runs: number, run: () => unknown): number {
  const times: number[] = [];
  for (let n = 0; n < runs; n++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

function sweepGrid(grid: Grid, craters: CraterField): number {
  let total = 0;
  for (const face of grid.net) {
    for (const p of face.placements) total += craters.offsetAt(face.face, grid.size, p.i, p.j);
  }
  return total;
}

function sweepReference(craters: CraterField): number {
  let total = 0;
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i <= SEA_SAMPLE_SIZE; i++) {
      for (let j = 0; j <= i; j++) total += craters.offsetAt(f, SEA_SAMPLE_SIZE, i, j);
    }
  }
  return total;
}

describe.runIf(process.env["BENCH"])("crater index", () => {
  it("trades build against sweep as the buckets get finer", () => {
    const g96 = buildGrid(96);
    for (let n = 0; n < 3; n++) sweepGrid(g96, buildCraterField(SEED, { ...DEFAULT_CRATER_OPTIONS, count: 500 }));

    for (const count of [1000, 5000, 25000, 100000]) {
      console.log(`\n${count} craters`);
      console.log("  rows | buckets |  build |   mean | worst | sweep 96 | sweep ref |  total");
      console.log("  -----|---------|--------|--------|-------|----------|-----------|-------");
      for (const rows of [4, 8, 16, 24, 32, 48]) {
        const options = { ...DEFAULT_CRATER_OPTIONS, count };
        const build = median(3, () => buildCraterField(SEED, options, rows));
        const field = buildCraterField(SEED, options, rows);
        const s96 = median(5, () => sweepGrid(g96, field));
        const ref = median(5, () => sweepReference(field));
        console.log(
          [
            String(rows).padStart(6),
            String(20 * (rows * (rows + 1)) / 2).padStart(7),
            `${build.toFixed(1).padStart(5)}ms`,
            field.meanTested.toFixed(1).padStart(6),
            String(field.worstBucket).padStart(5),
            `${s96.toFixed(2).padStart(7)}ms`,
            `${ref.toFixed(2).padStart(8)}ms`,
            `${(build + s96 + ref).toFixed(1).padStart(5)}ms`,
          ].join(" | "),
        );
      }
    }
  }, 900000);
});
