import "./style.css";
import { buildGrid, cellCount, EMPTY_GRID, nearestCell, type Grid } from "./grid/grid";
import {
  asLatticeRef,
  buildRefIndex,
  DETAIL_LEVELS,
  EMPTY_REFS,
  formatLattice,
  formatRef,
  latticeKey,
  latticeRefPosition,
  REFERENCE_SIZE,
  SPHERE_SIZE,
  type LatticeRef,
  type RefCoord,
  type RefIndex,
} from "./grid/coord";
import { heightsOn } from "./gen/height";
import {
  craterList,
  craterOptionsFor,
  MAX_CRATERS,
  NO_CRATERS,
  rolledCraterCount,
  saturationOf,
  type CraterField,
} from "./gen/crater";
import { isIced, type IceCaps } from "./gen/ice";
import { DEFAULT_FIELD_OPTIONS, type HeightFieldOptions } from "./gen/field";
import { blankPlanet, newPlanet, parseUwp, randomSeed, rollUwp, type Planet } from "./planet";
import { starportSite } from "./gen/site";
import {
  MAX_SETTLEMENTS,
  populationNote,
  populationShares,
  settlementCount,
  settlementNames,
  settlementSites,
} from "./gen/settle";
import {
  poiAt,
  poiPlacements,
  poiPosition,
  markKind,
  comparePois,
  putPoi,
  removePoi,
  cities,
  starportName,
  starports,
  type Poi,
  type PoiKind,
} from "./poi";
import { formatSectorHex, parseSectorHex, subsectorLetter } from "./location";
import { planetDetail, type PlanetDetail } from "./gen/detail";
import {
  isRetrograde,
  isTidallyLocked,
  orbitalPeriodHours,
  orbitForTemperature,
  orbitLimitsFor,
  SUN_LUMINOSITY,
  type ClimateOverrides,
} from "./gen/climate";
import { describeUwp } from "./gen/describe";
import { createHexMap, type PoiMark } from "./ui/map";
import { createGlobe } from "./ui/globe";
import { createLocalView } from "./ui/local";
import {
  DEFAULT_SEA_LEVEL,
  normalise,
  terrainBand,
  type Shader,
  type ViewMode,
} from "./ui/colour";
import { DEFAULT_VERDANCY } from "./gen/life";
import { biomeAt, biomeWorldFor, type BiomeWorld } from "./gen/biome";
import { orbitalShader } from "./ui/orbital";
import {
  download,
  isSupported,
  loadFolder,
  load,
  loadFromInput,
  PickerCancelled,
  pickFolder,
  LEVEL_SUFFIX,
  planetFile,
  saveName,
  saveTo,
  stemFor,
  zipSave,
  type DirectoryHandle,
  type SaveFile,
} from "./io/files";
import { nextFrame, renderMaps } from "./io/images";
import { EXPORT_FORMATS, manifest, type ExportContext } from "./io/export";
import { shaderFor, surfaceOn } from "./surface";
import { currentAppView, landingSay, setAppView, wireLanding } from "./ui/landing";
import { auLabel, contentLabel, createOrbitDiagram } from "./ui/orbits";
import {
  parseStar,
  starLabel,
  starsFor,
  SPECTRAL_CLASSES,
  STAR_SIZES,
} from "./gen/star";
import { createOrbitMap } from "./ui/orbitmap";
import { createChart } from "./ui/chart";
import { createSectorMap } from "./ui/sectormap";
import { APP_VERSION, RELEASE_NOTES, suggestionLink } from "./version";
import { letterAt, SECTOR_HEXES, type Sector } from "./gen/sector";
import {
  keepSubsector,
  newSectorDoc,
  parseSectorDoc,
  savedSubsector,
  sectorOf,
  subsectorIn,
  type SectorDoc,
} from "./sector";
import { createCrumbs, type Level, type Trail } from "./ui/crumbs";
import {
  generateSubsector,
  systemSeedFor,
  type ChartWorld,
  type Density,
  type Subsector,
} from "./gen/subsector";
import { sectorFile, subsectorFile } from "./io/export/subsector";
import {
  chartSvg,
  subsectorCsv,
  subsectorSheetHtml,
  subsectorSheetMarkdown,
} from "./io/export/chart";
import { svgToPng } from "./io/export/raster";
import {
  newSubsectorDoc,
  overrideFor as hexOverride,
  parseSubsectorDoc,
  setOverride as setHexOverride,
  setPresence,
  setSystemSeed,
  SHIFT_LIMIT,
  subsectorOf as chartOf,
  dropSystem,
  keepSystem,
  savedSystem,
  type HexField,
  type SubsectorDoc,
} from "./subsector";
import { SUBSECTOR_LETTERS } from "./location";
import { liveGlobe, worldImage } from "./ui/worldimage";
import { giantImage } from "./ui/giant";
import { basesLabel, zoneLabel } from "./gen/base";
import { crossingLabel, hoursAt1g, jumpShadowKm, kmLabel } from "./gen/jump";
import {
  auToKm,
  clearOfShadows,
  crossing,
  type ShadowBody,
} from "./gen/travel";
import {
  beltName,
  generateSystem,
  moonKey,
  moonsOf,
  namesOf,
  ordinalOf,
  worldName,
  positionAu,
  starShadowAu,
  worldIn,
  worldSettings,
  worldsOf,
  type Orbit,
  type StarSystem,
  type SystemNames,
} from "./gen/system";
import {
  keepWorld,
  newSystemDoc,
  overrideFor,
  parseSystemDoc,
  savedWorld,
  setOverride,
  subsectorOf,
  systemOf,
  type SystemDoc,
} from "./system";
import { starsLabel } from "./gen/star";
import { formatPbg, tradeCodes } from "./gen/trade";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

interface State {
  planet: Planet;
  grid: Grid;
  /** Reference coordinates for the current grid. Spec 2.4. */
  refs: RefIndex;
  heights: Float64Array;
  /** Read off the hydrographics digit, not a constant. Spec 5.2. */
  seaLevel: number;
  /** Kilometres across, for the scale bars. Null when the UWP cannot be read. */
  diameterKm: number | null;
  /** What the UWP made of the height field. Spec 3.4. */
  options: HeightFieldOptions;
  /** The impacts laid over that field, which every panel reads. Spec 3.6. */
  craters: CraterField;
  /** How green the land is drawn, from bare rock to an Earth. Spec 5.6. */
  verdancy: number;
  /** What the ground is made of, place by place. Spec 5.8. */
  biome: BiomeWorld;
  /** Which of the two views of 5.7 the three panels are drawing. */
  view: ViewMode;
  /** That view, as the function the panels colour a hex with. */
  shade: Shader;
  /** Polar ice, or null on a planet the profile does not cap. Spec 5.4. */
  caps: IceCaps | null;
  /** Whether the map draws the ground without its hex seams. A view option. Spec 4.3.7.1. */
  smooth: boolean;
  /** Whether the globe draws the world under its weather. Spec 5.10.6. */
  sky: boolean;
  /** Whether the local panel draws contour lines. A view option, so not saved. Spec 4.5.8. */
  contours: boolean;
  /** Whether the local panel draws the patch in relief. Also a view option. Spec 4.5.9. */
  isometric: boolean;
  selected: number | null;
  /**
   * The hex under the pointer on the map, which the local panels follow in
   * preference to the selection. Not a selection: it survives nothing, and
   * leaving the map hands the panels back to the selected hex. Spec 4.5.
   */
  hovered: number | null;
  /**
   * The selection by name rather than by index, so it survives a rebuild. Held
   * even at a level that cannot draw it, which is what lets it come back. Spec 2.4.7.
   */
  selectedRef: RefCoord | null;
  /**
   * The POIs on each display hex, worked out once per redraw rather than per hex,
   * since everything that asks about a hex asks by CellId. A list rather than
   * one: a POI sits on a hex of the lattice it was placed on, and a display hex
   * covers many of those. Spec 6.6.3.
   */
  poisByCell: Map<number, Poi[]>;
  /** The folder the open planet is saved into, once one has been chosen. Spec 6.4.1. */
  folder: DirectoryHandle | null;
  dirty: boolean;
}

const map = createHexMap();
el("map-panel").append(map.element);

const globe = createGlobe();
el("globe-panel").append(globe.element);

/**
 * The globe's own grid: a fixed level of its own, whatever the map is drawing.
 * Spec 4.4.9. Not the finest level, for the reason SPHERE_SIZE gives - a sphere
 * a few hundred pixels across cannot show it, and its mesh is rebuilt at every
 * redraw.
 *
 * Built once and kept, since it is the same grid for every world. It costs a
 * noticeable moment to build and nothing about it depends on the planet, so
 * building it per redraw would be paying that over and over for one answer. Not
 * built at all where the map is already at that level: then it is the map's own
 * grid, and the two panels share the one.
 */
let sphere: Grid | null = null;
function globeGrid(): Grid {
  if (state.planet.size === SPHERE_SIZE) return state.grid;
  if (sphere === null) sphere = buildGrid(SPHERE_SIZE);
  return sphere;
}

const local = createLocalView();
el("local-view").append(local.element);

/** The view a session opens in. Spec 5.7.1.3: the world as it looks. */
const DEFAULT_VIEW: ViewMode = "orbital";

/**
 * The state the window holds, starting empty.
 *
 * Nothing here is generated: the application opens on the landing page of
 * AppSpec 2, where no planet has been chosen, and AppSpec 2.5 has a user who
 * opens it and closes it again roll nothing. The planet is blank, the grid has
 * no cells, and there are no heights. Opening a planet under AppSpec 3.1 or 3.2
 * fills all three in through regenerate, which is what fills them in whenever
 * the detail level changes as well.
 */
const state: State = (() => {
  const planet = blankPlanet();
  const biome = biomeWorldFor("", planetDetail(planet.seed, planet.uwp));
  return {
    planet,
    grid: EMPTY_GRID,
    refs: EMPTY_REFS,
    heights: new Float64Array(0),
    seaLevel: DEFAULT_SEA_LEVEL,
    diameterKm: null,
    options: DEFAULT_FIELD_OPTIONS,
    craters: NO_CRATERS,
    verdancy: DEFAULT_VERDANCY,
    biome,
    view: DEFAULT_VIEW,
    // Replaced by the first resurface, which has a real world to read. Built from
    // the same view the session opens in so that nothing is ever drawn in one and
    // described as the other.
    shade: orbitalShader(DEFAULT_SEA_LEVEL, biome),
    caps: null,
    smooth: false,
    sky: true,
    contours: false,
    isometric: false,
    selected: null,
    hovered: null,
    selectedRef: null,
    poisByCell: new Map(),
    folder: null,
    dirty: false,
  };
})();

/**
 * Rebuild the grid and everything on it. Called when the detail level changes.
 * Spec 4.2.4.
 *
 * The selection is carried across by coordinate rather than by CellId, which is
 * an index into the grid being thrown away. Spec 2.4.1: the same hex keeps its
 * name at every level it appears at, so selecting a hex and then coarsening the
 * map keeps the selection wherever the coarser level still draws that hex.
 */
function regenerate(): void {
  state.grid = buildGrid(state.planet.size);
  state.refs = buildRefIndex(state.grid);
  state.hovered = null;
  state.selected = state.selectedRef === null ? null : cellForRef(state.selectedRef);
  resurface();
}

/**
 * The hex the current grid draws a coordinate on. Spec 2.4.7.
 *
 * A coarse level draws a fraction of the hexes a fine one does, so most of the
 * time the named hex is simply not there. It is still ground, though, and the
 * coarse level is drawing that ground in some hex of its own: the selection moves
 * to whichever hex covers the place, rather than going out.
 *
 * The name is not overwritten with the coarse hex's own. It is kept exactly as the
 * user picked it, so going back up the slider lands on the hex they chose and not
 * on the middle of the one that stood in for it.
 */
function cellForRef(ref: RefCoord): number | null {
  const here = state.refs.at(ref);
  if (here !== null) return here;
  return nearestCell(state.grid, latticeRefPosition(asLatticeRef(ref)));
}

/**
 * Rebuild the surface from the seed and the UWP, keeping the grid. Spec 3.4 and
 * 5.2: the UWP shapes the terrain and sets the coastline, so editing a digit
 * redraws the world without rebuilding the hexes underneath it.
 */
function resurface(): void {
  const detail = currentDetail();
  // The same builder the saved images of 6.4.5 go through, so what is written
  // out is the world that was on screen rather than one worked out twice.
  const surface = surfaceOn(state.planet, detail, state.grid);
  state.options = surface.options;
  state.craters = surface.craters;
  state.heights = surface.heights;
  state.seaLevel = surface.seaLevel;
  state.diameterKm = surface.diameterKm;
  state.caps = surface.caps;
  state.verdancy = surface.verdancy;
  state.biome = surface.biome;
  state.shade = shaderFor(surface, state.view);
  map.render(state.grid, state.heights, state.diameterKm, state.caps, state.shade);
  // The finest grid the application has, read off the field the surface was just
  // sampled from rather than off one built again for it. Where the map is already
  // at that level this is the map's own grid and heights, untouched. Spec 4.4.9.1.
  const shown = globeGrid();
  globe.render(
    shown,
    shown === state.grid ? state.heights : heightsOn(surface.field, shown, surface.craters),
    state.diameterKm,
    state.caps,
    state.shade,
    surface.clouds,
    detail.axialTiltDeg,
  );
  showSelection(state.selected);
  showPois();
}

function markDirty(): void {
  state.dirty = true;
  // A world of a system says nothing about being unsaved: the level that saves
  // it says it. AppSpec 4.1.2.
  el("dirty").hidden = planetParent === "system";
  if (planetParent === "system") markSystemDirty();
}

function markClean(): void {
  state.dirty = false;
  el("dirty").hidden = true;
}

function say(message: string, isError = false): void {
  const node = el("status");
  node.textContent = message;
  node.classList.toggle("error", isError);
}

// Spec 6.4.4.2: New, Load and leaving the page all check first.
function confirmDiscard(action: string): boolean {
  if (!state.dirty) return true;
  const name = state.planet.name || "this planet";
  return window.confirm(`${name} has unsaved changes. ${action} and lose them?`);
}

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

/* Planet fields ---------------------------------------------------------- */

const fields = {
  name: el<HTMLInputElement>("p-name"),
  sector: el<HTMLInputElement>("p-sector"),
  hex: el<HTMLInputElement>("p-hex"),
  uwp: el<HTMLInputElement>("p-uwp"),
  seed: el<HTMLInputElement>("p-seed"),
  size: el<HTMLInputElement>("p-size"),
  tilt: el<HTMLInputElement>("p-tilt"),
  rotation: el<HTMLInputElement>("p-rotation"),
  orbit: el<HTMLInputElement>("p-orbit"),
  temp: el<HTMLInputElement>("p-temp"),
  craters: el<HTMLInputElement>("p-craters"),
  starClass: el<HTMLSelectElement>("p-star-class"),
  starSize: el<HTMLSelectElement>("p-star-size"),
  narrative: el<HTMLTextAreaElement>("p-narrative"),
};

/**
 * What the user has overruled, in the form the model takes. Spec 6.15.3: a null
 * is not a value of zero, it is the absence of a decision, so the rolled figure
 * stands wherever one of these is null.
 */
function overrides(): ClimateOverrides {
  return {
    obliquityDeg: state.planet.tiltDeg,
    orbitAu: state.planet.orbitAu,
    luminosity: state.planet.luminosity,
    rotationHours: state.planet.rotationHours,
  };
}

/** The detail values for the planet as it currently stands. */
function currentDetail(): PlanetDetail {
  return planetDetail(state.planet.seed, state.planet.uwp, overrides());
}

function showPlanet(): void {
  fields.name.value = state.planet.name;
  fields.sector.value = state.planet.sector;
  fields.hex.value = state.planet.hex;
  showSubsector();
  fields.uwp.value = state.planet.uwp;
  fields.seed.value = state.planet.seed;
  fields.size.value = String(Math.max(0, DETAIL_LEVELS.indexOf(state.planet.size as never)));
  fields.narrative.value = state.planet.narrative;
  showDetailLevel();
  showWorld(currentDetail());
  showDetail();
  document.title = `${state.planet.name || "Unnamed"} — PlanetHex`;
  // The trail says the world's own name, so it is redrawn whenever the panel is.
  showCrumbs();
}

/** What the slider is set to, in the terms the user cares about. Spec 2.2.2. */
function showDetailLevel(): void {
  el("cell-count").textContent =
    `${state.planet.size} rows, ${cellCount(state.planet.size)} hexes`;
}

/**
 * The detail values and the description. Both are read off the seed and the UWP
 * every time rather than stored, so they cannot drift from the fields above them.
 * Spec 6.12 and 6.13.
 */
/**
 * The four world settings. Shown as numbers the user can type over, with the two
 * that need a second unit to be read carrying a note under them. Spec 6.15.
 *
 * Every field is filled from the model rather than from what was typed, so an
 * orbit moved by hand shows the temperature it actually implies rather than the
 * one that was there before.
 */
