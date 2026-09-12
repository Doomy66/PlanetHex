import { describe, it } from "vitest";
import { buildGrid } from "../src/grid/grid";
import { buildHeightField } from "../src/gen/field";
import { heightsOn, referenceHeightsOn } from "../src/gen/height";
import { REFERENCE_SIZE } from "../src/grid/coord";
import { buildCraterField, DEFAULT_CRATER_OPTIONS } from "../src/gen/crater";

/**
 * A whole redraw with the crater layer in it, against the same redraw without.
 *
 * The field itself is held between redraws, so what a redraw actually pays is the
 * sampling: the cells on screen, and the reference lattice sea level is read off.
 * Both are here, and both are what the crater layer adds to.
 *
 * Run with BENCH=1 npx vitest run bench/redraw.test.ts
 */

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

describe.runIf(process.env["BENCH"])("redraw", () => {
  it("costs this much with craters over it", () => {
    const field = buildHeightField(SEED, REFERENCE_SIZE);
    const grids = { 24: buildGrid(24), 96: buildGrid(96) };
    console.log(
      `\nbuildHeightField(96): ${median(3, () => buildHeightField(SEED, REFERENCE_SIZE)).toFixed(0)} ms, once per seed or UWP shape change` +
        `\nbuildGrid(96): once a session\n`,
    );
    console.log(" craters | build |   redraw at 24 |   redraw at 96 | over bare");
    console.log(" --------|-------|----------------|----------------|----------");
    const bare96 =
      median(5, () => heightsOn(field, grids[96])) + median(5, () => referenceHeightsOn(field));
    for (const count of [0, 250, 500, 1000, 2000, 5000, 10000, 20000]) {
      const options = { ...DEFAULT_CRATER_OPTIONS, count };
      const build = median(3, () => buildCraterField(SEED, options));
      const craters = buildCraterField(SEED, options);
      const at24 =
        median(5, () => heightsOn(field, grids[24], craters)) +
        median(5, () => referenceHeightsOn(field, craters));
      const at96 =
        median(5, () => heightsOn(field, grids[96], craters)) +
        median(5, () => referenceHeightsOn(field, craters));
      console.log(
        [
          String(count).padStart(8),
          `${build.toFixed(1).padStart(4)}ms`,
          `${at24.toFixed(1).padStart(11)} ms`,
          `${at96.toFixed(1).padStart(11)} ms`,
          `${(at96 - bare96 + build >= 0 ? "+" : "") + (at96 + build - bare96).toFixed(1)} ms`.padStart(9),
        ].join(" | "),
      );
    }
  }, 600000);
});
