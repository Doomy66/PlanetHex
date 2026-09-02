import "./style.css";
import { buildGrid, cellCount, type Grid } from "./grid/grid";
import {
  asLatticeRef,
  buildRefIndex,
  DETAIL_LEVELS,
  formatLattice,
  formatRef,
  latticeKey,
  type LatticeRef,
  type RefCoord,
  type RefIndex,
} from "./grid/coord";
import { generateHeights } from "./gen/height";
import { isIced, type IceCaps } from "./gen/ice";
import { DEFAULT_FIELD_OPTIONS, type HeightFieldOptions } from "./gen/field";
import { newPlanet, parseUwp, rollUwp, type Planet } from "./planet";
import { starportSite } from "./gen/site";
import { poiAt, poiPlacements, putPoi, removePoi, type Poi, type PoiKind } from "./poi";
import { formatSectorHex, parseSectorHex, subsectorLetter } from "./location";
import { planetDetail, type PlanetDetail } from "./gen/detail";
import {
  isRetrograde,
  isTidallyLocked,
  orbitalPeriodHours,
  orbitForTemperature,
  type ClimateOverrides,
} from "./gen/climate";
import { describeUwp } from "./gen/describe";
import { createHexMap, type PoiMark } from "./ui/map";
import { createGlobe } from "./ui/globe";
import { createLocalView } from "./ui/local";
import { DEFAULT_SEA_LEVEL, terrainBand } from "./ui/colour";
import { DEFAULT_VERDANCY } from "./gen/life";
import {
  isSupported,
  load,
  PickerCancelled,
  pickFolder,
  saveTo,
  type DirectoryHandle,
} from "./io/files";
import { renderMaps } from "./io/images";
import { surfaceOn } from "./surface";

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
  /** How green the land is drawn, from bare rock to an Earth. Spec 5.6. */
  verdancy: number;
  /** Polar ice, or null on a planet the profile does not cap. Spec 5.4. */
  caps: IceCaps | null;
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

const local = createLocalView();
el("local-view").append(local.element);

const state: State = (() => {
  const planet = newPlanet();
  const grid = buildGrid(planet.size);
  return {
    planet,
    grid,
    refs: buildRefIndex(grid),
    heights: generateHeights(grid, planet.seed),
    seaLevel: DEFAULT_SEA_LEVEL,
    diameterKm: null,
    options: DEFAULT_FIELD_OPTIONS,
    verdancy: DEFAULT_VERDANCY,
    caps: null,
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
  state.selected = state.selectedRef === null ? null : state.refs.at(state.selectedRef);
  resurface();
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
  state.heights = surface.heights;
  state.seaLevel = surface.seaLevel;
  state.diameterKm = surface.diameterKm;
  state.caps = surface.caps;
  state.verdancy = surface.verdancy;
  map.render(
    state.grid,
    state.heights,
    state.seaLevel,
    state.diameterKm,
    state.caps,
    state.verdancy,
  );
  globe.render(
    state.grid,
    state.heights,
    state.seaLevel,
    state.diameterKm,
    state.caps,
    state.verdancy,
    detail.axialTiltDeg,
  );
  showSelection(state.selected);
  showPois();
}

function markDirty(): void {
  state.dirty = true;
  el("dirty").hidden = false;
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

  const days = detail.rotationHours / 24;
  el("rotation-note").textContent = [
    days >= 2 ? `${days.toFixed(1)} days long` : "",
    isTidallyLocked(detail.rotationHours, detail.orbitAu) ? "locked to its year" : "",
    isRetrograde(detail.axialTiltDeg) ? "turning backwards" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const year = orbitalPeriodHours(detail.orbitAu) / (24 * 365.25);
  el("orbit-note").textContent = `year of ${year < 1 ? `${(year * 12).toFixed(1)} months` : `${year.toFixed(1)} years`}`;
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
      state.planet.orbitAu = v === null ? null : Math.min(50, Math.max(0.05, v));
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
      state.planet.orbitAu = orbitForTemperature(v + 273.15, climate.albedo, climate.greenhouseK);
    },
    (d) => `Mean ${(d.meanTempK - 273.15).toFixed(0)}°C, which puts it ${d.orbitAu.toFixed(2)} AU out.`,
  );
});

el("reset-world").addEventListener("click", () => {
  state.planet.tiltDeg = null;
  state.planet.orbitAu = null;
  state.planet.rotationHours = null;
  showWorld(currentDetail());
  showDetail();
  resurface();
  markDirty();
  say("World settings back to what the seed and the profile give.");
});

el("roll-uwp").addEventListener("click", () => {
  state.planet.uwp = rollUwp(state.planet.seed + ":" + Date.now());
  fields.uwp.value = state.planet.uwp;
  showDetail();
  resurface();
  markDirty();
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
  el("h-band").textContent = terrainBand(height, state.seaLevel, isIced(state.caps, cell.centre[1]));
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
  globe.setSelected(cell);
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
    seaLevel: state.seaLevel,
    diameterKm: state.diameterKm,
    caps: state.caps,
    verdancy: state.verdancy,
  });
  showHex(cell);
  showTip(state.hovered);
}