function showWorld(detail: PlanetDetail): void {
  const set = (input: HTMLInputElement, value: number, places: number, overruled: boolean) => {
    // Left alone while the field has focus, or a value would be rewritten under
    // the user part way through typing it.
    if (document.activeElement !== input) input.value = value.toFixed(places);
    input.classList.toggle("overridden", overruled);
  };
  set(fields.tilt, detail.axialTiltDeg, 1, state.planet.tiltDeg !== null);
  set(fields.rotation, detail.rotationHours, 1, state.planet.rotationHours !== null);
  set(fields.orbit, detail.orbitAu, 2, state.planet.orbitAu !== null);
  set(fields.temp, detail.meanTempK - 273.15, 0, state.planet.orbitAu !== null);
  showCraters(detail);
  showStar();

  const days = detail.rotationHours / 24;
  el("rotation-note").textContent = [
    days >= 2 ? `${days.toFixed(1)} days long` : "",
    isTidallyLocked(detail.rotationHours, detail.orbitAu, detail.climate.luminosity)
      ? "locked to its year"
      : "",
    isRetrograde(detail.axialTiltDeg) ? "turning backwards" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const year = orbitalPeriodHours(detail.orbitAu, detail.climate.luminosity) / (24 * 365.25);
  el("orbit-note").textContent = `year of ${year < 1 ? `${(year * 12).toFixed(1)} months` : `${year.toFixed(1)} years`}`;
}

/** The crater options the planet as it stands asks for. Spec 6.15.12. */
function craterOptions(detail: PlanetDetail) {
  return craterOptionsFor(state.planet.seed, detail, state.planet.uwp, state.planet.craters);
}

/** How many impacts the surface carries, once the ceiling has had its say. */
function craterCountOf(detail: PlanetDetail): number {
  return craterOptions(detail).count;
}

/**
 * How much of the surface those impacts have taken, in words.
 *
 * The count on its own does not say what a world looks like, since a thousand
 * small craters and a thousand large ones are different surfaces. The share of the
 * ground inside a rim does say it, and once that passes one the world is saturated
 * and further impacts land on older ones rather than on open ground.
 */
function craterCover(detail: PlanetDetail): string {
  const cover = saturationOf(craterList(state.planet.seed, craterOptions(detail)));
  if (cover >= 1) return "saturated";
  if (cover >= 0.5) return "heavily cratered";
  if (cover >= 0.15) return "well cratered";
  return "a scattering";
}

/**
 * The crater count and what it comes to. Shown with the world settings rather than
 * with the detail values of 6.12, because it is a figure the seed rolled and the
 * referee may overrule, which is what 6.15 is.
 */
function showCraters(detail: PlanetDetail): void {
  const count = craterCountOf(detail);
  if (document.activeElement !== fields.craters) fields.craters.value = String(count);
  fields.craters.classList.toggle("overridden", state.planet.craters !== null);
  const rolled = rolledCraterCount(state.planet.seed, detail, state.planet.uwp);
  el("crater-note").textContent = [
    count === 0 ? "none left" : craterCover(detail),
    // What the seed gives, so a referee who has typed over it can see what they
    // moved away from and how far. Nothing to say when nobody has moved it.
    state.planet.craters === null ? "" : `seed rolls ${rolled.toLocaleString("en-GB")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function showDetail(): void {
  const detail = currentDetail();
  showWorld(detail);
  const list = el("planet-detail");
  list.replaceChildren(
    ...detail.rows.map((row) => {
      const wrap = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.text;
      if (row.exact !== undefined) value.title = row.exact;
      wrap.append(term, value);
      return wrap;
    }),
  );
  el("p-description").textContent =
    describeUwp(state.planet.uwp, detail) ?? "That is not a readable UWP.";
}

/**
 * Which of the sixteen the hex falls in, worked out from the hex rather than
 * typed. Spec 6.14.2. An entry that is not a square on the chart says so here,
 * where the field is, rather than in the status line at the top of the panel.
 *
 * An empty field says nothing at all. The placeholder shows the shape of a hex,
 * and anyone filling this in either knows the convention or is not reading a
 * line of instructions to find out.
 */
function showSubsector(): void {
  const hint = el("subsector");
  const typed = state.planet.hex.trim();
  const hex = parseSectorHex(typed);
  hint.hidden = typed === "";
  hint.textContent =
    hex !== null ? `subsector ${subsectorLetter(hex)}` : typed === "" ? "" : "not a hex in a sector";
  hint.classList.toggle("error", hex === null && typed !== "");
}

for (const key of ["name", "sector", "uwp", "narrative"] as const) {
  fields[key].addEventListener("input", () => {
    state.planet[key] = fields[key].value;
    if (key === "name") document.title = `${state.planet.name || "Unnamed"} — PlanetHex`;
    if (key === "uwp") {
      showDetail();
      resurface();
      // After the surface, so the sites are chosen on the ground the new profile
      // makes rather than on the ground the old one made. Spec 6.24.10.
      resettleIfStale();
    }
    markDirty();
  });
}

fields.hex.addEventListener("input", () => {
  state.planet.hex = fields.hex.value;
  showSubsector();
  markDirty();
});

// Tidied once the user has finished with the field, so a hex typed as two pairs
// is stored as the four digits a save should carry. An entry that is not a square
// on the chart is left exactly as typed: 6.14.1 says so beside the field, and
// rewriting it under the user would lose what they were part way through typing.
fields.hex.addEventListener("change", () => {
  const hex = parseSectorHex(fields.hex.value);
  if (hex === null) return;
  state.planet.hex = formatSectorHex(hex);
  fields.hex.value = state.planet.hex;
  showSubsector();
});

fields.seed.addEventListener("change", () => {
  const seed = fields.seed.value.trim();
  if (seed === "" || seed === state.planet.seed) {
    fields.seed.value = state.planet.seed;
    return;
  }
  state.planet.seed = seed;
  showDetail();
  markDirty();
  regenerate();
  // New ground under them, and new names for them. Spec 6.24.10.1.
  resettleIfStale();
  say(`Regenerated from seed ${seed}.`);
});

fields.size.addEventListener("input", () => {
  // The slider runs over positions in DETAIL_LEVELS rather than over row counts,
  // so it cannot land between two levels and there is nothing to validate.
  const size = DETAIL_LEVELS[Number(fields.size.value)] ?? state.planet.size;
  if (size === state.planet.size) return;
  state.planet.size = size;
  showDetailLevel();
  markDirty();
  regenerate();
  say(`Detail ${size}: ${state.grid.cells.length} hexes. Same world, seen finer or coarser.`);
});

/* World settings. Spec 6.15.3 ------------------------------------------- */

/**
 * Takes an edited setting. An empty field is not a value of zero: it is the user
 * withdrawing their decision, which hands the setting back to the roll.
 */
function setWorld(
  input: HTMLInputElement,
  apply: (value: number | null) => void,
  message: (detail: PlanetDetail) => string,
): void {
  const typed = input.value.trim();
  const value = typed === "" ? null : Number(typed);
  if (value !== null && !Number.isFinite(value)) {
    showWorld(currentDetail());
    return;
  }
  apply(value);
  const detail = currentDetail();
  showWorld(detail);
  showDetail();
  resurface();
  markDirty();
  say(message(detail));
}

fields.tilt.addEventListener("change", () => {
  setWorld(
    fields.tilt,
    (v) => {
      state.planet.tiltDeg = v === null ? null : Math.min(180, Math.max(0, v));
    },
    (d) => `Axis at ${d.axialTiltDeg.toFixed(1)}°.`,
  );
});

fields.rotation.addEventListener("change", () => {
  setWorld(
    fields.rotation,
    (v) => {
      state.planet.rotationHours = v === null ? null : Math.max(0.1, v);
    },
    (d) => `A day of ${d.rotationHours.toFixed(1)} hours.`,
  );
});

fields.orbit.addEventListener("change", () => {
  setWorld(
    fields.orbit,
    (v) => {
      // The range a world can be put in moves out with the star it is put
      // around: fifty AU from a supergiant is inside the fire.
      const limits = orbitLimitsFor(currentDetail().climate.luminosity);
      state.planet.orbitAu =
        v === null ? null : Math.min(limits.far, Math.max(limits.near, v));
    },
    (d) => `${d.orbitAu.toFixed(2)} AU out, mean ${(d.meanTempK - 273.15).toFixed(0)}°C.`,
  );
});

// Temperature is not stored. It is what the orbit implies, so a temperature typed
// in is answered by moving the world to where it would be that warm. Spec 6.15.2:
// the two fields are one number seen twice, and this is the direction that keeps
// them from ever disagreeing.
fields.temp.addEventListener("change", () => {
  setWorld(
    fields.temp,
    (v) => {
      if (v === null) {
        state.planet.orbitAu = null;
        return;
      }
      const { climate } = currentDetail();
      state.planet.orbitAu = orbitForTemperature(
        v + 273.15,
        climate.albedo,
        climate.greenhouseK,
        climate.luminosity,
      );
    },
    (d) => `Mean ${(d.meanTempK - 273.15).toFixed(0)}°C, which puts it ${d.orbitAu.toFixed(2)} AU out.`,
  );
});

fields.craters.addEventListener("change", () => {
  setWorld(
    fields.craters,
    (v) => {
      state.planet.craters =
        v === null ? null : Math.min(MAX_CRATERS, Math.max(0, Math.round(v)));
    },
    (d) => {
      const count = craterCountOf(d);
      return count === 0
        ? "Nothing left of the impact record."
        : `${count.toLocaleString("en-GB")} impacts, ${craterCover(d)}.`;
    },
  );
});

el("reset-world").addEventListener("click", (event) => {
  // The button sits in the section's summary, and a click on a summary folds the
  // section. Resetting the world is not a request to put it away.
  event.preventDefault();
  event.stopPropagation();
  state.planet.tiltDeg = null;
  state.planet.orbitAu = null;
  state.planet.rotationHours = null;
  state.planet.craters = null;
  showWorld(currentDetail());
  showDetail();
  resurface();
  markDirty();
  say("World settings back to what the seed and the profile give.");
});

// Spec 6.5.8.5: a roll is a different kind of world on the same seed, so the
// port and the cities are placed again on the ground the new profile makes.
// Resurfacing comes first, since the sites are read off the heights and the sea
// level that profile produces rather than off the ones it replaced.
el("roll-uwp").addEventListener("click", () => {
  state.planet.uwp = rollUwp(state.planet.seed + ":" + Date.now());
  fields.uwp.value = state.planet.uwp;
  showDetail();
  resurface();
  // A roll is a different world on the same seed, so everything the profile puts
  // on the ground is put there again: the port of 6.5.8 and the cities of 6.24,
  // by the one rule in 6.24.10 rather than by a second one of its own.
  resettleIfStale();
  markDirty();
  const port = starports(state.planet.pois)[0];
  if (port === undefined) {
    say(`Rolled ${state.planet.uwp}, which gives the world no starport, so it has none.`);
  } else {
    const towns = cities(state.planet.pois).length;
    const also = towns === 0 ? "" : ` and ${towns} ${towns === 1 ? "city" : "cities"}`;
    say(`Rolled ${state.planet.uwp}. ${port.name} on ${formatLattice(port.ref)}${also}.`);
  }
});

/* Hex properties --------------------------------------------------------- */

function showHex(id: number | null): void {
  const readout = el("hex-props");
  // With nothing selected the local panel says so itself, so an overlay of
  // dashes over the top of it would only repeat that at greater length.
  readout.hidden = id === null;
  if (id === null) return;
  const cell = state.grid.cells[id]!;
  const height = state.heights[id]!;
  const [x, y, z] = cell.centre;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = (Math.atan2(z, x) * 180) / Math.PI;
  el("h-id").textContent = formatRef(state.refs.of[id]!);
  el("h-height").textContent = height.toFixed(3);
  const iced = isIced(state.caps, cell.centre[1]);
  el("h-band").textContent = terrainBand(height, state.seaLevel, iced);
  // What the ground is, beside how high it is. Two questions, two answers. Spec 5.8.2.
  el("h-ground").textContent = biomeAt(
    state.biome,
    normalise(height, state.seaLevel),
    cell.centre[1],
    iced,
  );
  el("h-sides").textContent = cell.isPentagon ? "5 (vertex hex)" : "6";
  el("h-latlon").textContent = `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
  // Every one the hex covers, named, for the reason 4.3.5.1 gives for the
  // tooltip: a count says something is there and not what.
  const here = state.poisByCell.get(id) ?? [];
  el("h-poi-row").hidden = here.length === 0;
  el("h-poi").replaceChildren(
    ...here.map((poi) => {
      const line = document.createElement("span");
      line.className = `poi-line poi-${poi.kind}`;
      line.textContent = poiTitle(poi);
      return line;
    }),
  );
}

/**
 * A hex the user picked. The name is kept as well as the index, so a rebuild at
 * another detail level can find the hex again. Spec 2.4.7.
 */
function select(cell: number | null): void {
  state.selectedRef = cell === null ? null : (state.refs.of[cell] ?? null);
  showSelection(cell);
}

/**
 * One selection, shown in all three panels. Spec 4.1.3 and 4.4.4. Takes the index
 * as given and leaves the held name alone, so a level that cannot draw the hex
 * shows nothing selected without forgetting which hex it was.
 */
function showSelection(cell: number | null): void {
  state.selected = cell;
  map.setSelected(cell);
  // By its corners rather than by its index: the globe is drawing a different grid
  // under 4.4.9 and has no index to be given. The hex marked is still the display
  // hex, which is the hex the user selected. Spec 4.4.9.2.
  globe.setSelected(cell === null ? null : (state.grid.cells[cell]?.corners ?? null));
  showFocus();
}

/**
 * The hex the local panels describe: whatever the pointer is over, and the
 * selection when it is over nothing. Reading it this way rather than writing the
 * hover into the selection is what lets the pointer wander over the map and hand
 * the panels back untouched.
 */
function showFocus(): void {
  const cell = state.hovered ?? state.selected;
  local.render({
    grid: state.grid,
    pois: state.planet.pois,
    selected: cell,
    seed: state.planet.seed,
    options: state.options,
    craters: state.craters,
    seaLevel: state.seaLevel,
    diameterKm: state.diameterKm,
    caps: state.caps,
    shade: state.shade,
    contours: state.contours,
    isometric: state.isometric,
  });
  showHex(cell);
  showTip(state.hovered);
}

// Smooth is a width rather than a shape, so the map that is already drawn answers
// to it and nothing is built again. Spec 4.3.7.1.
el<HTMLInputElement>("p-smooth").addEventListener("change", (event) => {
  state.smooth = (event.target as HTMLInputElement).checked;
  map.setSmooth(state.smooth);
});

// The view of 5.7 is about the drawing rather than about the world, so it neither
// resurfaces the planet nor marks it unsaved. All three panels read it, so all
// three are redrawn.
const VIEW_NOTES: Readonly<Record<ViewMode, string>> = {
  orbital: "As it looks: green where things grow, brown desert, grey rock, white ice.",
  survey: "As it measures: blue sea, ground, grey and white peaks by height.",
};

function showView(): void {
  el<HTMLSelectElement>("p-view").value = state.view;
  el("view-note").textContent = VIEW_NOTES[state.view];
}

el<HTMLSelectElement>("p-view").addEventListener("change", (event) => {
  state.view = (event.target as HTMLSelectElement).value === "survey" ? "survey" : "orbital";
  showView();
  resurface();
});
showView();

// The two view options redraw the one panel they change, and nothing else: they
// say nothing about the world, so they neither resurface it nor mark it unsaved.
// The sky is already built, so this only decides whether it is on the world. The
// globe is not rebuilt for it, as the seams of 4.3.7.1 do not rebuild the map.
el<HTMLInputElement>("p-clouds").addEventListener("change", (event) => {
  state.sky = (event.target as HTMLInputElement).checked;
  globe.setClouds(state.sky);
});

el<HTMLInputElement>("show-contours").addEventListener("change", (event) => {
  state.contours = (event.target as HTMLInputElement).checked;
  showFocus();
});

el<HTMLInputElement>("show-3d").addEventListener("change", (event) => {
  state.isometric = (event.target as HTMLInputElement).checked;
  // The lines are the flat view's, under 4.5.9.6, so while the panel is in relief
  // the switch for them is turned off rather than left offering something it
  // would not do. Its setting is kept, and comes back with the flat view.
  el<HTMLInputElement>("show-contours").disabled = state.isometric;
  showFocus();
});

map.onSelect(select);
// The globe answers with the point of the sphere the click landed on, since it is
// drawing hexes of its own that the other panels know nothing about. The hex
// selected is the display hex covering that point. Spec 4.4.9.2.
globe.onSelect((at) => select(nearestCell(state.grid, at)));

map.onHover((cell) => {
  state.hovered = cell;
  showFocus();
});

/* Points of interest. Spec 5.5 and 6.5 ---------------------------------- */

const poiFields = {
  dialog: el<HTMLDialogElement>("poi-dialog"),
  form: el<HTMLFormElement>("poi-form"),
  title: el("poi-dialog-title"),
  hex: el("poi-dialog-hex"),
  name: el<HTMLInputElement>("poi-name"),
  narrative: el<HTMLTextAreaElement>("poi-narrative"),
  note: el("poi-dialog-note"),
  remove: el<HTMLButtonElement>("poi-delete"),
  cancel: el<HTMLButtonElement>("poi-cancel"),
  move: el("poi-move"),
  movePick: el<HTMLSelectElement>("poi-move-pick"),
  moveGo: el<HTMLButtonElement>("poi-move-go"),
};

/** The hex the open dialogue is about. Null while it is shut. */
let editing: LatticeRef | null = null;

const KIND_LABEL: Record<PoiKind, string> = {
  starport: "Starport",
  city: "City",
  comment: "Comment",
};

/**
 * What a point of interest says when it is pointed at. Spec 4.3.5.1.
 *
 * The same three things the map's tooltip gives, in the plain text a title
 * attribute takes: what it is called, what kind it is, and whatever has been
 * written about it. A count says something is there and not what, and that is as
 * true of the list as it is of the map.
 */
function poiTooltip(poi: Poi): string {
  const lines = [poiTitle(poi), KIND_LABEL[poi.kind]];
  if (poi.narrative.trim() !== "") lines.push("", poi.narrative.trim());
  return lines.join("\n");
}

function poiTitle(poi: Poi): string {
  return poi.name.trim() === "" ? KIND_LABEL[poi.kind] : poi.name;
}

/**
 * The POIs, everywhere they are shown at once: placed on the display grid, marked
 * on the map and the globe, and listed on the left panel. The patch draws them
 * itself, on its own hexes, since those are the hexes they sit on. Spec 6.6.1.
 */
function showPois(): void {
  const placements = poiPlacements(state.grid, state.planet.pois);
  state.poisByCell = new Map();
  for (const { poi, cell } of placements) {
    const here = state.poisByCell.get(cell);
    if (here) here.push(poi);
    else state.poisByCell.set(cell, [poi]);
  }

  // One mark to a hex, whatever it covers, ranked by 5.5.5.
  const marks: PoiMark[] = [...state.poisByCell].map(([cell, here]) => ({
    cell,
    kind: markKind(here),
  }));
  map.setPois(marks);
  globe.setPois(
    marks.flatMap(({ cell, kind }) => {
      const corners = state.grid.cells[cell]?.corners;
      return corners === undefined ? [] : [{ corners, kind }];
    }),
  );

  const list = el("poi-list");
  list.replaceChildren(
    // Starports first, then cities largest first, then comments. Spec 6.5.7.1.
    ...[...placements]
      .sort((a, b) => comparePois(a.poi, b.poi, poiTitle))
      .map(({ poi, cell }) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = `poi-entry poi-${poi.kind}`;
        button.title = poiTooltip(poi);
        button.textContent = poiTitle(poi);
        // Goes to it rather than opening it. Spec 6.5.7.2: the list is how a
        // referee finds a place on the world, and finding it means looking at it.
        // The dialogue is opened from the patch, where the hex it is about is.
        button.addEventListener("click", () => select(cell));
        item.append(button);
        return item;
      }),
  );
}

/**
 * The starport a new world starts with. Spec 6.5.8.
 *
 * The profile already says a world has a starport, so a new planet arriving with
 * nothing on it is the application knowing something and drawing none of it. The
 * site is read off the terrain by 6.5.8.1, and everything about it can be edited
 * or deleted afterwards like anything the user placed by hand.
 *
 * A world whose profile says X has no starport to place, and an unreadable UWP
 * says nothing either way, so neither gets one.
 */
function placeStarport(written: Written = {}): void {
  const uwp = parseUwp(state.planet.uwp);
  if (uwp === null || uwp.starport === "X") return;
  const ref = starportRef();
  if (ref === null) return;
  state.planet.pois = putPoi(state.planet.pois, {
    kind: "starport",
    // The class is the profile's under 6.5.8.5, so it is written again unless the
    // user has given the port a name of their own.
    name: written.name ?? starportName(uwp.starport),
    narrative: written.narrative ?? "",
    ref,
  });
  showPois();
}

/**
 * The digits a world's settlements depend on, and nothing else. Spec 6.24.10.1.
 *
 * Five of the eight bear on where people are. The starport letter says whether
 * there is a port and what it is called; size shapes the ground and sets the
 * scale; atmosphere and hydrographics decide what grows and where the coast is,
 * which is what habitability is read off; and population says how many
 * settlements there are and how large. Government, law level and tech level say
 * nothing about any of it, so typing one of those leaves the map alone.
 *
 * The seed is in the signature too. It is not part of the profile, but it decides
 * the ground the sites are chosen on and the names they are given, so a world with
 * a new seed is a world to be settled again.
 *
 * An unreadable profile gives an empty signature, which never matches and never
 * fires: half a UWP is typed on the way to a whole one, and a redraw at every
 * keystroke would be the application arguing with the person editing. Spec 6.5.8.5.3
 * settled that question once already.
 */
function settlementSignature(): string {
  const uwp = parseUwp(state.planet.uwp);
  if (uwp === null) return "";
  return [
    state.planet.seed,
    uwp.starport,
    uwp.size,
    uwp.atmosphere,
    uwp.hydrographics,
    uwp.population,
  ].join("|");
}

/** The signature the settlements on the world were placed for. */
let settled = "";

/** Take the world as settled, without touching it. For New, and for a load. */
function markSettled(): void {
  settled = settlementSignature();
}

/**
 * Settle the world again where a digit that bears on it has moved. Spec 6.24.10.
 *
 * Called after the surface has been rebuilt, since the sites are chosen off the
 * heights and the sea level the new profile produced rather than the old ones.
 */
function resettleIfStale(): void {
  const now = settlementSignature();
  if (now === "" || now === settled) return;
  settled = now;
  resettle();
}

/**
 * What the user has written on a world's settlements, by rank, so a resettle can
 * give it back. Spec 6.24.10.2.
 *
 * A value counts as the user's where it is not what the generator would have
 * produced. That is checkable rather than guessable: the names of 6.24.6 depend on
 * the seed and the rank, which a change of profile does not move, and the line of
 * 6.24.4 is a function of the size that was recorded beside it.
 */
interface Written {
  readonly name?: string;
  readonly narrative?: string;
}

function writtenByRank(): Written[] {
  const generated = settlementNames(state.planet.seed, MAX_SETTLEMENTS);
  const existing = state.planet.pois
    .filter((poi) => poi.kind === "starport" || poi.kind === "city")
    .sort((a, b) => (b.population ?? -1) - (a.population ?? -1));

  return existing.map((poi, rank) => {
    const wasNamed =
      poi.name === generated[rank] || /^Starport [A-EX]$/.test(poi.name) || poi.name === "";
    const wasWritten =
      poi.narrative === "" ||
      (poi.population !== undefined && poi.narrative === populationNote(poi.population));
    return {
      ...(wasNamed ? {} : { name: poi.name }),
      ...(wasWritten ? {} : { narrative: poi.narrative }),
    };
  });
}

/**
 * Place the world's starport and cities again, keeping what the user wrote.
 * Spec 6.24.10.
 *
 * Comments are left alone: they are notes about the world rather than settlements
 * of it, and nothing in a profile bears on them.
 */
function resettle(): void {
  const written = writtenByRank();
  state.planet.pois = state.planet.pois.filter((poi) => poi.kind === "comment");
  placeStarport(written[0]);
  placeCities(written);
}

/**
 * The cities a world carries. Spec 6.24.
 *
 * The profile says how many people a world holds, and until now the map drew none
 * of that. One settlement per point of the population digit, the starport counting
 * as the first of them under 6.24.1, so the cities placed here are that count less
 * whatever port is already standing.
 *
 * Each carries its own share of the settled population in its narrative, by the
 * rank-size rule of 6.24.3. They are ordinary points of interest once placed: move
 * them, rename them, write them up, or delete them.
 */
function placeCities(written: readonly Written[] = []): void {
  const detail = currentDetail();
  const uwp = parseUwp(state.planet.uwp);
  if (uwp === null) return;
  const wanted = settlementCount(uwp.population);
  if (wanted === 0) return;

  // The starport is the first city, so it takes the first site and the first
  // share, and the rest are placed around it. A world whose profile gives it no
  // port has all of them to place.
  const port = starports(state.planet.pois)[0] ?? null;
  const taken =
    port === null ? [] : [nearestCell(state.grid, poiPosition(port.ref))].filter(isCell);
  const sites = settlementSites(
    state.grid,
    state.heights,
    state.seaLevel,
    state.biome,
    state.caps,
    wanted - taken.length,
    taken,
  );
  const shares = populationShares(wanted, detail.population ?? 0);
  // One voice per world under 6.24.6, so the names are drawn together.
  const names = settlementNames(state.planet.seed, wanted);

  let pois = state.planet.pois;
  // The port is rank one, so it takes shares[0] and the cities follow it.
  if (port !== null && shares[0] !== undefined) {
    pois = putPoi(pois, {
      ...port,
      narrative: written[0]?.narrative ?? populationNote(shares[0]),
      population: shares[0],
    });
  }
  sites.forEach((cell, i) => {
    const ref = state.refs.of[cell];
    if (!ref) return;
    const rank = taken.length + i;
    pois = putPoi(pois, {
      kind: "city",
      name: written[rank]?.name ?? names[rank] ?? "",
      narrative: written[rank]?.narrative ?? populationNote(shares[rank] ?? 0),
      population: shares[rank] ?? 0,
      ref: asLatticeRef(ref),
    });
  });
  state.planet.pois = pois;
  showPois();
}

const isCell = (id: number | null): id is number => id !== null;

/**
 * Where the terrain now puts a starport, or null where it has nowhere to put
 * one. Read off the surface in hand, so it answers for the world on screen
 * rather than for the one the site was first chosen on. Spec 6.5.8.1.
 */
function starportRef(): LatticeRef | null {
  const site = starportSite(state.grid, state.heights, state.seaLevel);
  const ref = site === null ? null : state.refs.of[site.cell];
  return ref ? asLatticeRef(ref) : null;
}

/**
 * Opens the dialogue on a point, filled in if a POI already sits on it.
 *
 * The point is a hex of whatever lattice the click came from: a fine hex of the
 * patch, or the hex a list entry names. One POI to a point under 6.5.3, so what
 * is there is edited where it is rather than a second one being made on top.
 */
function openPoi(ref: LatticeRef): void {
  const existing = poiAt(state.planet.pois, ref);
  editing = ref;
  poiFields.title.textContent = existing === null ? "New point of interest" : "Point of interest";
  poiFields.hex.textContent = formatLattice(ref);
  for (const radio of kindRadios()) {
    radio.checked = radio.value === (existing?.kind ?? "comment");
  }
  poiFields.name.value = existing?.name ?? "";
  poiFields.narrative.value = existing?.narrative ?? "";
  poiFields.remove.hidden = existing === null;
  showMoveHere(existing);
  // Said only where the hex it sits on is finer than the map draws, since where
  // the map has the hex itself there is nothing here the coordinate above does
  // not already say.
  const covered = ref.size > state.planet.size;
  poiFields.note.hidden = !covered;
  poiFields.note.textContent = covered
    ? `A hex of the local panel, finer than the map draws. The map marks the hex covering it.`
    : "";
  poiFields.dialog.showModal();
  poiFields.name.focus();
}

/**
 * The move control. Spec 6.5.9: a point of interest is placed by clicking, so
 * the way to move one is to click where it should go and say which one goes
 * there. Offered only where the point is empty, since a point already holding
 * one has nowhere for a second to land under 6.5.3, and only where there is
 * something to move.
 */
function showMoveHere(existing: Poi | null): void {
  const movable = existing === null ? state.planet.pois : [];
  poiFields.move.hidden = movable.length === 0;
  poiFields.movePick.replaceChildren(
    ...[...movable]
      .sort((a, b) => poiTitle(a).localeCompare(poiTitle(b)))
      .map((poi) => {
        const option = document.createElement("option");
        option.value = latticeKey(poi.ref);
        option.textContent = `${poiTitle(poi)} — ${KIND_LABEL[poi.kind]} on ${formatLattice(poi.ref)}`;
        return option;
      }),
  );
}

// Moving keeps what the point of interest is and changes only where it is, so
// the name, the kind, and the narrative come across untouched.
poiFields.moveGo.addEventListener("click", () => {
  const to = editing;
  const key = poiFields.movePick.value;
  const moving = state.planet.pois.find((poi) => latticeKey(poi.ref) === key);
  if (to === null || moving === undefined) return;
  state.planet.pois = putPoi(removePoi(state.planet.pois, moving.ref), { ...moving, ref: to });
  editing = null;
  poiFields.dialog.close();
  showPois();
  showFocus();
  markDirty();
  say(`Moved ${poiTitle(moving)} to ${formatLattice(to)}.`);
});

function kindRadios(): HTMLInputElement[] {
  return [...poiFields.form.querySelectorAll<HTMLInputElement>('input[name="poi-kind"]')];
}

function chosenKind(): PoiKind {
  return (kindRadios().find((radio) => radio.checked)?.value as PoiKind | undefined) ?? "comment";
}

// The form's own submit, so Enter in a field saves as the button does.
poiFields.form.addEventListener("submit", (event) => {
  if (editing === null) return;
  event.preventDefault();
  // The size of 6.24.3 is not on the form and is not the user's to type, so it
  // comes across from whatever was on this point rather than being dropped by an
  // edit to the name. Spec 6.5.9.3 carries the narrative the same way.
  const was = poiAt(state.planet.pois, editing);
  const poi: Poi = {
    kind: chosenKind(),
    name: poiFields.name.value,
    narrative: poiFields.narrative.value,
    ...(was?.population === undefined ? {} : { population: was.population }),
    ref: editing,
  };
  state.planet.pois = putPoi(state.planet.pois, poi);
  editing = null;
  poiFields.dialog.close();
  showPois();
  showFocus();
  markDirty();
  say(`${KIND_LABEL[poi.kind]} ${poiTitle(poi)} on ${formatLattice(poi.ref)}.`);
});

poiFields.remove.addEventListener("click", () => {
  if (editing === null) return;
  const gone = poiAt(state.planet.pois, editing);
  state.planet.pois = removePoi(state.planet.pois, editing);
  const where = formatLattice(editing);
  editing = null;
  poiFields.dialog.close();
  showPois();
  showFocus();
  markDirty();
  say(gone === null ? `Nothing on ${where}.` : `Dropped ${poiTitle(gone)} from ${where}.`);
});

poiFields.cancel.addEventListener("click", () => {
  editing = null;
  poiFields.dialog.close();
});

poiFields.dialog.addEventListener("close", () => {
  editing = null;
});

// Spec 4.5.7: the patch is where a POI is placed, since it is the panel drawn at
// the scale a place on the ground is at.
local.onPick((pick) => {
  if (pick.cell !== null) select(pick.cell);
  // The point of interest drawn on that hex, where there is one, rather than the
  // hex's own name. Spec 4.5.7.2: a POI holds the name of the lattice it was
  // placed on and the patch is drawn on a finer one, so the two names differ for
  // the same ground and opening by name made a second POI on top of the first.
  openPoi(pick.poi?.ref ?? pick.ref);
});

/* The tooltip of 4.3.4 ---------------------------------------------------- */

const tip = el("poi-tip");

/**
 * What the hovered hex holds, all of it. Spec 4.3.5: a display hex covers dozens
 * of the hexes points of interest sit on, so it can hold several, and naming one
 * and counting the rest tells the user something is there without saying what.
 */
function showTip(cell: number | null): void {
  const here = cell === null ? [] : (state.poisByCell.get(cell) ?? []);
  tip.hidden = here.length === 0;
  if (here.length === 0) return;
  tip.replaceChildren(
    ...here.map((poi) => {
      const entry = document.createElement("div");
      entry.className = `poi-tip-entry poi-${poi.kind}`;
      const name = document.createElement("strong");
      name.textContent = poiTitle(poi);
      const kind = document.createElement("span");
      kind.className = "poi-tip-kind";
      kind.textContent = KIND_LABEL[poi.kind];
      entry.append(name, kind);
      if (poi.narrative.trim() !== "") {
        const narrative = document.createElement("p");
        narrative.textContent = poi.narrative;
        entry.append(narrative);
      }
      return entry;
    }),
  );
}

// Follows the pointer rather than sitting in a corner, so it reads as belonging
// to the hex under it. Kept inside the panel at the right and bottom edges,
// where a tooltip hung off the pointer would otherwise be half off the map.
map.element.addEventListener("pointermove", (event) => {
  if (tip.hidden) return;
  const panel = el("map-panel").getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const x = event.clientX - panel.left + 14;
  const y = event.clientY - panel.top + 14;
  tip.style.left = `${Math.min(x, panel.width - box.width - 6)}px`;
  tip.style.top = `${Math.min(y, panel.height - box.height - 6)}px`;
});

/* Panels ----------------------------------------------------------------- */

/**
 * Collapse the left panel to a rail. Spec 4.2.6. The map and globe follow on
 * their own: the SVG panels are sized by their viewBox and the globe watches its
 * own element for a resize.
 */
el("toggle-left").addEventListener("click", () => {
  const layout = document.querySelector(".layout")!;
  const collapsed = layout.classList.toggle("left-collapsed");
  const button = el("toggle-left");
  button.setAttribute("aria-expanded", String(!collapsed));
  button.title = collapsed ? "Expand the panel" : "Collapse the panel";
});

/* The star a world orbits. PlanetSpec 6.15.13 -------------------------- */

// The Sun's own line, for a world nobody has given a star to. Every world
// generated before systems existed was assumed to have one.
const SUN_LABEL = "G2 V";

for (const [box, values] of [
  [fields.starClass, SPECTRAL_CLASSES],
  [fields.starSize, STAR_SIZES],
] as const) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    box.append(option);
  }
}

