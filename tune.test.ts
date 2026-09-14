import { describe, it } from "vitest";
import { generateSubsector } from "./src/gen/subsector";
import { hexDistance } from "./src/location";

describe("tune", () => {
  it("counts", () => {
    const tables: Record<string, Record<string, number>> = {
      now: { A: 3, B: 3, C: 2, D: 2, E: 1 },
      tighter: { A: 2, B: 2, C: 2, D: 1, E: 1 },
      tightest: { A: 2, B: 2, C: 1, D: 1, E: 1 },
      spare: { A: 2, B: 2, C: 1, D: 1, E: 0 },
    };
    for (const [name, table] of Object.entries(tables)) {
      let routes = 0;
      let worlds = 0;
      for (let i = 0; i < 8; i++) {
        const sub = generateSubsector(`tune-${i}`, "A");
        const open = sub.worlds.filter((w) => w.profile.population > 0 && w.zone !== "R");
        worlds += open.length;
        for (const [at, a] of open.entries()) {
          for (const b of open.slice(at + 1)) {
            const reach = Math.min(table[a.profile.starport] ?? 0, table[b.profile.starport] ?? 0);
            if (reach > 0 && hexDistance(a.hex, b.hex) <= reach) routes++;
          }
        }
      }
      console.log(name, "worlds", worlds, "routes", routes, "per world", (routes / worlds).toFixed(2));
    }
  });
});