map.onSelect(select);
globe.onSelect(select);

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

const KIND_LABEL: Record<PoiKind, string> = { starport: "Starport", comment: "Comment" };

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

  // One mark to a hex, whatever it covers. A hex covering both kinds is marked as
  // a starport, since a place on the world outranks a note about one and the
  // tooltip of 4.3.5 says what else is there.
  const marks: PoiMark[] = [...state.poisByCell].map(([cell, here]) => ({
    cell,
    kind: here.some((poi) => poi.kind === "starport") ? "starport" : "comment",
  }));
  map.setPois(marks);
  globe.setPois(marks);

  const list = el("poi-list");
  list.replaceChildren(
    ...[...placements]
      .sort((a, b) => poiTitle(a.poi).localeCompare(poiTitle(b.poi)))
      .map(({ poi, cell }) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = `poi-entry poi-${poi.kind}`;
        button.title = `${KIND_LABEL[poi.kind]} on ${formatLattice(poi.ref)}`;
        button.textContent = poiTitle(poi);
        // Selecting first, so the panels are looking at the ground the dialogue
        // is about: the display hex covering the POI, which is what the map and
        // the globe can show a selection on.
        button.addEventListener("click", () => {
          select(cell);
          openPoi(poi.ref);
        });
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
function placeStarport(): void {
  const uwp = parseUwp(state.planet.uwp);
  if (uwp === null || uwp.starport === "X") return;
  const site = starportSite(state.grid, state.heights, state.seaLevel);
  const ref = site === null ? null : state.refs.of[site.cell];
  if (!ref) return;
  state.planet.pois = putPoi(state.planet.pois, {
    kind: "starport",
    name: `Starport ${uwp.starport}`,
    narrative: "",
    ref: asLatticeRef(ref),
  });
  showPois();
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
  const poi: Poi = {
    kind: chosenKind(),
    name: poiFields.name.value,
    narrative: poiFields.narrative.value,
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
  openPoi(pick.ref);
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

/* Buttons ---------------------------------------------------------------- */

el("new").addEventListener("click", () => {
  if (!confirmDiscard("Start a new planet")) return;
  Object.assign(state.planet, newPlanet());
  state.folder = null;
  state.selected = null;
  state.hovered = null;
  state.selectedRef = null;
  showPlanet();
  regenerate();
  placeStarport();
  // Spec 4.4.5.2 and 4.3.6.2: the globe's size says how big this world is, which
  // a camera left zoomed in on the last one would contradict, and a map left
  // zoomed in on a corner of it opens the new world showing a corner.
  map.resetView();
  globe.resetView();
  markClean();
  say(`New planet, seed ${state.planet.seed}.`);
});

el("save").addEventListener("click", async () => {
  const save = el<HTMLButtonElement>("save");
  if (save.disabled) return;
  try {
    // The folder is asked for while the click is still the gesture in hand.
    // Drawing the maps below takes seconds, and the picker will not open on a
    // gesture that has gone stale by the time it is reached.
    const folder = state.folder ?? (await pickFolder());
    // Level 48 is 23,042 hexes, and there are four levels to draw. The button
    // goes down so a second click cannot start it all again underneath.
    save.disabled = true;
    say(`Saving to ${folder.name}...`);
    const images = await renderMaps(state.planet, currentDetail(), (size) =>
      say(`Drawing the ${size} row map for ${folder.name}...`),
    );
    await saveTo(folder, state.planet, images);
    state.folder = folder;
    markClean();
    say(`Saved to ${folder.name}, with ${images.size} maps.`);
  } catch (error) {
    if (error instanceof PickerCancelled) {
      say("");
      return;
    }
    say(error instanceof Error ? error.message : String(error), true);
  } finally {
    save.disabled = false;
  }
});

el("load").addEventListener("click", async () => {
  if (!confirmDiscard("Load another planet")) return;
  try {
    const { planet, name } = await load();
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
    map.resetView();
    globe.resetView();
    markClean();
    say(`Loaded ${name}.`);
  } catch (error) {
    if (error instanceof PickerCancelled) return;
    say(error instanceof Error ? error.message : String(error), true);
  }
});

/* Help. Spec 4.8 --------------------------------------------------------- */

// The text and the licence are in index.html rather than fetched, so opening
// the help cannot fail. All that is left is showing it. Spec 4.8.5.
const helpDialog = el<HTMLDialogElement>("help-dialog");

function openHelp(): void {
  if (!helpDialog.open) helpDialog.showModal();
}

el("help").addEventListener("click", openHelp);
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
  event.preventDefault();
  if (helpDialog.open) helpDialog.close();
  else openHelp();
});

/* Start ------------------------------------------------------------------ */

showPlanet();
regenerate();
placeStarport();
markClean();
if (!isSupported()) {
  say("This browser cannot save in place. Save and Load need a Chromium browser.", true);
} else {
  say(`Seed ${state.planet.seed}. Sea level ${state.seaLevel.toFixed(3)}.`);
}