/** What the fields say, as a label a document can hold. */
function starFromFields(): string {
  return `${fields.starClass.value}2 ${fields.starSize.value}`;
}

/**
 * Show the star, and say whether it can be changed here.
 *
 * A world of a system orbits that system's primary, and the system is where a
 * star is chosen: two places to set it would be two answers to one question.
 * A world on its own has nobody to tell it, so it says so itself.
 */
function showStar(): void {
  const label = state.planet.star ?? SUN_LABEL;
  const star = parseStar(label) ?? parseStar(SUN_LABEL)!;
  fields.starClass.value = star.spectral;
  fields.starSize.value = star.size;
  const own = planetParent !== "system";
  fields.starClass.disabled = !own;
  fields.starSize.disabled = !own;
  const times = (state.planet.luminosity ?? SUN_LUMINOSITY) / SUN_LUMINOSITY;
  const brightness =
    times >= 10 ? `${Math.round(times)}×` : times >= 0.1 ? `${times.toFixed(2)}×` : times.toPrecision(2);
  el("star-note").textContent =
    `${starLabel(star)}, ${brightness} the Sun's output` +
    (own ? "" : " — its system's, and set there");
}

for (const box of [fields.starClass, fields.starSize]) {
  box.addEventListener("change", () => {
    const star = parseStar(starFromFields());
    if (star === null) return;
    state.planet.star = starLabel(star);
    // The luminosity is what the climate reads; the label is what the referee
    // reads. Both are written, because both are asked for.
    state.planet.luminosity = star.luminosity;
    // A different star is a different climate, so every figure worked out from
    // one is worked out again: where the world sits, how warm that leaves it,
    // and the surface itself.
    const detail = currentDetail();
    showWorld(detail);
    showDetail();
    resurface();
    markDirty();
    say(`${starLabel(star)}: ${detail.orbitAu.toFixed(2)} AU for the same climate.`);
  });
}

/* Buttons ---------------------------------------------------------------- */

function startNewPlanet(): void {
  setPlanetParent("landing");
  Object.assign(state.planet, newPlanet());
  state.folder = null;
  state.selected = null;
  state.hovered = null;
  state.selectedRef = null;
  setAppView("planet");
  showPlanet();
  regenerate();
  placeStarport();
  placeCities();
  markSettled();
  // Spec 4.4.5.2 and 4.3.6.2: the globe's size says how big this world is, which
  // a camera left zoomed in on the last one would contradict, and a map left
  // zoomed in on a corner of it opens the new world showing a corner.
  map.resetView();
  globe.resetView();
  markClean();
  say(`New planet, seed ${state.planet.seed}.${saveRoute()}`);
}

el("new").addEventListener("click", () => {
  if (!confirmDiscard("Start a new planet")) return;
  startNewPlanet();
});

/* Saving. Spec 6.4.1 and 6.23 ------------------------------------------- */

const saveDialog = el<HTMLDialogElement>("save-dialog");

/**
 * What the last save wrote, so the next one offers the same again. Spec 6.23.4.
 *
 * Kept in local storage rather than in the planet, because this is about the user
 * and not about the world: somebody who wants GeoJSON wants it for every world
 * they draw, and a planet handed to somebody else should not arrive telling them
 * what to export. A browser that refuses storage loses nothing but the memory.
 */
const CHOICE_KEY = "planethex.save.choices";

interface SaveChoices {
  /** Detail levels to write the map picture at, as row counts. Spec 6.4.5. */
  readonly levels: number[];
  /** Ids of the export formats of 6.17 that are ticked. */
  readonly formats: string[];
}

