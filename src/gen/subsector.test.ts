import { describe, expect, it } from "vitest";
import { hexDistance, parseSectorHex, subsectorHexes, subsectorLetter } from "../location";
import { mainWorldSeed } from "./system";
import { rollUwp } from "../planet";
import {
  DENSITIES,
  generateSubsector,
  holdsSystem,
  routesBetween,
  systemSeedFor,
  type Density,
} from "./subsector";
import { subsectorFile } from "../io/export/subsector";
import { generateSector } from "./sector";

const SEEDS = Array.from({ length: 40 }, (_, i) => `subsector-${i}`);

describe("the eighty hexes", () => {
  it("gives every subsector its own square of the subsector", () => {
    // SubSectorSpec 2.1.1 and 2.2.2: eight across and ten down, numbered where
    // that subsector sits on the sector map rather than from its own corner.
    for (const letter of "ABCDEFGHIJKLMNOP") {
      const hexes = subsectorHexes(letter);
      expect(hexes, letter).toHaveLength(80);
      for (const hex of hexes) {
        expect(subsectorLetter(hex), `${letter} ${hex.col},${hex.row}`).toBe(letter);
      }
    }
  });

  it("covers the whole sector between them and overlaps nowhere", () => {
    const seen = new Set<string>();
    for (const letter of "ABCDEFGHIJKLMNOP") {
      for (const hex of subsectorHexes(letter)) seen.add(`${hex.col}:${hex.row}`);
    }
    expect(seen.size).toBe(32 * 40);
  });
});

describe("where the systems are", () => {
  it("puts about as many systems out as the density asks for", () => {
    for (const density of Object.keys(DENSITIES) as Density[]) {
      let worlds = 0;
      for (const seed of SEEDS) worlds += generateSubsector(seed, "A", density).worlds.length;
      const share = worlds / (SEEDS.length * 80);
      expect(Math.abs(share - DENSITIES[density]), density).toBeLessThan(0.06);
    }
  });

  it("only ever adds systems as the density rises", () => {
    // SubSectorSpec 3.2.2.1. A referee who has written notes on half a subsector and
    // then decides the region should be busier keeps the half they wrote.
    const order: Density[] = ["rift", "sparse", "standard", "dense"];
    for (const seed of SEEDS) {
      let before = new Set<string>();
      for (const density of order) {
        const now = new Set(generateSubsector(seed, "A", density).worlds.map((w) => w.at));
        for (const at of before) expect(now.has(at), `${seed} ${density} ${at}`).toBe(true);
        before = now;
      }
    }
  });

  it("agrees with itself about which hexes hold systems", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const subsector = generateSubsector(seed, "C", "standard");
      for (const hex of subsectorHexes("C")) {
        const at = `${String(hex.col).padStart(2, "0")}${String(hex.row).padStart(2, "0")}`;
        const here = subsector.worlds.some((world) => world.at === at);
        expect(holdsSystem(seed, at, "standard"), at).toBe(here);
      }
    }
  });
});

