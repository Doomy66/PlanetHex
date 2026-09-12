import { describe, it } from "vitest";
import { buildGrid } from "../src/grid/grid";
import { buildHeightField } from "../src/gen/field";
import { heightsOn, referenceHeightsOn } from "../src/gen/height";
import { REFERENCE_SIZE } from "../src/grid/coord";

function time<T>(label: string, run: () => T): T {
  const t0 = performance.now();
  const out = run();
  console.log(`${label.padEnd(40)} ${(performance.now() - t0).toFixed(1)} ms`);
  return out;
}

describe.runIf(process.env["BENCH"])("baseline", () => {
  it("measures the current pipeline", () => {
    const field = time("buildHeightField(96)", () => buildHeightField("BENCH01", REFERENCE_SIZE));
    let g96!: ReturnType<typeof buildGrid>;
    let g24!: ReturnType<typeof buildGrid>;
    time("buildGrid(96)", () => (g96 = buildGrid(96)));
    time("buildGrid(24)", () => (g24 = buildGrid(24)));
    time("heightsOn(96)", () => heightsOn(field, g96));
    time("heightsOn(24)", () => heightsOn(field, g24));
    time("referenceHeightsOn (48 lattice)", () => referenceHeightsOn(field));
    console.log(`cells 96: ${g96.cells.length}, placements 96: ${g96.net.reduce((n, f) => n + f.placements.length, 0)}`);
    console.log(`cells 24: ${g24.cells.length}, placements 24: ${g24.net.reduce((n, f) => n + f.placements.length, 0)}`);
  }, 120000);
});