function defaultChoices(): SaveChoices {
  return {
    // Every level, which is what a save wrote before there was anything to
    // choose. The dialogue is there to take some away, not to start with less
    // than a save used to give.
    levels: [...DETAIL_LEVELS],
    formats: EXPORT_FORMATS.filter((format) => format.byDefault).map((format) => format.id),
  };
}

function readChoices(): SaveChoices {
  const fallback = defaultChoices();
  try {
    const raw = window.localStorage.getItem(CHOICE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveChoices>;
    // A list that has been emptied is a choice and is kept; one that is missing
    // or is not a list at all is a browser with nothing stored, which is the
    // default rather than a save of nothing. Anything in it that this build does
    // not recognise is dropped, so a level or a format that goes away later
    // cannot come back as a tick with nothing behind it.
    return {
      levels: Array.isArray(parsed.levels)
        ? parsed.levels.filter((level) => DETAIL_LEVELS.includes(level as never))
        : fallback.levels,
      formats: Array.isArray(parsed.formats)
        ? parsed.formats.filter((id) => EXPORT_FORMATS.some((format) => format.id === id))
        : fallback.formats,
    };
  } catch {
    return fallback;
  }
}

function writeChoices(choices: SaveChoices): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(choices));
  } catch {
    // Storage refused, which costs the memory of the choice and nothing else.
  }
}

/** A checkbox with its label and a line under it saying who would want it. */
function saveOption(label: string, note: string): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "save-option";
  const box = document.createElement("input");
  box.type = "checkbox";
  const text = document.createElement("span");
  const title = document.createElement("span");
  title.className = "save-option-label";
  title.textContent = label;
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = note;
  text.append(title, hint);
  wrap.append(box, text);
  return wrap;
}

const levelBoxes = new Map<number, HTMLInputElement>();
const formatBoxes = new Map<string, HTMLInputElement>();

// Built from the ladder of 2.2.2 and the formats of 6.17 rather than written out
// in the document, so adding either adds a line to the dialogue and nothing else.
(function buildSaveDialog(): void {
  const levels = el("save-levels");
  for (const size of DETAIL_LEVELS) {
    const option = saveOption(
      `${cellCount(size).toLocaleString("en-GB")} hexes`,
      `${size} rows to a face${size === REFERENCE_SIZE ? ", the finest the application draws" : ""}`,
    );
    levels.append(option);
    levelBoxes.set(size, option.querySelector("input")!);
  }

  const formats = el("save-formats");
  for (const format of EXPORT_FORMATS) {
    const option = saveOption(format.label, format.note);
    formats.append(option);
    formatBoxes.set(format.id, option.querySelector("input")!);
  }

  for (const box of allBoxes()) box.addEventListener("change", showSaveSummary);
})();

function allBoxes(): HTMLInputElement[] {
  return [...levelBoxes.values(), ...formatBoxes.values()];
}

function chosen(): SaveChoices {
  return {
    levels: [...levelBoxes].filter(([, box]) => box.checked).map(([size]) => size),
    formats: [...formatBoxes].filter(([, box]) => box.checked).map(([id]) => id),
  };
}

/**
 * What the ticked boxes add up to, said while the ticks are still the user's to
 * change. Spec 6.23.5: the finest level is tens of seconds on its own, and the
 * moment to know that is before the drawing starts rather than during it.
 */
function showSaveSummary(): void {
  const choices = chosen();
  const wanted = EXPORT_FORMATS.filter((format) => choices.formats.includes(format.id));
  // The planet's JSON, a picture per level, whatever each format writes, and the
  // manifest of 6.22 where anything at all was exported.
  const count =
    1 +
    choices.levels.length +
    wanted.reduce((total, format) => total + format.files, 0) +
    (wanted.length > 0 ? 1 : 0);
  const slow =
    choices.levels.filter((size) => size >= SLOW_LEVEL).length +
    (choices.formats.includes("plate") ? 1 : 0);
  el("save-summary").textContent =
    `${count} ${count === 1 ? "file" : "files"}. The planet's own JSON is always one of them.` +
    (slow > 0 ? " The finest levels and the plate take a few seconds each." : "");
}

/** The level at which drawing a map stops being instant. Spec 6.4.5.3. */
const SLOW_LEVEL = 48;

function openSaveDialog(): void {
  const choices = readChoices();
  for (const [size, box] of levelBoxes) box.checked = choices.levels.includes(size);
  for (const [id, box] of formatBoxes) box.checked = choices.formats.includes(id);
  el("save-where").textContent = state.folder
    ? `Into ${state.folder.name}, over whatever this planet last wrote there.`
    : isSupported()
      ? "You will be asked for the folder to save into."
      : `This browser saves as one download: ${saveName(state.planet)}, holding the lot.`;
  showSaveSummary();
  if (!saveDialog.open) saveDialog.showModal();
}

el("save").addEventListener("click", () => {
  if (!el<HTMLButtonElement>("save").disabled) openSaveDialog();
});
el("save-cancel").addEventListener("click", () => saveDialog.close());

el("save-all").addEventListener("click", () => {
  for (const box of allBoxes()) box.checked = true;
  showSaveSummary();
});

el("save-none").addEventListener("click", () => {
  for (const box of allBoxes()) box.checked = false;
  showSaveSummary();
});

// The form's own submit, so Enter anywhere in the dialogue saves as the button
// does. The dialogue is closed before the work starts: the folder picker below
// needs this click as its gesture, and a modal left up while the maps draw hides
// the one line saying how far along they are.
el<HTMLFormElement>("save-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const choices = chosen();
  writeChoices(choices);
  saveDialog.close();
  void runSave(choices);
});

async function runSave(choices: SaveChoices): Promise<void> {
  const save = el<HTMLButtonElement>("save");
  if (save.disabled) return;
  try {
    // The folder is asked for while the click is still the gesture in hand.
    // Drawing the maps below takes seconds, and the picker will not open on a
    // gesture that has gone stale by the time it is reached. A browser with no
    // picker has nothing to ask for and goes straight to drawing.
    const folder = isSupported() ? (state.folder ?? (await pickFolder())) : null;
    const into = folder?.name ?? saveName(state.planet);
    // The finest level is 92,162 hexes and there may be five levels to draw. The
    // button goes down so a second click cannot start it all again underneath.
    save.disabled = true;
    say(`Saving to ${into}...`);
    const files = await gather(choices, into);
    if (folder) {
      await saveTo(folder, files);
      state.folder = folder;
    } else {
      // A download cannot be rewritten in place, so state.folder stays null and
      // the next Save is another file rather than the same one again.
      download(await zipSave(files), into);
    }
    markClean();
    say(`Saved to ${into}: ${files.length} ${files.length === 1 ? "file" : "files"}.`);
  } catch (error) {
    if (error instanceof PickerCancelled) {
      say("");
      return;
    }
    say(error instanceof Error ? error.message : String(error), true);
  } finally {
    save.disabled = false;
  }
}

/**
 * Everything the save is to write. The planet first, then a picture per level,
 * then whatever the formats of 6.17 make of the world, and the manifest of 6.22
 * last, since it lists what came before it.
 */
async function gather(choices: SaveChoices, into: string): Promise<SaveFile[]> {
  const stem = stemFor(state.planet);
  const files: SaveFile[] = [planetFile(state.planet)];

  const images = await renderMaps(
    state.planet,
    currentDetail(),
    state.smooth,
    state.view,
    choices.levels,
    (size) => say(`Drawing the ${size} row map for ${into}...`),
  );
  for (const [size, png] of images) files.push({ name: `${stem}-${size}.png`, data: png });

  const wanted = EXPORT_FORMATS.filter((format) => choices.formats.includes(format.id));
  if (wanted.length === 0) return files;

  // Every export describes the level on screen rather than the levels the
  // pictures were drawn at. A hex table of a level nobody is looking at is a
  // table of a map nobody has, and the reader has the map in front of them.
  const context: ExportContext = {
    planet: state.planet,
    detail: currentDetail(),
    size: state.planet.size,
    smooth: state.smooth,
    view: state.view,
    say,
  };
  for (const format of wanted) {
    say(`Writing the ${format.label} for ${into}...`);
    await nextFrame();
    for (const file of await format.produce(context)) {
      files.push({ name: `${stem}${file.suffix}`, data: file.data });
    }
  }
  files.push({
    name: `${stem}-export.json`,
    data: manifest(
      context,
      files.map((file) => file.name),
    ),
  });
  return files;
}