describe("what the subsector holds", () => {
  const subsector = generateSubsector("REGINA42", "C", "standard");

  it("shows the profile the world's own seed rolls", () => {
    // The claim the whole chain is built on, at this level: the subsector names
    // seeds rather than inventing worlds. SubSectorSpec 1.3.1.
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.systemSeed).toBe(systemSeedFor(seed, world.at));
        expect(world.seed).toBe(mainWorldSeed(world.systemSeed));
        expect(world.uwp, world.at).toBe(rollUwp(world.seed));
      }
    }
  });

  it("puts every world on a square of the subsector", () => {
    for (const world of subsector.worlds) {
      expect(parseSectorHex(world.at), world.at).not.toBeNull();
      expect(subsectorLetter(world.hex)).toBe("C");
    }
  });

  it("gives bases only to the ports that can carry them", () => {
    // SubSectorSpec 3.5.1: naval at A and B, scout at A through D, neither
    // anywhere else.
    let naval = 0;
    let scout = 0;
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        const port = world.profile.starport;
        if (world.bases === "N" || world.bases === "A") {
          naval++;
          expect("AB", `${world.at} ${world.uwp}`).toContain(port);
        }
        if (world.bases === "S" || world.bases === "A") {
          scout++;
          expect("ABCD", `${world.at} ${world.uwp}`).toContain(port);
        }
      }
    }
    expect(naval).toBeGreaterThan(0);
    expect(scout).toBeGreaterThan(0);
  });

  it("marks amber only where something is wrong, and red nowhere", () => {
    // SubSectorSpec 3.6.1 and 3.6.4: three things put a world in the running,
    // and red is a referee's decision about their own campaign that nothing in
    // a profile knows.
    let amber = 0;
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.zone).not.toBe("R");
        if (world.zone !== "A") continue;
        amber++;
        const { atmosphere, government, law, population } = world.profile;
        expect(population, world.uwp).toBeGreaterThan(0);
        const wrong =
          atmosphere >= 10 ||
          government === 0 ||
          government === 7 ||
          government === 10 ||
          law === 0 ||
          law >= 9;
        expect(wrong, world.uwp).toBe(true);
      }
    }
    expect(amber).toBeGreaterThan(0);
  });

  it("posts two or three of them in a subsector rather than twenty", () => {
    // SubSectorSpec 3.6.2. Half a subsector qualifies on paper; a subsector where half
    // the hexes carry a warning is a subsector where the warning means nothing.
    const counts = SEEDS.map(
      (seed) =>
        generateSubsector(seed, "A").worlds.filter((world) => world.zone === "A").length,
    );
    const average = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    expect(average).toBeGreaterThan(1.5);
    expect(average).toBeLessThan(3.5);
    // And no subsector is drowning in them, whichever way the dice fell.
    expect(Math.max(...counts)).toBeLessThan(10);
  });

  it("never flags a world nobody lives on", () => {
    // 3.6.1.1: a zone is a warning posted about somewhere people go, and most
    // of a subsector is rock nobody has been to.
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        if (world.profile.population > 0) continue;
        expect(world.zone, world.uwp).toBe("");
      }
    }
  });

  it("names its worlds mostly the way the region names things", () => {
    // SubSectorSpec 3.4.2: a region reads as a region when most of its names
    // sound related, and all of them from one flavour reads as a program.
    const names = subsector.worlds.map((world) => world.name);
    expect(new Set(names).size).toBeGreaterThan(names.length / 2);
    expect(names.every((name) => name !== "")).toBe(true);
  });
});

describe("how far apart two hexes are", () => {
  // SubSectorSpec 3.9.1.1. The columns are offset, so counting rows and columns
  // separately gets it wrong, and a subsector that got this wrong would draw lanes
  // between worlds that cannot reach each other.
  const at = (text: string) => parseSectorHex(text)!;

  it("counts a hex as no distance from itself", () => {
    expect(hexDistance(at("0101"), at("0101"))).toBe(0);
  });

  it("counts every neighbour of a hex as one jump", () => {
    // The six around 0202, which in this layout are the hexes above and below
    // it and the two in each of the columns either side.
    for (const near of ["0201", "0203", "0102", "0103", "0302", "0303"]) {
      expect(hexDistance(at("0202"), at(near)), near).toBe(1);
    }
  });

  it("does not count a step sideways twice", () => {
    // 0403 is two columns across and one row down from 0202, which the offset
    // pays for: two jumps, not three.
    expect(hexDistance(at("0202"), at("0403"))).toBe(2);
    expect(hexDistance(at("0101"), at("0110"))).toBe(9);
  });

  it("does not care which way round it is asked", () => {
    for (const [a, b] of [
      ["0101", "0810"],
      ["0304", "0607"],
      ["0202", "0403"],
    ]) {
      expect(hexDistance(at(a!), at(b!))).toBe(hexDistance(at(b!), at(a!)));
    }
  });
});