async function loadPlanet(): Promise<void> {
  try {
    const { planet, name } = isSupported() ? await load() : await loadFromInput();
    Object.assign(state.planet, planet);
    // A file handle cannot name the folder it came from, so the next Save asks
    // where this planet belongs rather than guessing at the folder it was
    // opened from. Spec 6.4.1.4.
    state.folder = null;
    state.selected = null;
    state.hovered = null;
    state.selectedRef = null;
    showPlanet();
    regenerate();
    // What the file carries is what the world has. A save is a world somebody
    // arranged, so it is taken as already settled and 6.24.10 leaves it alone.
    markSettled();
    map.resetView();
    globe.resetView();
    markClean();
    setPlanetParent("landing");
    setAppView("planet");
    say(`Loaded ${name}.${saveRoute()}`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    const message = error instanceof Error ? error.message : String(error);
    // Where the user is standing is where the failure has to be reported. A
    // load that failed on the way in from the landing page has not opened
    // anything, so the planet panel's status line is not on screen to read.
    if (currentAppView() === "landing") landingSay(message, true);
    else say(message, true);
  }
}

el("load").addEventListener("click", () => {
  if (!confirmDiscard("Load another planet")) return;
  void loadPlanet();
});

/* Help. Spec 4.8 --------------------------------------------------------- */

// The text and the licence are in index.html rather than fetched, so opening
// the help cannot fail. All that is left is showing it. Spec 4.8.5.
const helpDialog = el<HTMLDialogElement>("help-dialog");

function openHelp(): void {
  if (!helpDialog.open) helpDialog.showModal();
}

el("help").addEventListener("click", openHelp);
el("landing-help").addEventListener("click", openHelp);

/* What this is, and how to say something about it. AppSpec 2.6 ----------- */

for (const id of ["landing-version", "help-version"]) {
  el(id).textContent = `v${APP_VERSION}`;
}
for (const id of ["landing-notes", "help-notes"]) {
  el<HTMLAnchorElement>(id).href = RELEASE_NOTES;
}
/**
 * The suggestion link carries whatever is open, since a report that says which
 * seed it was is a report that can be reproduced, and nobody remembers to
 * include it. Rebuilt on every click rather than once, because what is open
 * changes and a link written at startup would always say the landing page.
 */
for (const id of ["landing-suggest", "help-suggest"]) {
  el(id).addEventListener("click", () => {
    el<HTMLAnchorElement>(id).href = suggestionLink(whatIsOpen());
  });
}

function whatIsOpen(): { level?: string; seed?: string } {
  const view = currentAppView();
  if (view === "sector") return { level: "sector", seed: sectorDoc?.seed };
  if (view === "subsector") return { level: "subsector", seed: subDoc?.seed };
  if (view === "system") return { level: "system", seed: doc?.seed };
  if (view === "planet") return { level: "planet", seed: state.planet.seed };
  return {};
}
el("help-close").addEventListener("click", () => helpDialog.close());
el("help-done").addEventListener("click", () => helpDialog.close());

/** Whether the keyboard is in a field, where every key is text being typed. */
function typing(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

// F1 is where a Windows user reaches for help, and the packaged build is a
// Windows application. In a browser tab Chrome keeps F1 for its own help and
// will not give it up, so ? is offered as well, which nothing else claims.
// Escape closes the dialogue, which a modal one does by itself.
window.addEventListener("keydown", (event) => {
  const asked = event.key === "F1" || (event.key === "?" && !typing(event.target));
  if (!asked || event.ctrlKey || event.altKey || event.metaKey) return;
  // Not over another dialogue. Help on top of the save dialogue would bury the
  // choices the user is in the middle of making, and Escape would then shut the
  // wrong one.
  if (saveDialog.open || poiFields.dialog.open) return;
  event.preventDefault();
  if (helpDialog.open) helpDialog.close();
  else openHelp();
});

/* The landing page. AppSpec 2 and 3 -------------------------------------- */

/**
 * Not an error on either path: a browser without the File System Access API
 * saves as a download rather than writing back into the folder it came from.
 * Spec 6.4.1. Said once, when a planet opens, since that is when it matters.
 */
function saveRoute(): string {
  return isSupported() ? "" : " This browser saves as a zip download.";
}

/**
 * Where the button at the head of the planet panel goes back to. AppSpec 6.2: a
 * move down keeps the parent open, so a world reached through a system goes back
 * to that system rather than out to the landing page, and the button says so.
 */
let planetParent: "landing" | "system" = "landing";

function setPlanetParent(parent: "landing" | "system"): void {
  planetParent = parent;
  // A world of a system is saved by that system, which is saved by its chart.
  // Three Save buttons down one chain is three ways to write the same work to
  // three different places. AppSpec 4.1.2.
  el("save").hidden = parent === "system";
  el("dirty").hidden = parent === "system" || !state.dirty;
  openLevels.planet = true;
  if (parent === "landing") {
    openLevels.system = false;
    openLevels.subsector = false;
  }
  el("home").textContent = parent === "system" ? "System" : "Levels";
  el("home").title = parent === "system" ? "Back to the system" : "Back to the levels";
}

// AppSpec 2.4 and 7.2: what is open is closed, and what is unsaved is asked
// about first.
el("home").addEventListener("click", () => {
  // Going up to the system that holds this world loses nothing: the world goes
  // with it, and the system is saved with the chart above. Nothing to warn
  // about, so nothing is asked. Only leaving the levels altogether can lose
  // work, and only then if it was never saved.
  if (planetParent === "system" && system !== null) {
    keepPlanetForSystem();
    refreshSystem();
    setAppView("system");
    return;
  }
  if (!confirmDiscard("Leave this planet")) return;
  setAppView("landing");
  landingSay("");
});


/* The system view. SystemSpec section 8 ---------------------------------- */

// Read only: the diagram draws a system and the panel says what an orbit holds.
// Editing and saving are SystemSpec 9, and the Load row on the landing page
// stays dark until there is a format to load.

const orbits = createOrbitDiagram();
el("sys-diagram").append(orbits.element);
const model = createOrbitMap();
el("sys-model").append(model.element);

/**
 * How big a world is drawn, once, for both the diagram and the panel.
 *
 * One size rather than two, because a world costs as much to draw as to open and
 * drawing the same world twice at two sizes is paying that twice. This is the
 * size the panel wants; the diagram scales it down, which is what a browser is
 * good at.
 */
const GLOBE_PX = 256;

/**
 * The worlds still waiting to be drawn, and the frame that is drawing them.
 *
 * A world costs about as much to draw as to open: the height field of the planet
 * spec 3.5 is built to the depth the finest level needs whatever size it is
 * being shown at, since a shallower field would be a different world. So the
 * diagram goes up at once with discs on it and the worlds arrive one a frame,
 * which keeps a roll instant and lets the user click while they land.
 */
let pending: { system: StarSystem; orbits: number[] } | null = null;

function drawWorldsSoon(open: StarSystem): void {
  pending = { system: open, orbits: worldsOf(open).map((world) => world.orbitIndex) };
  // A timer rather than a frame, because a frame never comes to a window nobody
  // is looking at, and a system opened behind another window should be drawn by
  // the time it is looked at.
  setTimeout(drawNextWorld, 0);
}

function drawNextWorld(): void {
  if (pending === null) return;
  const next = pending.orbits.shift();
  // A roll or a load while these are in flight moves on to the new system, and
  // the pictures for the old one are dropped rather than drawn into nothing.
  if (next === undefined || pending.system !== system) {
    pending = null;
    return;
  }
  const png = pictureOf(pending.system, next);
  if (png !== null) {
    orbits.setPicture(next, png);
    model.setPicture(next, png);
  }
  setTimeout(drawNextWorld, 0);
}

/**
 * The picture of whatever world is in an orbit, or null where there is no world
 * in it. The settings the system wrote go in with the seed, so the world in the
 * picture is the world that opens. SystemSpec 6.6.3.
 */
function pictureOf(open: StarSystem, orbitIndex: number): string | null {
  const orbit = open.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined || orbit.content.kind !== "world") return null;
  return worldImage(
    {
      seed: orbit.content.seed,
      uwp: orbit.content.uwp,
      ...worldSettings(open, orbitIndex),
    },
    GLOBE_PX,
  );
}

/**
 * The open system: the document that would be saved, the system it describes,
 * and which orbit the panel is about.
 *
 * Two of them rather than one because they are two different things. The
 * document is the seed and what the user wrote; the system is what that
 * generates, rebuilt whenever the document changes. SystemSpec 9.2.
 */
let doc: SystemDoc | null = null;
let system: StarSystem | null = null;
/**
 * Which body the right-hand panel is about: an orbit, and a moon within it
 * where the user picked one out of the tree or the moon list.
 */
let orbitShown: number | null = null;
let moonShown: number | null = null;
/** The folder this system was loaded from or last saved into. AppSpec 3.3.2. */
let systemFolder: DirectoryHandle | null = null;
let systemDirty = false;

function markSystemDirty(): void {
  systemDirty = true;
  // A system under a chart says nothing about being unsaved: the chart says it,
  // and the chart is what saves it.
  el("sys-dirty").hidden = systemParent === "subsector";
  if (systemParent === "subsector") markSubDirty();
}

function markSystemClean(): void {
  systemDirty = false;
  el("sys-dirty").hidden = true;
}

/** What the header says about the system as a whole. SystemSpec 8.6. */
function showHeader(): void {
  if (doc === null || system === null) return;
  const letter = subsectorOf(doc);
  const place = [
    doc.sector.trim(),
    letter === "" ? "" : `${doc.hex.trim()} (subsector ${letter})`,
  ].filter(Boolean);
  el("sys-stars").textContent = starsLabel(system.stars);
  // SystemSpec 4.2.1 where the two counts disagree: the chart's figures are the
  // chart's, and what would not fit is said rather than quietly dropped.
  const short =
    system.placed.belts === system.pbg.belts && system.placed.gasGiants === system.pbg.gasGiants
      ? ""
      : ` (room for ${system.placed.belts} and ${system.placed.gasGiants})`;
  el("sys-counts").textContent = [`seed ${doc.seed}`, `PBG ${formatPbg(system.pbg)}${short}`, ...place].join(
    " · ",
  );
}

/**
 * What everything in the open system is called. SystemSpec 7.3.
 *
 * Drawn once with the system rather than asked for a name at a time, because
 * the names of one system are one draw: they share a flavour and none of them
 * repeats another.
 */
let names: SystemNames | null = null;

/** The name of the world or moon a body is, where anybody lives on it. */
function properName(orbitIndex: number, moon: number | null): string | null {
  // What the referee called it beats what the generator called it. The override
  // is the one place a typed name lives, whether it was typed here or came up
  // from the world itself. SystemSpec 9.3.
  if (moon === null && doc !== null) {
    const written = overrideFor(doc, orbitIndex)?.name;
    if (written !== undefined && written.trim() !== "") return written;
  }
  if (names === null) return null;
  return moon === null
    ? (names.worlds.get(orbitIndex) ?? null)
    : (names.moons.get(moonKey(orbitIndex, moon)) ?? null);
}

function sysSay(message: string, isError = false): void {
  const status = el("sys-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function startNewSystem(): void {
  if (!confirmSystemDiscard("Roll another system")) return;
  const seed = randomSeed();
  systemFolder = null;
  const fresh = newSystemDoc(seed, "");
  fresh.name = namesOf(systemOf(fresh)).system;
  openSystem(fresh);
  markSystemClean();
}

/** Put a document on screen, and the system it describes with it. */
function openSystem(next: SystemDoc): void {
  doc = next;
  system = systemOf(next);
  // The document's name wins where it has one: a system opened from a chart is
  // called what the chart called it. SystemSpec 7.3.3.
  names = namesOf(system, next.name);
  orbitShown = system.mainWorld.orbitIndex;
  setAppView("system");
  el<HTMLInputElement>("sys-name").value = next.name;
  el<HTMLInputElement>("sys-sector").value = next.sector;
  el<HTMLInputElement>("sys-hex").value = next.hex;
  showSystemStar();
  orbits.render(system);
  model.render(system);
  // The gas giants first, because they cost nothing: a picture of one is bands
  // on a canvas rather than a surface generated and photographed.
  for (const orbit of system.orbits) {
    if (orbit.content.kind !== "giant") continue;
    const png = giantImage(`${system.seed}:${orbit.index}`, GLOBE_PX);
    orbits.setPicture(orbit.index, png);
    model.setPicture(orbit.index, png);
  }
  selectBody(orbitShown, null);
  setSystemParent("landing");
  showHeader();
  showCrumbs();
  showTree();
  drawWorldsSoon(system);
  const worlds = worldsOf(system).length;
  sysSay(`${system.orbits.length} orbits, ${worlds === 1 ? "one world" : `${worlds} worlds`}.`);
}

/**
 * Draw the open system again from its document, keeping the body being looked
 * at. What came up from the level below has changed the document, and a view
 * that did not redraw would be showing the world as it was before it was edited.
 */
function refreshSystem(): void {
  if (doc === null) return;
  const held = orbitShown;
  const moon = moonShown;
  system = systemOf(doc);
  names = namesOf(system, doc.name);
  el<HTMLInputElement>("sys-name").value = doc.name;
  showSystemStar();
  orbits.render(system);
  model.render(system);
  for (const orbit of system.orbits) {
    if (orbit.content.kind !== "giant") continue;
    const png = giantImage(`${system.seed}:${orbit.index}`, GLOBE_PX);
    orbits.setPicture(orbit.index, png);
    model.setPicture(orbit.index, png);
  }
  selectBody(held ?? system.mainWorld.orbitIndex, moon);
  showHeader();
  showTree();
  showCrumbs();
  drawWorldsSoon(system);
}

/** The same for the chart, when a system has come back up to it. */
function refreshChart(): void {
  if (subDoc === null) return;
  drawSubsector();
  selectHex(hexShown);
  showCrumbs();
}

/** What a save would lose, asked before anything discards it. SystemSpec 9.6. */
function confirmSystemDiscard(action: string): boolean {
  if (doc === null || !systemDirty) return true;
  return confirm(`${doc.name || "This system"} has unsaved changes. ${action} and lose them?`);
}

/** The panel for one orbit. SystemSpec 8.4. */
function showOrbit(index: number | null): void {
  const open = el<HTMLButtonElement>("sys-open");
  el<HTMLButtonElement>("sys-travel").hidden = index === null;
  showTravel();
  const facts = el("sys-facts");
  const written = el<HTMLTextAreaElement>("sys-written");
  const globe = el("sys-globe");
  globe.hidden = true;
  facts.replaceChildren();
  el("sys-moons").replaceChildren();
  el("sys-note").textContent = "";
  open.hidden = true;
  written.value = doc === null || index === null ? "" : (overrideFor(doc, index)?.note ?? "");
  written.disabled = doc === null || index === null;
  if (system === null || index === null) {
    el("sys-what").textContent = "Select an orbit";
    return;
  }
  const orbit = system.orbits.find((held) => held.index === index);
  if (orbit === undefined) return;

  const row = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    facts.append(dt, dd);
  };

  const content = orbit.content;
  const what = contentLabel(orbit);
  el("sys-what").textContent = `${bodyName(system, orbit.index)} — ${what}`;
  // Where the name is the world's own, what it is filed under is worth saying:
  // SystemSpec 7.3.1 wants both, one for the player and one for the referee.
  const called = positionName(system, orbit.index);
  if (called !== bodyName(system, orbit.index)) row("Designation", called);
  row("Distance", auLabel(orbit.au));
  row("Sunlight", sunlightNote(orbit.sunEquivalentAu));
  row("Year", yearNote(orbit.au, system.stars.primary.luminosity));
  if (orbit.habitable) row("Zone", "habitable");

  // A moon of the giant in this orbit, where the tree or the moon list picked
  // one out. It sits at its giant's distance and under its giant's star, so
  // everything about where it is comes from the orbit. SystemSpec 4.6.1.
  const moon =
    moonShown === null
      ? undefined
      : moonsOf(system, orbit.index).find((held) => held.index === moonShown);
  if (moon !== undefined) {
    const settings = worldSettings(system, orbit.index);
    const detail = planetDetail(moon.seed, moon.uwp, settings);
    el("sys-what").textContent = `${moonName(system, orbit.index, moon.index)} — moon`;
    const called = moonPositionName(system, orbit.index, moon.index);
    if (called !== moonName(system, orbit.index, moon.index)) row("Designation", called);
    row("Moon of", `the gas giant at ${auLabel(orbit.au)}`);
    row("Profile", moon.uwp);
    row("Seed", moon.seed);
    const codes = tradeCodes(moon.uwp);
    if (codes.length > 0) row("Trade", codes.map((code) => `${code.code} ${code.label}`).join(", "));
    row("Surface", `${(detail.meanTempK - 273.15).toFixed(0)}°C mean`);
    el("sys-note").textContent = describeUwp(moon.uwp, detail) ?? "";
    showMoonPicture(system, orbit.index, moon.seed, moon.uwp);
    open.hidden = false;
    return;
  }

  const inOrbit = worldIn(content);
  if (inOrbit !== null) {
    const detail = planetDetail(inOrbit.seed, inOrbit.uwp, worldSettings(system, orbit.index));
    row("Profile", inOrbit.uwp);
    row("Seed", inOrbit.seed);
    const codes = tradeCodes(inOrbit.uwp);
    if (codes.length > 0) row("Trade", codes.map((code) => `${code.code} ${code.label}`).join(", "));
    row("Surface", `${(detail.meanTempK - 273.15).toFixed(0)}°C mean`);
    // SystemSpec 4.7: the bases are in this system, and they are here, at the
    // main world, rather than somewhere the chart never said.
    if (inOrbit.main && system.bases.letter !== "") {
      row("Bases", basesLabel(system.bases.letter));
    }
    // 4.8.3: a world can sit inside its own star's shadow, and around a dim
    // star it usually does - which is a fact about every departure from it.
    if (orbit.au < starShadowAu(system)) row("Jump", "inside the star's shadow");
    // The description says it is a belt where it is one, since a belt profile
    // reads as a belt wherever it is read. SystemSpec 4.3.
    el("sys-note").textContent = describeUwp(inOrbit.uwp, detail) ?? "";
    // The world itself beside its profile, drawn the way the planet view draws
    // it rather than as a mark standing in for it. On a timer for the reason the
    // diagram's are: the panel should be readable before the picture arrives.
    if (content.kind === "world") showWorldPicture(system, orbit.index);
    open.hidden = false;
  } else if (content.kind === "giant") {
    row("Diameter", kmLabel(content.diameterKm));
    const shadow = jumpShadowKm(content.diameterKm);
    row("Jump shadow", `${kmLabel(shadow)}, ${crossingLabel(hoursAt1g(shadow))}`);
    const moons = content.moons.length === 1 ? "one moon" : `${content.moons.length} moons`;
    el("sys-note").textContent =
      `A gas giant with ${moons}. Nothing to land on, and fuel for anybody who can skim it.`;
    const picture = document.createElement("img");
    picture.src = giantImage(`${system.seed}:${orbit.index}`, GLOBE_PX);
    picture.alt = "";
    globe.replaceChildren(picture);
    globe.hidden = false;
    showMoons(system, orbit.index);
  } else if (content.kind === "belt") {
    el("sys-note").textContent = "A planetoid belt: where a world would have formed and did not.";
  } else {
    el("sys-note").textContent = "Nothing here. Empty orbits are normal.";
  }
}

/**
 * How much light falls on an orbit, against what falls on Earth. The stored
 * figure is a sunlight-equivalent distance, and light goes as the inverse square
 * of it, so this is the reading a referee can use: twice the distance is a
 * quarter of the light.
 */
function sunlightNote(sunEquivalentAu: number): string {
  const times = 1 / (sunEquivalentAu * sunEquivalentAu);
  const figure = times >= 10 ? Math.round(times) : times >= 1 ? times.toFixed(1) : times.toFixed(3).replace(/0+$/, "");
  return `${figure}× Earth's`;
}

/**
 * Put the selected world's picture in the panel, now if it has been drawn before
 * and shortly if it has not. The check on the way back is what stops a picture
 * landing in a panel that has moved on to another orbit.
 */
function showMoonPicture(
  open: StarSystem,
  orbitIndex: number,
  seed: string,
  uwp: string,
): void {
  const box = el("sys-globe");
  setTimeout(() => {
    if (system !== open || orbitShown !== orbitIndex) return;
    box.replaceChildren(liveGlobe({ seed, uwp, ...worldSettings(open, orbitIndex) }));
    box.hidden = false;
  }, 0);
}

function showWorldPicture(open: StarSystem, orbitIndex: number): void {
  const box = el("sys-globe");
  setTimeout(() => {
    if (system !== open || orbitShown !== orbitIndex) return;
    const orbit = open.orbits.find((held) => held.index === orbitIndex);
    if (orbit === undefined || orbit.content.kind !== "world") return;
    box.replaceChildren(
      liveGlobe({
        seed: orbit.content.seed,
        uwp: orbit.content.uwp,
        ...worldSettings(open, orbitIndex),
      }),
    );
    box.hidden = false;
  }, 0);
}

function yearNote(au: number, luminosity: number): string {
  const years = orbitalPeriodHours(au, luminosity) / (24 * 365.25);
  return years < 1 ? `${(years * 12).toFixed(1)} months` : `${years.toFixed(1)} years`;
}

el("sys-inhabited").addEventListener("change", showTree);

el<HTMLInputElement>("sys-name").addEventListener("input", (event) => {
  if (doc === null) return;
  doc.name = (event.target as HTMLInputElement).value;
  markSystemDirty();
});

for (const field of ["sector", "hex"] as const) {
  el<HTMLInputElement>(`sys-${field}`).addEventListener("input", (event) => {
    if (doc === null) return;
    doc[field] = (event.target as HTMLInputElement).value;
    markSystemDirty();
    showHeader();
  });
}

// Free prose about whatever is in an orbit, which is an override under
// SystemSpec 9.3 and stored only where there is something to store.
el<HTMLTextAreaElement>("sys-written").addEventListener("input", (event) => {
  if (doc === null || orbitShown === null) return;
  setOverride(doc, orbitShown, "note", (event.target as HTMLTextAreaElement).value);
  markSystemDirty();
});

/** Select a body: an orbit, or a moon of the giant in one. */
function selectBody(orbitIndex: number | null, moon: number | null): void {
  orbitShown = orbitIndex;
  moonShown = moon;
  orbits.setSelected(orbitIndex, moon);
  model.setSelected(orbitIndex);
  showOrbit(orbitIndex);
  markTree();
}

orbits.onSelect((index) => selectBody(index, null));
orbits.onSelectMoon((index, moon) => selectBody(index, moon));
model.onSelect((index) => selectBody(index, null));

el("sys-roll").addEventListener("click", () => {
  // A system that came out of a hex belongs to that hex, so rolling it again
  // rolls what is in the hex rather than wandering off to an unrelated system
  // the chart above has never heard of. SubSectorSpec 5.3.5.
  if (systemParent === "subsector" && subDoc !== null && doc !== null && doc.hex.trim() !== "") {
    rerollHexSystem(doc.hex.trim());
    return;
  }
  startNewSystem();
});

/**
 * What the system says about its main world, said to the chart as well.
 *
 * The chart draws one world per hex and that world is this system's main world,
 * so a name or a profile changed down here has to reach the hex or the two
 * levels disagree about the same world. SubSectorSpec 5.3.
 */
function tellChartAboutSystem(chart: SubsectorDoc, at: string, open: SystemDoc): void {
  const rolled = rolledWorld(at);
  if (rolled === null) return;
  const held = systemOf(open);
  setHexOverride(chart, at, "name", open.name === rolled.name ? "" : open.name);
  const uwp = held.mainWorld.uwp;
  setHexOverride(chart, at, "uwp", uwp === rolled.uwp ? "" : uwp);
  // The Stars column is the chart's, so a star changed down here has to reach
  // it or the two levels describe the same system differently.
  const stars = starsLabel(held.stars);
  setHexOverride(chart, at, "stars", stars === starsLabel(rolled.stars) ? "" : stars);
}

/** Roll a different system into a hex, and tell the chart about it. */
function rerollHexSystem(at: string): void {
  if (subDoc === null) return;
  if (!confirmSystemDiscard("Roll another system into this hex")) return;
  setSystemSeed(subDoc, at, randomSeed(), systemSeedFor(subDoc.seed, at));
  dropSystem(subDoc, at);
  markSubDirty();
  drawSubsector();
  const world = subsector?.worlds.find((held) => held.at === at);
  if (world === undefined) return;
  // The chart names what is in a hex, so the new system takes the new name.
  setHexOverride(subDoc, at, "name", "");
  openHexSystem(at, world.systemSeed, world.name, world.uwp);
  subSay(`Rolled another system into ${at}.`);
}

/**
 * Where the button at the head of the system goes back to. AppSpec 6.2, the same
 * rule the planet panel follows above: a move down keeps the parent open, so a
 * system reached through a chart goes back to that chart rather than out to the
 * landing page, and the button says which.
 */
let systemParent: "landing" | "subsector" = "landing";

function setSystemParent(parent: "landing" | "subsector"): void {
  systemParent = parent;
  el("sys-save").hidden = parent === "subsector";
  el("sys-dirty").hidden = parent === "subsector" || !systemDirty;
  openLevels.system = true;
  openLevels.planet = false;
  openLevels.subsector = parent === "subsector";
  const button = el("sys-home");
  button.textContent = parent === "subsector" ? "Chart" : "Levels";
  button.title = parent === "subsector" ? "Back to the subsector chart" : "Back to the levels";
}

el("sys-home").addEventListener("click", () => {
  // The chart is still laid out and still selected on the hex this system came
  // out of, so going back up is showing it again rather than rolling it again -
  // and the system goes up with it, so there is nothing to lose and nothing to
  // ask about.
  if (systemParent === "subsector" && subsector !== null) {
    keepSystemForChart();
    refreshChart();
    setAppView("subsector");
    return;
  }
  if (!confirmSystemDiscard("Leave this system")) return;
  setAppView("landing");
  landingSay("");
});

/* How long it takes to get anywhere from here. SystemSpec 4.9 ----------- */

/**
 * Every mass in the system that casts a shadow, placed where the model draws it.
 *
 * The model's arrangement is taken as the truth: a body sits at its orbit's
 * distance and at the angle its seed gave it, which is what the diagram shows
 * and therefore what a referee reading the diagram will expect the numbers to
 * agree with. A belt has no centre to cast one and is left out.
 */
function shadowsIn(open: StarSystem): ShadowBody[] {
  const out: ShadowBody[] = [
    // The star, at the middle of everything.
    { x: 0, y: 0, shadowKm: auToKm(starShadowAu(open)) },
  ];
  for (const orbit of open.orbits) {
    const size = bodyDiameterKm(open, orbit);
    if (size === null) continue;
    const at = positionAu(open, orbit.index);
    out.push({ x: auToKm(at.x), y: auToKm(at.y), shadowKm: jumpShadowKm(size) });
  }
  return out;
}

/** How wide the body in an orbit is, or null where there is nothing to measure. */
function bodyDiameterKm(open: StarSystem, orbit: Orbit): number | null {
  const content = orbit.content;
  if (content.kind === "giant") return content.diameterKm;
  const held = worldIn(content);
  if (held === null) return null;
  return planetDetail(held.seed, held.uwp, worldSettings(open, orbit.index)).diameterKm;
}

/**
 * The run from one body to another, in km, as the model lays them out.
 *
 * A belt is a ring rather than a place, so the crossing to one is the crossing
 * to the nearest part of it: a ship going to the belt goes to the near edge,
 * not to some agreed point on the far side of the star.
 */
function reachKm(open: StarSystem, from: number, to: Orbit): number {
  const here = positionAu(open, from);
  if (to.content.kind === "belt") {
    return auToKm(Math.abs(Math.hypot(here.x, here.y) - to.au));
  }
  const there = positionAu(open, to.index);
  return auToKm(Math.hypot(there.x - here.x, there.y - here.y));
}

function showTravel(): void {
  const panel = el("sys-travel-panel");
  const list = el("sys-travel-list");
  list.replaceChildren();
  if (system === null || orbitShown === null || panel.hidden) return;
  const open = system;
  const from = orbitShown;
  const gees = Math.min(10, Math.max(0.1, Number(el<HTMLInputElement>("sys-gees").value) || 1));

  const row = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  };

  // Out of the shadows first, because nothing else matters until a ship can
  // leave. There is always one to clear: a ship at a world is inside that
  // world's own. SystemSpec 4.9.3.
  const here = positionAu(open, from);
  const clear = clearOfShadows(shadowsIn(open), {
    x: auToKm(here.x),
    y: auToKm(here.y),
  });
  row("Jump point", `${kmLabel(clear)} · ${crossing(clear, gees)}`);

  for (const orbit of open.orbits) {
    if (orbit.index === from || orbit.content.kind === "empty") continue;
    const km = reachKm(open, from, orbit);
    row(bodyName(open, orbit.index), `${kmLabel(km)} · ${crossing(km, gees)}`);
  }
}

el("sys-travel").addEventListener("click", () => {
  const panel = el("sys-travel-panel");
  panel.hidden = !panel.hidden;
  el("sys-travel").setAttribute("aria-expanded", String(!panel.hidden));
  showTravel();
});

el("sys-gees").addEventListener("input", showTravel);

/* The star a system turns round. SystemSpec 2.6 -------------------------- */

for (const [box, values] of [
  [el<HTMLSelectElement>("sys-star-class"), SPECTRAL_CLASSES],
  [el<HTMLSelectElement>("sys-star-size"), STAR_SIZES],
] as const) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    box.append(option);
  }
}

/** The fields, showing whatever the system's primary is now. */
function showSystemStar(): void {
  if (system === null) return;
  const primary = system.stars.primary;
  el<HTMLSelectElement>("sys-star-class").value = primary.spectral;
  el<HTMLSelectElement>("sys-star-size").value = primary.size;
}

/**
 * Change the star, and lay the system out again around it.
 *
 * Not a repaint: the habitable zone, the snow line and every orbit distance are
 * worked out from what the star puts out, so a different star is a different
 * arrangement of the same system. The seed is untouched, so the worlds are the
 * same worlds - they are somewhere else, under a different sky.
 *
 * A companion keeps whatever was rolled. What is being edited is the star the
 * system is named for; a second star is a second question.
 */
function setSystemStar(): void {
  if (doc === null || system === null) return;
  const spectral = el<HTMLSelectElement>("sys-star-class").value;
  const size = el<HTMLSelectElement>("sys-star-size").value;
  const primary = parseStar(`${spectral}${system.stars.primary.subclass} ${size}`);
  if (primary === null) return;
  const held = system.stars.companion;
  const rolled = starsLabel(starsFor(doc.seed));
  const wanted = [starLabel(primary), held === null ? "" : starLabel(held)]
    .filter((part) => part !== "")
    .join(" ");
  // Rolled back to what it was, the override goes: the document says only what
  // the referee changed, the way every other override here does.
  doc.star = wanted === rolled ? null : wanted;
  markSystemDirty();
  refreshSystem();
  sysSay(`${starsLabel(system.stars)}. The orbits are laid out again around it.`);
}

for (const id of ["sys-star-class", "sys-star-size"]) {
  el(id).addEventListener("change", setSystemStar);
}

/* Saving and loading a system. SystemSpec 9.5, AppSpec 3.3 and 4.3 ------- */

/** The file a system is saved as, named for the system. AppSpec 4.3. */
function systemFile(open: SystemDoc): SaveFile {
  const stem = open.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "system";
  return { name: `${stem}${LEVEL_SUFFIX.system}`, data: JSON.stringify(open, null, 2) };
}

/**
 * Keep the open world on the system it came out of. SystemSpec 9.5.1.
 *
 * By seed rather than designation, because a designation moves: rename the
 * system and the world would be looked for under a name it never had.
 */
function keepPlanetForSystem(): void {
  if (doc === null || planetParent !== "system") return;
  const had = savedWorld(doc, state.planet.seed);
  // A copy, because state.planet is the one object the planet view edits: kept
  // by reference it would go on changing after it had been put down.
  keepWorld(doc, structuredClone(state.planet));
  tellSystemAboutWorld(doc, state.planet);
  if (had === undefined) markSystemDirty();
}

/**
 * What the world says about itself, said to the system as well. AppSpec 1.3.3.
 *
 * A name and a profile are what the level above draws: rename a world and the
 * tree, the strip and the chart above should all say the new name. They read
 * the system's overrides, so that is where it has to land - the world document
 * holds everything about the world, and the override holds the part the levels
 * above are looking at.
 */
function tellSystemAboutWorld(open: SystemDoc, planet: Planet): void {
  const held = systemOf({ ...open, overrides: [] });
  const orbit = held.orbits.find((one) => worldIn(one.content)?.seed === planet.seed);
  if (orbit === undefined) return;
  const rolled = worldIn(orbit.content);
  if (rolled === undefined || rolled === null) return;

  // Only what differs from what the generator said, the way every override in
  // this application works: typed back to what it was, it goes away again.
  setOverride(open, orbit.index, "uwp", planet.uwp === rolled.uwp ? "" : planet.uwp);

  // The main world and its system are the same thing named once, under
  // SystemSpec 7.3.4.1: renaming the world renames the system.
  if (rolled.main) {
    if (planet.name.trim() !== "") open.name = planet.name;
    open.mainWorldUwp = planet.uwp;
    return;
  }
  const rolledName = positionName(held, orbit.index);
  setOverride(open, orbit.index, "name", planet.name === rolledName ? "" : planet.name);
}