describe("the routes", () => {
  const subsectors = SEEDS.map((seed) => generateSubsector(seed, "A"));

  it("runs no route to a world nobody is on", () => {
    // SubSectorSpec 3.9.2: two inhabited worlds, or no route. A rock with a
    // beacon on it is not a destination.
    for (const subsector of subsectors) {
      const empty = new Set(
        subsector.worlds.filter((world) => world.profile.population === 0).map((world) => world.at),
      );
      for (const route of subsector.routes) {
        expect(empty.has(route.from), route.from).toBe(false);
        expect(empty.has(route.to), route.to).toBe(false);
      }
    }
  });

  it("keeps every route inside two jumps", () => {
    // 3.9.2 and 3.9.3: an X-boat leg ends at a port that can service one, and a
    // trader will cross two hexes for a cargo.
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const route of subsector.routes) {
        const far = hexDistance(where.get(route.from)!.hex, where.get(route.to)!.hex);
        expect(far, `${route.from}-${route.to}`).toBeGreaterThan(0);
        expect(far).toBeLessThanOrEqual(2);
      }
    }
  });

  it("runs an X-boat leg only between ports that can service one", () => {
    // 3.9.2.1: a station is a class A or B port. Anywhere else the boat cannot
    // be turned round.
    let legs = 0;
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const route of subsector.routes) {
        if (route.kind !== "xboat") continue;
        legs++;
        for (const at of [route.from, route.to]) {
          expect("AB", `${at} ${where.get(at)!.uwp}`).toContain(where.get(at)!.profile.starport);
        }
      }
    }
    expect(legs).toBeGreaterThan(0);
  });

  it("runs a trade route only where the two worlds want what each other has", () => {
    // 3.9.3.1. Food for the worlds that grow none, manufactures for the worlds
    // that make none, and the run between somewhere rich and somewhere poor.
    const pairs = [
      ["Ag", "Na"],
      ["Ag", "In"],
      ["In", "NI"],
      ["Hi", "Lo"],
      ["Ri", "Po"],
      ["Ht", "Lt"],
    ];
    let runs = 0;
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const route of subsector.routes) {
        if (route.kind !== "trade") continue;
        runs++;
        const from = where.get(route.from)!.trade.map((code) => code.code);
        const to = where.get(route.to)!.trade.map((code) => code.code);
        const wants = pairs.some(
          ([one, other]) =>
            (from.includes(one!) && to.includes(other!)) ||
            (from.includes(other!) && to.includes(one!)),
        );
        expect(wants, `${route.from}-${route.to}`).toBe(true);
      }
    }
    expect(runs).toBeGreaterThan(0);
  });

  it("draws each pair once and never a world to itself", () => {
    for (const subsector of subsectors) {
      const seen = new Set<string>();
      for (const route of subsector.routes) {
        expect(route.from).not.toBe(route.to);
        const key = [route.from, route.to].sort().join("-");
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it("leaves a web rather than a thicket", () => {
    // About one route per world. Enough to follow across a subsector, few
    // enough that the subsector still reads.
    const worlds = subsectors.reduce(
      (count, subsector) => count + subsector.worlds.filter((w) => w.profile.population > 0).length,
      0,
    );
    const lanes = subsectors.reduce((count, subsector) => count + subsector.routes.length, 0);
    expect(lanes / worlds).toBeGreaterThan(0.3);
    expect(lanes / worlds).toBeLessThan(2.5);
  });

  it("takes an interdicted world off the web altogether", () => {
    // 3.9.2.2. Nothing generates a red zone, so this is the referee's edit of
    // 5.3 arriving at the lanes.
    const subsector = generateSubsector("REGINA42", "C", "standard");
    const busy = [...subsector.worlds]
      .filter((world) => world.profile.population > 0)
      .sort((a, b) => b.profile.population - a.profile.population)[0]!;
    expect(subsector.routes.some((route) => route.from === busy.at || route.to === busy.at)).toBe(true);
    const shut = subsector.worlds.map((world) =>
      world.at === busy.at ? { ...world, zone: "R" } : world,
    );
    const after = routesBetween(shut);
    expect(after.some((route) => route.from === busy.at || route.to === busy.at)).toBe(false);
  });
});

describe("the Mains", () => {
  // SubSectorSpec 3.10. A run of worlds every one of which is within one jump
  // of the next, which is the oldest piece of Traveller astrography there is.
  const subsectors = SEEDS.map((seed) => generateSubsector(seed, "A"));

  it("puts every world of a Main within one jump of another on it", () => {
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const main of subsector.mains) {
        for (const at of main.hexes) {
          const here = where.get(at)!;
          const near = main.hexes.some(
            (other) => other !== at && hexDistance(here.hex, where.get(other)!.hex) === 1,
          );
          expect(near, `${at} in the ${main.name} Main`).toBe(true);
        }
      }
    }
  });

  it("puts no world on two Mains", () => {
    // A Main is a connected group, and a world cannot be in two of those.
    for (const subsector of subsectors) {
      const seen = new Set<string>();
      for (const main of subsector.mains) {
        for (const at of main.hexes) {
          expect(seen.has(at), at).toBe(false);
          seen.add(at);
        }
      }
    }
  });

  it("takes in every neighbour there is, so no two Mains touch", () => {
    // 3.10.1: if two groups had a jump-1 step between them they would be one
    // group, so a walk that stopped early would show up here.
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const [at, main] of subsector.mains.entries()) {
        for (const other of subsector.mains.slice(at + 1)) {
          for (const one of main.hexes) {
            for (const two of other.hexes) {
              expect(
                hexDistance(where.get(one)!.hex, where.get(two)!.hex),
                `${one} and ${two}`,
              ).toBeGreaterThan(1);
            }
          }
        }
      }
    }
  });

  it("does not call a pair of worlds a Main", () => {
    // 3.10.2: three in a row is the shortest thing worth the name.
    for (const subsector of subsectors) {
      for (const main of subsector.mains) expect(main.hexes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("names a Main after the busiest world on it", () => {
    // 3.10.3: the one anybody would say they were heading for.
    for (const subsector of subsectors) {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      for (const main of subsector.mains) {
        const most = Math.max(...main.hexes.map((at) => where.get(at)!.profile.population));
        const named = main.hexes.find((at) => where.get(at)!.name === main.name)!;
        expect(where.get(named)!.profile.population, main.name).toBe(most);
      }
    }
  });

  it("finds them at all, and longest first", () => {
    const found = subsectors.filter((subsector) => subsector.mains.length > 0);
    expect(found.length).toBeGreaterThan(subsectors.length / 2);
    for (const subsector of found) {
      const sizes = subsector.mains.map((main) => main.hexes.length);
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    }
  });

  it("counts an empty world as a step along one", () => {
    // 3.10.1.1: a Main is where a ship can go, and an unpopulated world with a
    // gas giant to skim is as much a step along one as a hive world.
    const anyEmpty = subsectors.some((subsector) => {
      const where = new Map(subsector.worlds.map((world) => [world.at, world]));
      return subsector.mains.some((main) =>
        main.hexes.some((at) => where.get(at)!.profile.population === 0),
      );
    });
    expect(anyEmpty).toBe(true);
  });
});

describe("what the worlds are called", () => {
  // SubSectorSpec 3.4.3 and 3.4.4.
  it("never uses one name twice on a subsector", () => {
    for (const seed of SEEDS) {
      const subsector = generateSubsector(seed, "A");
      const names = subsector.worlds.map((world) => world.name);
      expect(new Set(names).size, seed).toBe(names.length);
    }
  });

  it("does not name a world after a numbered camp", () => {
    // A world drawing from eight functional words had forty of them sharing
    // eight names, and the same four turned up in every subsector of a sector.
    for (const seed of SEEDS) {
      for (const world of generateSubsector(seed, "A").worlds) {
        expect(world.name, seed).not.toMatch(
          /^(Site|Station|Camp|Depot|Hub|Works|Post|Sector) (One|Two|Three)$/,
        );
      }
    }
  });

  it("keeps a subsector's names whether or not a sector is above it", () => {
    // AppSpec 1.3: naming is the subsector's, so a subsector cannot be renamed from
    // above without the same subsector being two different subsectors.
    const alone = generateSubsector("SPINWARD-C", "C");
    const again = generateSubsector("SPINWARD-C", "C");
    expect(alone.worlds.map((w) => w.name)).toEqual(again.worlds.map((w) => w.name));
  });

  it("leaves nearly every world in a sector with a name of its own", () => {
    // Across sixteen subsectors a repeat is chance rather than a rule, and with the
    // pools of 3.4.3 it stays under one world in twenty.
    const sector = generateSector("SPINWARD", "standard");
    const counts = new Map<string, number>();
    for (const world of sector.worlds) counts.set(world.name, (counts.get(world.name) ?? 0) + 1);
    const shared = [...counts.values()].filter((n) => n > 1).reduce((sum, n) => sum + n, 0);
    expect(shared / sector.worlds.length).toBeLessThan(0.12);
  });
});

describe("the sector file", () => {
  it("writes a line a sector map can read for every world", () => {
    const subsector = generateSubsector("REGINA42", "C", "standard");
    const file = subsectorFile(subsector, "Spinward Marches");
    const lines = file.split("\n").filter((line) => line !== "" && !line.startsWith("#"));
    expect(lines[0]).toBe("Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars");
    expect(lines).toHaveLength(subsector.worlds.length + 1);
    for (const [at, world] of subsector.worlds.entries()) {
      const fields = lines[at + 1]!.split("\t");
      expect(fields).toHaveLength(9);
      expect(fields[0]).toBe(world.at);
      expect(fields[1]).toBe(world.name);
      expect(fields[2]).toBe(world.uwp);
      expect(fields[3]).toBe(world.bases);
      expect(fields[5]).toBe(world.zone);
      // The three columns a single planet had to leave blank. SubSectorSpec 6.1.1.
      expect(fields[6]).toMatch(/^\d{3}$/);
      expect(fields[7]).toBe("Na");
      expect(fields[8]).not.toBe("");
    }
  });

  it("says what it is above the lines", () => {
    const file = subsectorFile(generateSubsector("VLAND7QX", "G"), "Vland");
    expect(file).toMatch(/^# Subsector G of Vland/);
    expect(file).toContain("# Seed: VLAND7QX");
  });
});