el("sys-save").addEventListener("click", async () => {
  if (doc === null) return;
  try {
    // The folder is asked for once: a load or an earlier save has already said
    // where this system lives, and AppSpec 3.3.2 has it stay there.
    systemFolder ??= await pickFolder();
    keepPlanetForSystem();
    const file = systemFile(doc);
    await saveTo(systemFolder, [file]);
    markSystemClean();
    const worlds = doc.worlds.length;
    const also = worlds === 0 ? "" : `, holding ${worlds === 1 ? "one world" : `${worlds} worlds`}`;
    sysSay(`Saved ${file.name}${also} into ${systemFolder.name}.`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    sysSay(error instanceof Error ? error.message : String(error), true);
  }
});

/**
 * Open a system from the folder holding it. AppSpec 3.3 and section 5: what is
 * chosen is the folder, not a file in it, and the folder is the save folder from
 * that moment on.
 */
async function loadSystem(): Promise<void> {
  if (!confirmSystemDiscard("Load another system")) return;
  try {
    const { dir, files } = await loadFolder();
    const found: { name: string; doc: SystemDoc }[] = [];
    const refused: string[] = [];
    for (const file of files) {
      try {
        found.push({ name: file.name, doc: parseSystemDoc(file.text) });
      } catch (error) {
        refused.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (found.length === 0) {
      // AppSpec 5.3 and 5.5: say what was found rather than failing blankly, and
      // name the file where something in the folder claimed to be a system.
      const detail = refused.length === 0 ? "" : ` ${refused[0]!}`;
      throw new Error(`No system in ${dir.name}.${detail}`);
    }
    // AppSpec 5.4 wants the user asked which; until there is somewhere to ask,
    // the first by name is opened and the rest are named in the status line.
    const first = found[0]!;
    systemFolder = dir;
    openSystem(first.doc);
    markSystemClean();
    const others = found.length === 1 ? "" : ` (${found.length - 1} more in the folder)`;
    sysSay(`Loaded ${first.name} from ${dir.name}.${others}`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    const message = error instanceof Error ? error.message : String(error);
    if (currentAppView() === "landing") landingSay(message, true);
    else sysSay(message, true);
  }
}

/**
 * A world out of a system, opened as a planet. SystemSpec 6.2 and the app spec
 * 6.1: the same planet view, reached by moving down a level.
 *
 * The settings the system wrote travel with it, under SystemSpec 6.6.3, so the
 * world that opens is the world the system made rather than one that happens to
 * share its seed.
 */
/**
 * What the system holds, down the left: every orbit in order, and a gas giant's
 * moons under it. The one place a moon can be found without knowing which giant
 * it belongs to.
 */
function showTree(): void {
  const tree = el("sys-tree");
  const about = el("sys-about");
  tree.replaceChildren();
  about.replaceChildren();
  if (system === null || doc === null) return;

  const fact = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    about.append(dt, dd);
  };
  fact("Stars", starsLabel(system.stars));
  fact("Orbits", String(system.orbits.length));
  const worlds = worldsOf(system).length;
  fact("Worlds", String(worlds));
  fact("Belts", String(system.placed.belts));
  fact("Gas giants", String(system.placed.gasGiants));
  if (system.bases.letter !== "") fact("Bases", basesLabel(system.bases.letter));
  // SystemSpec 4.8: how far out a ship has to be before it can jump, and how
  // far in an arriving one comes out.
  const shadowAu = starShadowAu(system);
  const inside = system.orbits.filter((orbit) => orbit.au < shadowAu).length;
  fact(
    "Jump shadow",
    inside === 0
      ? `${shadowAu.toFixed(2)} AU`
      : `${shadowAu.toFixed(2)} AU, over ${inside === 1 ? "one orbit" : `${inside} orbits`}`,
  );
  fact("Seed", doc.seed);

  const peopleOnly = el<HTMLInputElement>("sys-inhabited").checked;
  for (const orbit of system.orbits) {
    // An empty orbit is a gap rather than a thing, and a list of things is not
    // the place to say how many gaps there are. The model and the strip draw
    // them, which is where an empty orbit is worth seeing.
    if (orbit.content.kind === "empty") continue;
    // Whatever is selected stays in the list whether anybody lives on it or
    // not: a filter that hides what the rest of the window is about is a filter
    // that has lost the user.
    const chosen = orbit.index === orbitShown;
    if (peopleOnly && !chosen && !anybodyHome(system, orbit.index)) continue;
    const row = document.createElement("li");
    row.append(treeButton(orbit.index, null));
    const moons = moonsOf(system, orbit.index).filter(
      (moon) =>
        !peopleOnly ||
        livedOn(moon.uwp) ||
        (chosen && moon.index === moonShown),
    );
    if (moons.length > 0) {
      const nested = document.createElement("ul");
      for (const moon of moons) {
        const li = document.createElement("li");
        li.append(treeButton(orbit.index, moon.index));
        nested.append(li);
      }
      row.append(nested);
    }
    tree.append(row);
  }
  if (tree.children.length === 0) {
    const empty = document.createElement("li");
    empty.className = "tree-none";
    empty.textContent = "Nobody lives anywhere in this system.";
    tree.append(empty);
  }
  markTree();
}

/**
 * What to call the thing in an orbit.
 *
 * A world and a gas giant are both bodies and both get the system's name and
 * their orbit, under SystemSpec 7.2. A belt and an empty orbit are places rather
 * than things, so they are named by how far out they are, which is the only
 * thing there is to say about them.
 */
function bodyName(open: StarSystem, orbitIndex: number): string {
  return properName(orbitIndex, null) ?? positionName(open, orbitIndex);
}

/**
 * Where a body is, written as a name. SystemSpec 7.2: the system's name and
 * which planet it is, which is what a place with nobody on it is called and what
 * every body is filed under.
 */
function positionName(open: StarSystem, orbitIndex: number): string {
  const orbit = open.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined) return "";
  const stem = names?.system ?? open.seed;
  const held = ordinalOf(open, orbitIndex);
  if (held.kind === "planet") return worldName(stem, held.n);
  if (held.kind === "belt") return beltName(stem, held.n);
  // An empty orbit is a place rather than a thing, and how far out it is the
  // only thing there is to say about it.
  return auLabel(orbit.au);
}

/** Whether anybody lives on the body in an orbit, or on any of its moons. */
function anybodyHome(open: StarSystem, orbitIndex: number): boolean {
  const orbit = open.orbits.find((held) => held.index === orbitIndex);
  if (orbit === undefined) return false;
  const held = worldIn(orbit.content);
  if (held !== null && livedOn(held.uwp)) return true;
  return moonsOf(open, orbitIndex).some((moon) => livedOn(moon.uwp));
}

function livedOn(uwp: string): boolean {
  const profile = parseUwp(uwp);
  return profile !== null && profile.population > 0;
}

/** One row of the tree. Its name, what it is, and whether anybody lives there. */
function treeButton(orbitIndex: number, moon: number | null): HTMLButtonElement {
  const open = system!;
  const orbit = open.orbits.find((held) => held.index === orbitIndex)!;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["orbit"] = String(orbitIndex);
  button.dataset["moon"] = moon === null ? "" : String(moon);

  const held = moon === null ? null : moonsOf(open, orbitIndex).find((m) => m.index === moon);
  const uwp = held?.uwp ?? worldIn(orbit.content)?.uwp ?? null;
  const name = document.createElement("span");
  name.textContent =
    held !== null && held !== undefined
      ? moonName(open, orbitIndex, held.index)
      : bodyName(open, orbitIndex);
  button.append(name);

  if (uwp !== null && uwp !== undefined) {
    const profile = parseUwp(uwp);
    const digits = document.createElement("span");
    digits.className = "tree-uwp";
    digits.textContent = uwp;
    if (profile !== null && profile.population > 0) digits.classList.add("tree-people");
    button.append(digits);
  }
  const what = document.createElement("span");
  what.className = "tree-what";
  what.textContent =
    held !== null && held !== undefined ? "moon" : contentLabel(orbit).toLowerCase();
  button.append(what);

  button.addEventListener("click", () => selectBody(orbitIndex, moon));
  return button;
}

/** Mark the row the panel is about. */
function markTree(): void {
  for (const button of el("sys-tree").querySelectorAll("button")) {
    const orbit = Number(button.dataset["orbit"]);
    const moon = button.dataset["moon"] === "" ? null : Number(button.dataset["moon"]);
    const here = orbit === orbitShown && moon === moonShown;
    if (here) {
      button.setAttribute("aria-current", "true");
      // Picked in the model or on the strip, the row may be well down a list
      // nobody has scrolled. A mark that cannot be seen marks nothing.
      button.scrollIntoView({ block: "nearest" });
    } else {
      button.removeAttribute("aria-current");
    }
  }
}

/** The moons of a gas giant, each one a world that opens. SystemSpec 4.6.1. */
function showMoons(open: StarSystem, orbitIndex: number): void {
  const list = el("sys-moons");
  for (const moon of moonsOf(open, orbitIndex)) {
    const profile = parseUwp(moon.uwp);
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.textContent = moonName(open, orbitIndex, moon.index);
    const uwp = document.createElement("span");
    uwp.className = "moon-uwp";
    uwp.textContent = moon.uwp;
    button.append(name, uwp);
    if (profile !== null && profile.population > 0) {
      const people = document.createElement("span");
      people.className = "moon-people";
      people.textContent = "inhabited";
      button.append(people);
    }
    button.addEventListener("click", () => selectBody(orbitIndex, moon.index));
    list.append(button);
  }
}

/** A moon is its planet and a letter. SystemSpec 7.2. */
function moonName(open: StarSystem, orbitIndex: number, moon: number): string {
  return properName(orbitIndex, moon) ?? moonPositionName(open, orbitIndex, moon);
}

/** A moon is its planet and a letter. SystemSpec 7.2. */
function moonPositionName(open: StarSystem, orbitIndex: number, moon: number): string {
  const letter = String.fromCharCode(96 + Math.min(26, moon));
  return `${positionName(open, orbitIndex)}${letter}`;
}


/**
 * A world out of a system, opened as a planet. SystemSpec 6.2 and the app spec
 * 6.1: the same planet view, reached by moving down a level.
 *
 * The settings the system wrote travel with it, under SystemSpec 6.6.3, so the
 * world that opens is the world the system made rather than one that happens to
 * share its seed.
 */
function openWorld(
  seed: string,
  uwp: string,
  name: string,
  settings: { orbitAu: number; luminosity: number },
  au: number,
  designation: string,
): void {
  setPlanetParent("system");
  // The world they left, if they have been here before. Anything they typed on
  // it, drew on it or placed on it is still on it.
  const kept = doc === null ? undefined : savedWorld(doc, seed);
  // Everything the system knows that the world would otherwise have to be told
  // twice: which body it is, where it is in the setting, and what it orbits.
  // AppSpec 1.3.2 - a level above fills in the settings of the level below.
  const fromAbove = {
    designation,
    sector: doc?.sector ?? "",
    hex: doc?.hex ?? "",
    orbitAu: settings.orbitAu,
    luminosity: settings.luminosity,
    star: system === null ? null : starLabel(system.stars.primary),
  };
  Object.assign(
    state.planet,
    kept === undefined
      ? Object.assign(newPlanet(seed), { name, uwp }, fromAbove)
      : // What the referee left, wearing what the system says about it now. Its
        // designation, its place and its star follow the system rather than
        // being frozen at whatever they were when it was last looked at.
        { ...kept, ...fromAbove },
  );
  state.folder = null;
  state.selected = null;
  state.hovered = null;
  state.selectedRef = null;
  setAppView("planet");
  showPlanet();
  regenerate();
  placeStarport();
  placeCities();
  markSettled();
  map.resetView();
  globe.resetView();
  markClean();
  say(`${name}, ${au} AU out.${saveRoute()}`);
}

el("sys-open").addEventListener("click", () => {
  if (system === null || orbitShown === null) return;
  const orbit = system.orbits.find((held) => held.index === orbitShown);
  if (orbit === undefined) return;
  if (moonShown !== null) {
    const moon = moonsOf(system, orbit.index).find((held) => held.index === moonShown);
    if (moon === undefined) return;
    openWorld(
      moon.seed,
      moon.uwp,
      moonName(system, orbit.index, moon.index),
      worldSettings(system, orbit.index),
      orbit.au,
      moonName(system, orbit.index, moon.index),
    );
    return;
  }
  const held = worldIn(orbit.content);
  if (held === null) return;
  openWorld(
    held.seed,
    held.uwp,
    bodyName(system, orbit.index),
    worldSettings(system, orbit.index),
    orbit.au,
    positionName(system, orbit.index),
  );
});


/* The subsector chart. SubSectorSpec section 4 --------------------------- */

// The document is what is edited and saved; the chart is what the document
// describes, rebuilt from its seed every time either changes. SubSectorSpec 5.2.

const chart = createChart();
el("sub-chart").append(chart.element);

let subDoc: SubsectorDoc | null = null;
let subsector: Subsector | null = null;
let subFolder: DirectoryHandle | null = null;
let hexShown: string | null = null;
let subDirty = false;
let subParent: "landing" | "sector" = "landing";

for (const letter of SUBSECTOR_LETTERS) {
  const option = document.createElement("option");
  option.value = letter;
  option.textContent = letter;
  el("sub-letter").append(option);
}

function subSay(message: string, isError = false): void {
  const status = el("sub-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function markSubDirty(): void {
  subDirty = true;
  el("sub-dirty").hidden = subParent === "sector";
  if (subParent === "sector") markSectorDirty();
}

function markSubClean(): void {
  subDirty = false;
  el("sub-dirty").hidden = true;
}

/** What a save would lose, asked before anything discards it. SubSectorSpec 5.6. */
function confirmSubDiscard(action: string): boolean {
  if (subDoc === null || !subDirty) return true;
  return confirm(`${subDoc.name || "This subsector"} has unsaved changes. ${action} and lose them?`);
}

function startNewSubsector(): void {
  if (!confirmSubDiscard("Roll another subsector")) return;
  const letter = el<HTMLSelectElement>("sub-letter").value || "A";
  const density = (el<HTMLSelectElement>("sub-density").value || "standard") as Density;
  const held = newSubsectorDoc(randomSeed(), letter, density, `Subsector ${letter}`);
  subFolder = null;
  openSubsector(held);
  markSubClean();
}

/** Put a document on screen, and the chart it describes with it. */
function openSubsector(next: SubsectorDoc, parent: "landing" | "sector" = "landing"): void {
  subDoc = next;
  subParent = parent;
  el("sub-home").textContent = parent === "sector" ? "Sector" : "Levels";
  // A chart under a sector is saved by that sector, the way a system under a
  // chart is saved by the chart. AppSpec 4.10.
  el("sub-save").hidden = parent === "sector";
  el("sub-dirty").hidden = parent === "sector" || !subDirty;
  openLevels.sector = parent === "sector";

  setAppView("subsector");
  el<HTMLInputElement>("sub-name").value = next.name;
  el<HTMLInputElement>("sub-sector").value = next.sector;
  el<HTMLSelectElement>("sub-letter").value = next.letter;
  el<HTMLSelectElement>("sub-density").value = next.density;
  el<HTMLInputElement>("sub-people").value = String(next.shifts.population);
  el<HTMLInputElement>("sub-tech").value = String(next.shifts.tech);
  openLevels.subsector = true;
  openLevels.system = false;
  openLevels.planet = false;
  drawSubsector();
  showCrumbs();
  // The busiest world, which is where a referee's eye goes and what the chart is
  // usually about.
  const first = [...(subsector?.worlds ?? [])].sort(
    (a, b) => b.profile.population - a.profile.population,
  )[0];
  selectHex(first?.at ?? null);
  subSay(`${subsector?.worlds.length ?? 0} systems in eighty hexes.`);
}

/**
 * Rebuild the chart from the document and draw it. SubSectorSpec 5.2: nothing
 * generated is stored, so every edit is a change to the document and then this.
 */
function drawSubsector(): void {
  if (subDoc === null) return;
  subsector = chartOf(subDoc);
  chart.render(subsector);
  chart.setMains(el<HTMLInputElement>("sub-mains").checked);
  showSubsectorAbout();
  showSubsectorList();
}


function showSubsectorAbout(): void {
  const about = el("sub-about");
  about.replaceChildren();
  if (subsector === null) return;
  const fact = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    about.append(dt, dd);
  };
  const inhabited = subsector.worlds.filter((world) => world.profile.population > 0).length;
  fact("Systems", `${subsector.worlds.length} of 80`);
  fact("Inhabited", String(inhabited));
  fact("Density", subsector.density);
  const lean = [
    (subDoc?.shifts.population ?? 0) === 0
      ? ""
      : `people ${subDoc!.shifts.population > 0 ? "+" : ""}${subDoc!.shifts.population}`,
    (subDoc?.shifts.tech ?? 0) === 0
      ? ""
      : `tech ${subDoc!.shifts.tech > 0 ? "+" : ""}${subDoc!.shifts.tech}`,
  ].filter((part) => part !== "");
  if (lean.length > 0) fact("Leaning", lean.join(", "));
  fact("Seed", subsector.seed);
  // The Mains are worth a line of their own when they are being looked at: how
  // many there are, and how far the longest one reaches. SubSectorSpec 3.10.
  if (el<HTMLInputElement>("sub-mains").checked && subsector.mains.length > 0) {
    const longest = subsector.mains[0]!;
    fact("Mains", subsector.mains.length === 1 ? "one" : String(subsector.mains.length));
    fact("Longest", `${longest.name}, ${longest.hexes.length} worlds`);
  }
  const written = subDoc?.overrides.length ?? 0;
  if (written > 0) fact("Edited", written === 1 ? "one hex" : `${written} hexes`);
  el("sub-where").textContent = `Subsector ${subsector.letter}`;
  // The sector alone up here. The seed is a fact in the panel below and does not
  // need saying twice, and a header that wraps is a header that has stopped
  // being a header.
  el("sub-counts").textContent = el<HTMLInputElement>("sub-sector").value.trim();
}

/** Every world on the chart, down the left, in hex order. */
function showSubsectorList(): void {
  const list = el("sub-list");
  list.replaceChildren();
  if (subsector === null) return;
  const peopleOnly = el<HTMLInputElement>("sub-inhabited").checked;
  for (const world of subsector.worlds) {
    if (peopleOnly && world.profile.population === 0 && world.at !== hexShown) continue;
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["at"] = world.at;
    const name = document.createElement("span");
    name.textContent = world.name;
    const uwp = document.createElement("span");
    uwp.className = world.profile.population > 0 ? "tree-uwp tree-people" : "tree-uwp";
    uwp.textContent = world.uwp;
    const at = document.createElement("span");
    at.className = "tree-what";
    at.textContent = world.at;
    button.append(name, uwp, at);
    button.addEventListener("click", () => selectHex(world.at));
    row.append(button);
    list.append(row);
  }
  markSubsectorList();
}

function markSubsectorList(): void {
  for (const button of el("sub-list").querySelectorAll("button")) {
    if (button.dataset["at"] === hexShown) {
      button.setAttribute("aria-current", "true");
      button.scrollIntoView({ block: "nearest" });
    } else {
      button.removeAttribute("aria-current");
    }
  }
}

/** Select a hex: the chart, the list and the panel all follow it. */
function selectHex(at: string | null): void {
  // Another hex is another system, so what was open under this chart is not.
  if (at !== hexShown) {
    openLevels.system = false;
    openLevels.planet = false;
  }
  hexShown = at;
  chart.setSelected(at);
  markSubsectorList();
  showHexPanel(at);
}

/** What is in a hex, and where it is edited. SubSectorSpec 4.3 and 4.4. */
function showHexPanel(at: string | null): void {
  const facts = el("sub-facts");
  const open = el<HTMLButtonElement>("sub-open");
  facts.replaceChildren();
  el("sub-note").textContent = "";
  open.hidden = true;
  el("sub-globe").hidden = true;
  el("sub-edit").hidden = true;
  if (subsector === null || subDoc === null || at === null) {
    el("sub-what").textContent = "Select a hex";
    return;
  }
  const world = subsector.worlds.find((held) => held.at === at) ?? null;
  showHexFields(at, world);
  if (world === null) {
    el("sub-what").textContent = `${at} — empty`;
    el("sub-note").textContent = "Nothing here. Most of a subsector is nothing.";
    return;
  }

  const row = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    facts.append(dt, dd);
  };
  el("sub-what").textContent = `${world.name} — ${at}`;
  row("PBG", `${world.pbg.multiplier}${world.pbg.belts}${world.pbg.gasGiants}`);
  row("Stars", starsLabel(world.stars));
  if (world.trade.length > 0) {
    row("Trade", world.trade.map((code) => `${code.code} ${code.label}`).join(", "));
  }
  row("Seed", world.seed);
  // Where the world actually is, which is its own system's answer rather than
  // the one a profile alone would guess at. SubSectorSpec 4.3.1.1: a chart that
  // said 5.77 AU while the system said 1.2 would be two answers about one world.
  const settings = mainWorldSettings(world);
  row("Distance", `${settings.orbitAu.toFixed(2)} AU`);
  const detail = planetDetail(world.seed, world.uwp, settings);
  el("sub-note").textContent = describeUwp(world.uwp, detail) ?? "";
  open.hidden = false;
  showHexGlobe(world, settings);
}

/**
 * Where a hex's main world sits and what lights it, by laying out its system.
 *
 * Cheap: a system is orbits and counts, not surfaces. The chart avoids doing it
 * for eighty hexes at once under SystemSpec 11.4, but the one hex being looked
 * at is worth the truth.
 */
function mainWorldSettings(world: ChartWorld): { orbitAu: number; luminosity: number } {
  const held = generateSystem(world.systemSeed);
  return worldSettings(held, held.mainWorld.orbitIndex);
}

/**
 * The selected world, turning, at the top of the panel. SubSectorSpec 4.3.1.
 *
 * The chart draws dots, because eighty globes is a chart that cannot be rolled
 * and a dot with a key beside it says more at that size anyway. One world at a
 * time is worth a real picture, and the panel is where a world is looked at
 * rather than glanced at.
 *
 * Drawn where its own system puts it, so this is the same world the system view
 * shows rather than a near miss: a surface is its climate, and a climate is an
 * orbit. Laying the system out for one hex is cheap; it is the surface that is
 * not, which is why this waits a tick and checks the hex is still the one
 * selected before drawing.
 */
function showHexGlobe(
  world: ChartWorld,
  settings: { orbitAu: number; luminosity: number },
): void {
  const box = el("sub-globe");
  const wanted = world.at;
  if (world.profile.size === 0) {
    // A belt has no globe. There is no sphere here to photograph. SystemSpec 4.3.3.
    box.hidden = true;
    return;
  }
  setTimeout(() => {
    if (hexShown !== wanted || subsector === null) return;
    box.replaceChildren(liveGlobe({ seed: world.seed, uwp: world.uwp, ...settings }));
    box.hidden = false;
  }, 0);
}

/**
 * The fields a referee writes over a hex with. SubSectorSpec 5.3.
 *
 * What is in a field is what the chart is showing, whether that came from the
 * generator or from them: a box that showed only their own edits would be a box
 * that is empty on every hex they have not touched yet, and they would be typing
 * a world's name in from scratch to change one letter of it. What decides
 * whether anything is stored is whether it still matches what was rolled.
 */
function showHexFields(at: string, world: ChartWorld | null): void {
  if (subDoc === null) return;
  const box = el("sub-edit");
  box.hidden = false;
  const here = el<HTMLInputElement>("sub-here");
  here.checked = world !== null;
  el("sub-fields").hidden = world === null;
  if (world === null) return;
  el<HTMLInputElement>("sub-e-name").value = world.name;
  el<HTMLInputElement>("sub-e-uwp").value = world.uwp;
  el<HTMLSelectElement>("sub-e-bases").value = world.bases;
  el<HTMLSelectElement>("sub-e-zone").value = world.zone;
  el<HTMLTextAreaElement>("sub-e-note").value = hexOverride(subDoc, at)?.note ?? "";
}

/**
 * Take an edit. Only what differs from what the generator said is kept, under
 * 5.3.1, so a referee who types a name back to what it already was leaves no
 * override behind.
 */
function editHex(field: HexField, value: string): void {
  if (subDoc === null || hexShown === null) return;
  const at = hexShown;
  const rolled = rolledWorld(at);
  const same =
    rolled !== null &&
    (field === "name"
      ? rolled.name === value.trim()
      : field === "uwp"
        ? rolled.uwp === value.trim().toUpperCase()
        : field === "bases"
          ? rolled.bases === value
          : field === "zone"
            ? rolled.zone === value
            : false);
  setHexOverride(subDoc, at, field, same ? "" : value);
  markSubDirty();
  drawSubsector();
  selectHex(at);
}

/** What the generator says is in a hex, before anybody wrote on it. */
function rolledWorld(at: string): ChartWorld | null {
  if (subDoc === null) return null;
  const rolled = generateSubsector(subDoc.seed, subDoc.letter, subDoc.density);
  return rolled.worlds.find((held) => held.at === at) ?? null;
}

el("sub-here").addEventListener("change", () => {
  if (subDoc === null || hexShown === null) return;
  const at = hexShown;
  const wanted = el<HTMLInputElement>("sub-here").checked;
  setPresence(subDoc, at, wanted, rolledWorld(at) !== null);
  markSubDirty();
  drawSubsector();
  selectHex(at);
});

for (const [id, field] of [
  ["sub-e-name", "name"],
  ["sub-e-uwp", "uwp"],
] as const) {
  // On change rather than on input: a half typed UWP is not a profile, and a
  // chart redrawn on every keystroke is a chart that fights the typist.
  el(id).addEventListener("change", (event) => {
    editHex(field, (event.target as HTMLInputElement).value);
  });
}
for (const [id, field] of [
  ["sub-e-bases", "bases"],
  ["sub-e-zone", "zone"],
] as const) {
  el(id).addEventListener("change", (event) => {
    editHex(field, (event.target as HTMLSelectElement).value);
  });
}
el("sub-e-note").addEventListener("change", (event) => {
  editHex("note", (event.target as HTMLTextAreaElement).value);
});

/* Saving and loading a subsector. SubSectorSpec 5.5, AppSpec 3.3 and 4.4 --- */

/** The file a subsector is saved as, named for the subsector. AppSpec 4.4. */
function subsectorFileFor(open: SubsectorDoc): SaveFile {
  const stem = open.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || `Subsector ${open.letter}`;
  return {
    name: `${stem}${LEVEL_SUFFIX.subsector}`,
    data: JSON.stringify(open, null, 2),
  };
}

/**
 * The files a subsector save writes: the document, the sector file, and a folder
 * for every system the referee has worked up. AppSpec 4.4 and 4.6.
 *
 * Only what was actually worked on. Eighty folders for eighty hexes nobody has
 * opened would be eighty folders describing what the seed already describes.
 */
async function subsectorFiles(open: SubsectorDoc): Promise<SaveFile[]> {
  const file = subsectorFileFor(open);
  const stem = file.name.replace(/\.[a-z]+$/, "");
  const files: SaveFile[] = [file];
  if (subsector === null) return files;
  const chart = subsector;
  const sector = el<HTMLInputElement>("sub-sector").value.trim();
  const wants = (id: string) => el<HTMLInputElement>(id).checked;
  // What the referee wrote about a hex travels with the hex into the sheet.
  const noteFor = (at: string) => hexOverride(open, at)?.note ?? "";

  // The sector file, since a chart that cannot be handed to a map is a chart
  // only this application can read. SubSectorSpec 6.1.
  if (wants("sub-want-sec")) {
    files.push({ name: `${stem}.sec`, data: subsectorFile(chart, sector) });
  }
  const drawn = () => chartSvg(chart, sector, el<HTMLInputElement>("sub-mains").checked);
  if (wants("sub-want-svg")) files.push({ name: `${stem}.svg`, data: drawn() });
  if (wants("sub-want-png")) {
    files.push({ name: `${stem}.png`, data: await svgToPng(drawn()) });
  }
  if (wants("sub-want-csv")) files.push({ name: `${stem}.csv`, data: subsectorCsv(chart) });
  if (wants("sub-want-md")) {
    files.push({ name: `${stem}.md`, data: subsectorSheetMarkdown(chart, sector, noteFor) });
  }
  if (wants("sub-want-html")) {
    files.push({ name: `${stem}.html`, data: subsectorSheetHtml(chart, sector, noteFor) });
  }
  return files;
}

/** What a save wrote, said in the terms the referee thinks in. */
function subsectorSaveNote(open: SubsectorDoc, files: readonly SaveFile[]): string {
  const chart = files[0]!.name;
  const systems = open.systems.length;
  const worlds = open.systems.reduce((count, held) => count + held.doc.worlds.length, 0);
  const worked =
    systems === 0
      ? ""
      : `, holding ${systems === 1 ? "one system" : `${systems} systems`}${
          worlds === 0 ? "" : ` and ${worlds === 1 ? "one world" : `${worlds} worlds`}`
        }`;
  const beside = files.length - 1;
  const also = beside === 0 ? "" : ` with ${beside === 1 ? "one export" : `${beside} exports`}`;
  return `${chart}${worked}${also}`;
}

el("sub-save").addEventListener("click", async () => {
  if (subDoc === null) return;
  const held = subDoc;
  try {
    const files = await subsectorFiles(held);
    if (isSupported()) {
      // Asked for once: a load or an earlier save has already said where this
      // subsector lives, and AppSpec 3.3.2 has it stay there.
      subFolder ??= await pickFolder();
      await saveTo(subFolder, files);
      markSubClean();
      subSay(`Saved ${subsectorSaveNote(held, files)} into ${subFolder.name}.`);
      return;
    }
    // The same fallback a planet save has under the planet spec 6.4.1: a browser
    // that cannot write a folder gets the folder as an archive instead. A
    // download cannot be written over, so there is no folder to remember.
    const stem = subsectorFileFor(held).name.replace(/\.[a-z]+$/, "");
    download(await zipSave(files), `${stem}.zip`);
    markSubClean();
    subSay(`Saved ${stem}.zip.`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    subSay(error instanceof Error ? error.message : String(error), true);
  }
});

/**
 * Open a subsector from the folder holding it. AppSpec 3.3 and section 5: what
 * is chosen is the folder, not a file in it, and the folder is the save folder
 * from that moment on.
 */
async function loadSubsector(): Promise<void> {
  if (!confirmSubDiscard("Load another subsector")) return;
  try {
    const { dir, files } = await loadFolder();
    const found: { name: string; doc: SubsectorDoc }[] = [];
    const refused: string[] = [];
    for (const file of files) {
      try {
        found.push({ name: file.name, doc: parseSubsectorDoc(file.text) });
      } catch (error) {
        refused.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (found.length === 0) {
      const detail = refused.length === 0 ? "" : ` ${refused[0]!}`;
      throw new Error(`No subsector in ${dir.name}.${detail}`);
    }
    const first = found[0]!;
    subFolder = dir;
    openSubsector(first.doc);
    markSubClean();
    const others = found.length === 1 ? "" : ` (${found.length - 1} more in the folder)`;
    const systems = first.doc.systems.length;
    const worlds = first.doc.systems.reduce((count, one) => count + one.doc.worlds.length, 0);
    const worked =
      systems === 0
        ? ""
        : ` ${systems === 1 ? "One system" : `${systems} systems`}${
            worlds === 0 ? "" : ` and ${worlds === 1 ? "one world" : `${worlds} worlds`}`
          } worked up.`;
    subSay(`Loaded ${first.name} from ${dir.name}.${others}${worked}`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    const message = error instanceof Error ? error.message : String(error);
    if (currentAppView() === "landing") landingSay(message, true);
    else subSay(message, true);
  }
}

chart.onSelect(selectHex);
el("sub-inhabited").addEventListener("change", showSubsectorList);
el("sub-mains").addEventListener("change", () => {
  chart.setMains(el<HTMLInputElement>("sub-mains").checked);
  showSubsectorAbout();
});
el("sub-roll").addEventListener("click", startNewSubsector);

// Every stored field of 5.1, and every one of them makes the document dirty.
for (const id of ["sub-letter", "sub-density", "sub-people", "sub-tech"]) {
  el(id).addEventListener("change", () => {
    if (subDoc === null) return;
    subDoc.letter = el<HTMLSelectElement>("sub-letter").value;
    subDoc.density = el<HTMLSelectElement>("sub-density").value as Density;
    // A lean is a modifier on the dice, so it is held to what a modifier on 2D
    // can sensibly be. SubSectorSpec 3.11.1.
    const lean = (field: string) => {
      const typed = Math.round(Number(el<HTMLInputElement>(field).value) || 0);
      const held = Math.max(-SHIFT_LIMIT, Math.min(SHIFT_LIMIT, typed));
      el<HTMLInputElement>(field).value = String(held);
      return held;
    };
    subDoc.shifts = { population: lean("sub-people"), tech: lean("sub-tech") };
    markSubDirty();
    drawSubsector();
    selectHex(hexShown);
  });
}
el("sub-name").addEventListener("input", () => {
  if (subDoc === null) return;
  subDoc.name = el<HTMLInputElement>("sub-name").value;
  markSubDirty();
  showCrumbs();
});
el("sub-sector").addEventListener("input", () => {
  if (subDoc === null) return;
  subDoc.sector = el<HTMLInputElement>("sub-sector").value;
  markSubDirty();
  showSubsectorAbout();
});

el("sub-home").addEventListener("click", () => {
  // Up to the sector loses nothing, because the sector carries the chart.
  if (subParent === "sector" && sectorDoc !== null) {
    keepSubsectorForSector();
    refreshSector();
    setAppView("sector");
    return;
  }
  if (!confirmSubDiscard("Leave this subsector")) return;
  setAppView("landing");
  landingSay("");
});

/**
 * Down a level, from a hex to the system in it. SubSectorSpec section 7 and the
 * app spec 6.1: the chart hands over the seed, and the system generates itself
 * from that, so what opens is the system the chart drew.
 */
el("sub-open").addEventListener("click", () => {
  if (subsector === null || subDoc === null || hexShown === null) return;
  const world = subsector.worlds.find((held) => held.at === hexShown);
  if (world === undefined) return;
  openHexSystem(world.at, world.systemSeed, world.name, world.uwp);
});

/**
 * Open the system in a hex. SubSectorSpec section 7.
 *
 * The one the referee left if they have been in here before, and a fresh one
 * off the hex's seed if they have not. A system worked on and gone back to is
 * the system they worked on: the alternative is the level below quietly undoing
 * itself every time somebody looks at the chart.
 */
function openHexSystem(at: string, seed: string, name: string, uwp?: string): void {
  if (subDoc === null) return;
  const held = savedSystem(subDoc, at) ?? newSystemDoc(seed, name);
  // The profile the chart drew, which is not what the seed alone rolls where
  // the region leans its worlds. AppSpec 1.3.1: the level above fills this in
  // rather than the level below guessing at it.
  if (uwp !== undefined && uwp !== "") held.mainWorldUwp = uwp;
  held.sector = el<HTMLInputElement>("sub-sector").value;
  held.hex = at;
  systemFolder = null;
  openSystem(held);
  markSystemClean();
  setSystemParent("subsector");
  showCrumbs();
}

/**
 * Keep the open system against the hex it came out of, so the chart carries it.
 * Called on the way back up rather than on every keystroke: what is being kept
 * is the document, and the document is the same object being edited.
 */
function keepSystemForChart(): void {
  if (doc === null || systemParent !== "subsector" || subDoc === null) return;
  const at = doc.hex.trim();
  if (at === "") return;
  keepPlanetForSystem();
  const had = savedSystem(subDoc, at);
  keepSystem(subDoc, at, doc);
  tellChartAboutSystem(subDoc, at, doc);
  // The chart now holds something its seed alone would not produce, so it has
  // something to save. AppSpec 4.6.
  if (had !== doc) markSubDirty();
}

/* The trail across the levels. AppSpec 6.2 -------------------------------- */

/**
 * One bar in each level's header, all three drawn from the same state, so that
 * whichever level is on screen says the same thing about where it sits.
 *
 * What is open is remembered rather than worked out from what happens to be in
 * memory: a system left behind on the way back up to the chart is still open
 * and can be gone back into, but choosing another hex closes it, because it is
 * no longer the system that hex holds.
 */
const openLevels = { sector: false, subsector: false, system: false, planet: false };

const crumbBars = [
  { at: "crumbs-planet", bar: createCrumbs() },
  { at: "crumbs-system", bar: createCrumbs() },
  { at: "crumbs-sub", bar: createCrumbs() },
  { at: "crumbs-sector", bar: createCrumbs() },
];
for (const { at, bar } of crumbBars) {
  el(at).append(bar.element);
  bar.onGo(goToLevel);
}

function showCrumbs(): void {
  const trail: Trail = {};
  if (openLevels.sector) trail.sector = el<HTMLInputElement>("sec-name").value.trim() || "Sector";
  if (openLevels.subsector) {
    trail.subsector = el<HTMLInputElement>("sub-name").value.trim() || "Subsector";
  }
  if (openLevels.system) trail.system = doc?.name.trim() || "System";
  if (openLevels.planet) trail.planet = state.planet.name.trim() || "Planet";
  const view = currentAppView();
  const here: Level | null = view === "landing" ? null : view;
  for (const { bar } of crumbBars) bar.render(trail, here);
}

/** Up the chain, with whatever is unsaved asked about on the way. AppSpec 6.2. */
function goToLevel(level: Level): void {
  const view = currentAppView();
  if (level === view) return;
  // Moving up the chain keeps what is below, so nothing is asked on the way.
  // What is carried is put down on the way past, level by level.
  if (view === "planet" && planetParent === "system") {
    keepPlanetForSystem();
    refreshSystem();
  }
  if (view === "system" || (view === "planet" && systemParent === "subsector")) {
    if (level === "subsector") {
      keepSystemForChart();
      refreshChart();
    }
  }
  if (view === "subsector" && level === "sector") keepSubsectorForSector();
  if (level === "sector" && openLevels.sector) setAppView("sector");
  else if (level === "subsector" && openLevels.subsector) setAppView("subsector");
  else if (level === "system" && openLevels.system) setAppView("system");
  else if (level === "planet" && openLevels.planet) setAppView("planet");
  showCrumbs();
}

/* The sector. SectorSpec section 4 --------------------------------------- */

// Sixteen charts at once: the map in the middle, the letters down the left, and
// whatever hex is selected on the right. The way down is a subsector.

const sectorMap = createSectorMap();
el("sec-map").append(sectorMap.element);

let sectorDoc: SectorDoc | null = null;
let sector: Sector | null = null;
let sectorFolder: DirectoryHandle | null = null;
let sectorDirty = false;
let letterShown: string | null = null;
let sectorHexShown: string | null = null;

function secSay(message: string, isError = false): void {
  const status = el("sec-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function markSectorDirty(): void {
  sectorDirty = true;
  el("sec-dirty").hidden = false;
}

function markSectorClean(): void {
  sectorDirty = false;
  el("sec-dirty").hidden = true;
}

/** What a save would lose, asked before anything discards it. */
function confirmSectorDiscard(action: string): boolean {
  if (sectorDoc === null || !sectorDirty) return true;
  return confirm(`${sectorDoc.name || "This sector"} has unsaved changes. ${action} and lose them?`);
}

function startNewSector(): void {
  if (!confirmSectorDiscard("Roll another sector")) return;
  sectorFolder = null;
  openSector(newSectorDoc(randomSeed(), "New Sector"));
  markSectorClean();
}

/** Put a document on screen, and the sector it describes with it. */
function openSector(next: SectorDoc): void {
  sectorDoc = next;
  setAppView("sector");
  el<HTMLInputElement>("sec-name").value = next.name;
  el<HTMLSelectElement>("sec-density").value = next.density;
  el<HTMLInputElement>("sec-people").value = String(next.shifts.population);
  el<HTMLInputElement>("sec-tech").value = String(next.shifts.tech);
  openLevels.sector = true;
  openLevels.subsector = false;
  openLevels.system = false;
  openLevels.planet = false;
  drawSector();
  showCrumbs();
  selectLetter(null);
  secSay(`${sector?.worlds.length ?? 0} worlds in sixteen subsectors.`);
}

/** Rebuild the sector from its document and draw it. SectorSpec 5.2. */
function drawSector(): void {
  if (sectorDoc === null) return;
  sector = sectorOf(sectorDoc);
  sectorMap.render(sector);
  showSectorAbout();
  showSectorList();
}

function refreshSector(): void {
  if (sectorDoc === null) return;
  drawSector();
  sectorMap.setSelected(letterShown, sectorHexShown);
  showCrumbs();
}

function showSectorAbout(): void {
  const about = el("sec-about");
  about.replaceChildren();
  if (sector === null || sectorDoc === null) return;
  const fact = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    about.append(dt, dd);
  };
  const inhabited = sector.worlds.filter((world) => world.profile.population > 0).length;
  fact("Worlds", `${sector.worlds.length} of ${SECTOR_HEXES}`);
  fact("Inhabited", String(inhabited));
  fact("Density", sector.density);
  // What only this level can see. SectorSpec 3.3 and 3.4.
  fact("Routes", String(sector.routes.length));
  if (sector.mains.length > 0) {
    const longest = sector.mains[0]!;
    fact("Longest Main", `${longest.name}, ${longest.hexes.length} worlds`);
  }
  const worked = sectorDoc.subsectors.length;
  if (worked > 0) fact("Worked up", worked === 1 ? "one chart" : `${worked} charts`);
  fact("Seed", sector.seed);
  el("sec-counts").textContent = `${sector.worlds.length} worlds · seed ${sector.seed}`;
}

/** The sixteen down the left, each with what is in it. */
function showSectorList(): void {
  const list = el("sec-list");
  list.replaceChildren();
  if (sector === null) return;
  for (const held of sector.subsectors) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["letter"] = held.letter;
    const name = document.createElement("span");
    const written = sectorDoc === null ? undefined : savedSubsector(sectorDoc, held.letter);
    name.textContent = written?.name ?? `Subsector ${held.letter}`;
    const count = document.createElement("span");
    count.className = "tree-what";
    count.textContent = `${held.worlds.length} worlds`;
    button.append(name, count);
    button.addEventListener("click", () => selectLetter(held.letter));
    button.addEventListener("dblclick", () => openSubsectorOf(held.letter));
    row.append(button);
    list.append(row);
  }
  markSectorList();
}

function markSectorList(): void {
  for (const button of el("sec-list").querySelectorAll("button")) {
    if (button.dataset["letter"] === letterShown) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }
}

/** Choose a subsector: the map, the list and the panel all follow. */
function selectLetter(letter: string | null): void {
  letterShown = letter;
  sectorHexShown = null;
  sectorMap.setSelected(letter, null);
  markSectorList();
  showSectorPanel();
}

/** Choose one hex of the sector, which is one world. */
function selectSectorHex(at: string): void {
  sectorHexShown = at;
  letterShown = letterAt(at);
  sectorMap.setSelected(letterShown, at);
  markSectorList();
  showSectorPanel();
}

/** What is selected, whether that is a subsector or one world in it. */
function showSectorPanel(): void {
  const facts = el("sec-facts");
  const open = el<HTMLButtonElement>("sec-open");
  facts.replaceChildren();
  el("sec-note").textContent = "";
  open.hidden = letterShown === null;
  if (sector === null || letterShown === null) {
    el("sec-what").textContent = "Select a subsector";
    return;
  }
  const row = (term: string, value: string) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    facts.append(dt, dd);
  };

  const world =
    sectorHexShown === null
      ? undefined
      : sector.worlds.find((held) => held.at === sectorHexShown);
  if (world !== undefined) {
    el("sec-what").textContent = `${world.name} — ${world.at}`;
    row("Profile", world.uwp);
    row("Subsector", letterShown);
    row("Bases", basesLabel(world.bases));
    row("Zone", zoneLabel(world.zone));
    row("PBG", `${world.pbg.multiplier}${world.pbg.belts}${world.pbg.gasGiants}`);
    row("Stars", starsLabel(world.stars));
    if (world.trade.length > 0) {
      row("Trade", world.trade.map((code) => `${code.code} ${code.label}`).join(", "));
    }
    el("sec-note").textContent = describeUwp(world.uwp, planetDetail(world.seed, world.uwp)) ?? "";
    open.textContent = "Open the chart";
    return;
  }

  const held = sector.subsectors.find((one) => one.letter === letterShown)!;
  const inhabited = held.worlds.filter((one) => one.profile.population > 0).length;
  el("sec-what").textContent = `Subsector ${letterShown}`;
  row("Worlds", `${held.worlds.length} of 80`);
  row("Inhabited", String(inhabited));
  if (held.mains.length > 0) row("Mains", String(held.mains.length));
  row("Seed", held.seed);
  const busiest = [...held.worlds].sort(
    (a, b) => b.profile.population - a.profile.population,
  )[0];
  if (busiest !== undefined) row("Busiest", `${busiest.name}, ${busiest.uwp}`);
  open.textContent = "Open the chart";
}

/** Down a level, into one of the sixteen. SectorSpec section 7. */
function openSubsectorOf(letter: string): void {
  if (sectorDoc === null) return;
  letterShown = letter;
  openSubsector(subsectorIn(sectorDoc, letter), "sector");
  markSubClean();
}

/** Keep the open chart against its letter, so the sector carries it. */
function keepSubsectorForSector(): void {
  if (subDoc === null || subParent !== "sector" || sectorDoc === null) return;
  const letter = subDoc.letter;
  const had = savedSubsector(sectorDoc, letter);
  keepSystemForChart();
  keepSubsector(sectorDoc, letter, subDoc);
  if (had !== subDoc) markSectorDirty();
}

sectorMap.onPickHex(selectSectorHex);
sectorMap.onPickSubsector(openSubsectorOf);
el("sec-open").addEventListener("click", () => {
  if (letterShown !== null) openSubsectorOf(letterShown);
});
el("sec-roll").addEventListener("click", startNewSector);
el("sec-name").addEventListener("input", () => {
  if (sectorDoc === null) return;
  sectorDoc.name = el<HTMLInputElement>("sec-name").value;
  markSectorDirty();
  showCrumbs();
});
for (const id of ["sec-density", "sec-people", "sec-tech"]) {
  el(id).addEventListener("change", () => {
    if (sectorDoc === null) return;
    const lean = (field: string) => {
      const typed = Math.round(Number(el<HTMLInputElement>(field).value) || 0);
      const held = Math.max(-SHIFT_LIMIT, Math.min(SHIFT_LIMIT, typed));
      el<HTMLInputElement>(field).value = String(held);
      return held;
    };
    sectorDoc.density = el<HTMLSelectElement>("sec-density").value as Density;
    sectorDoc.shifts = { population: lean("sec-people"), tech: lean("sec-tech") };
    markSectorDirty();
    refreshSector();
  });
}
el("sec-home").addEventListener("click", () => {
  if (!confirmSectorDiscard("Leave this sector")) return;
  setAppView("landing");
  landingSay("");
});

/* Saving and loading a sector. AppSpec 4.1.2 ----------------------------- */

function sectorFileFor(open: SectorDoc): SaveFile {
  const stem = open.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || "Sector";
  return { name: `${stem}${LEVEL_SUFFIX.sector}`, data: JSON.stringify(open, null, 2) };
}

el("sec-save").addEventListener("click", async () => {
  if (sectorDoc === null) return;
  const held = sectorDoc;
  try {
    keepSubsectorForSector();
    const files: SaveFile[] = [sectorFileFor(held)];
    if (sector !== null) {
      const stem = sectorFileFor(held).name.replace(/\.[a-z]+$/, "");
      // The whole sector as one file a map can read, which is the export this
      // level exists to make possible. SectorSpec 6.1.
      files.push({ name: `${stem}.sec`, data: sectorFile(sector, held.name) });
    }
    if (isSupported()) {
      sectorFolder ??= await pickFolder();
      await saveTo(sectorFolder, files);
      markSectorClean();
      secSay(`Saved ${files[0]!.name} into ${sectorFolder.name}.`);
      return;
    }
    const stem = sectorFileFor(held).name.replace(/\.[a-z]+$/, "");
    download(await zipSave(files), `${stem}.zip`);
    markSectorClean();
    secSay(`Saved ${stem}.zip.`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    secSay(error instanceof Error ? error.message : String(error), true);
  }
});

async function loadSector(): Promise<void> {
  if (!confirmSectorDiscard("Load another sector")) return;
  try {
    const { dir, files } = await loadFolder();
    const found: { name: string; doc: SectorDoc }[] = [];
    for (const file of files) {
      try {
        found.push({ name: file.name, doc: parseSectorDoc(file.text) });
      } catch {
        // Not a sector. Something else in the folder, and AppSpec 4.9 leaves it.
      }
    }
    if (found.length === 0) throw new Error(`No sector in ${dir.name}.`);
    const first = found[0]!;
    sectorFolder = dir;
    openSector(first.doc);
    markSectorClean();
    const worked = first.doc.subsectors.length;
    const also = worked === 0 ? "" : ` ${worked === 1 ? "One chart" : `${worked} charts`} worked up.`;
    secSay(`Loaded ${first.name} from ${dir.name}.${also}`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    const message = error instanceof Error ? error.message : String(error);
    if (currentAppView() === "landing") landingSay(message, true);
    else secSay(message, true);
  }
}

wireLanding({
  planetNew: startNewPlanet,
  planetLoad: loadPlanet,
  systemNew: startNewSystem,
  systemLoad: loadSystem,
  subsectorNew: startNewSubsector,
  subsectorLoad: loadSubsector,
  sectorNew: startNewSector,
  sectorLoad: loadSector,
});

/* Start ------------------------------------------------------------------ */

// The window opens on the landing page with nothing generated. The planet in
// state is the one the module built to have something to hold, and it is thrown
// away and rolled again the moment New is pressed. AppSpec 2.5.
setAppView("landing");
