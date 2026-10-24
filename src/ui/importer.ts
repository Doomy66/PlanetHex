/**
 * Choosing a published sector to open. AppSpec 8.2.
 *
 * A dialog over the landing page: the official sectors in a list, and for a
 * subsector import the sixteen letters under the one you pick. The catalogue
 * is asked for once and kept for the session, and so is every sector table,
 * because moving between the subsectors of one sector should not go back
 * across the world sixteen times.
 *
 * The list is built here rather than written into the markup, so no sector
 * name ships in this application's own files.
 */

import {
  fetchCatalogue,
  fetchSectorTable,
  fetchMetadata,
  fetchSubsectorTable,
  MILIEU,
  type CataloguedSector,
  type SectorMetadata,
  type WorldTable,
} from "../io/travellermap";
import { importSector, importSubsector, type ChartedSource } from "../io/charted";
import type { ImportReport } from "../io/charted";
import { SUBSECTOR_LETTERS } from "../location";
import type { SectorDoc } from "../sector";
import type { SubsectorDoc } from "../subsector";

/** What one trip through the dialog produced. */
export type Imported =
  | { readonly level: "sector"; readonly doc: SectorDoc; readonly report: ImportReport }
  | { readonly level: "subsector"; readonly doc: SubsectorDoc; readonly report: ImportReport };

/* Kept for the session, so a second look costs nothing. -------------------- */

let catalogue: CataloguedSector[] | null = null;
const tables = new Map<string, WorldTable>();
const metadata = new Map<string, SectorMetadata>();

async function theCatalogue(): Promise<CataloguedSector[]> {
  catalogue ??= await fetchCatalogue();
  return catalogue;
}

async function tableFor(abbreviation: string): Promise<WorldTable> {
  const held = tables.get(abbreviation);
  if (held !== undefined) return held;
  const got = await fetchSectorTable(abbreviation);
  tables.set(abbreviation, got);
  return got;
}

async function metadataFor(abbreviation: string): Promise<SectorMetadata> {
  const held = metadata.get(abbreviation);
  if (held !== undefined) return held;
  const got = await fetchMetadata(abbreviation);
  metadata.set(abbreviation, got);
  return got;
}

/* The dialog ------------------------------------------------------------- */

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

function say(message: string, isError = false): void {
  const status = el("import-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/** A row of the list, built the way the save dialog builds its tick-boxes. */
function choice(
  group: string,
  value: string,
  label: string,
  onPick: () => void,
): HTMLLabelElement {
  const row = document.createElement("label");
  // The same class the save dialog's tick-boxes wear, so the control sits
  // against the first line of its label rather than being laid out as an
  // ordinary form field with the input in a column of its own.
  row.className = "save-option";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = group;
  radio.value = value;
  radio.addEventListener("change", onPick);
  const text = document.createElement("span");
  const name = document.createElement("span");
  name.className = "save-option-label";
  name.textContent = label;
  text.append(name);
  row.append(radio, text);
  return row;
}

/**
 * Open the picker and resolve with what the user chose to import, or null if
 * they closed it.
 *
 * `level` decides whether the result is a whole sector or one subsector of
 * one. A subsector is the smaller thing to ask travellermap for in every
 * sense, but the sector's own table is fetched either way because the
 * subsector names come with it and a user picking one subsector often wants
 * its neighbours next.
 */
export async function pickPublishedSector(level: "sector" | "subsector"): Promise<Imported | null> {
  const dialog = el<HTMLDialogElement>("import-dialog");
  const list = el("import-sectors");
  const letters = el("import-letters");
  const which = el("import-which");
  const go = el<HTMLButtonElement>("import-go");

  let chosen: CataloguedSector | null = null;
  let letter: string | null = null;

  which.hidden = level === "sector";
  letters.replaceChildren();
  list.replaceChildren();
  go.disabled = true;
  say("Asking travellermap.com which sectors there are...");
  dialog.showModal();

  const ready = () => {
    go.disabled = chosen === null || (level === "subsector" && letter === null);
  };

  /** The sixteen letters, named from the sector's own metadata. */
  const showLetters = async (sector: CataloguedSector) => {
    letters.replaceChildren();
    letter = null;
    ready();
    const meta = await metadataFor(sector.abbreviation);
    letters.replaceChildren(
      ...[...SUBSECTOR_LETTERS].map((one) =>
        choice("import-letter", one, `${one} — ${meta.names.get(one) ?? "unnamed"}`, () => {
          letter = one;
          ready();
        }),
      ),
    );
  };

  try {
    const sectors = await theCatalogue();
    list.replaceChildren(
      ...sectors.map((sector) =>
        choice("import-sector", sector.abbreviation, sector.name, () => {
          chosen = sector;
          ready();
          if (level === "subsector") {
            say(`Reading the subsectors of ${sector.name}...`);
            void showLetters(sector)
              .then(() => say(`${sector.name}. Now pick a subsector.`))
              .catch((error: unknown) => say(reason(error), true));
          }
        }),
      ),
    );
    say(`${sectors.length} published sectors${level === "sector" ? "" : ". Pick one"}.`);
  } catch (error) {
    say(reason(error), true);
  }

  const picked = await closed(dialog);
  if (picked !== "import" || chosen === null) return null;

  // Narrowed by hand: the listeners above assign to these, which TypeScript
  // cannot see from here.
  const sector = chosen as CataloguedSector;
  const source: ChartedSource = {
    origin: "travellermap",
    sector: sector.name,
    abbreviation: sector.abbreviation,
    x: sector.x,
    y: sector.y,
    milieu: MILIEU,
  };

  if (level === "subsector") {
    const only = letter ?? "A";
    const meta = await metadataFor(sector.abbreviation);
    // The subsector's own endpoint where nothing of this sector is held yet,
    // and the sector's table where it is: thirty-two lines against four
    // hundred, or nothing at all against a second request.
    const table = tables.get(sector.abbreviation) ?? (await fetchSubsectorTable(sector.abbreviation, only));
    const held = importSubsector(
      table.rows,
      source,
      only,
      meta.names.get(only) ?? `Subsector ${only}`,
      meta,
    );
    return { level: "subsector", doc: held.doc, report: held.report };
  }

  const table = await tableFor(sector.abbreviation);
  const meta = await metadataFor(sector.abbreviation);
  const held = importSector(table.rows, source, meta);
  return { level: "sector", doc: held.doc, report: held.report };
}

/** What closed the dialog: its submit value, or "" where it was dismissed. */
function closed(dialog: HTMLDialogElement): Promise<string> {
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
  });
}

/** What went wrong, in words worth showing somebody. */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong fetching that.";
}

/**
 * What the import did, in one line for the status bar.
 *
 * It says what was skipped as well as what arrived. A published sector has the
 * odd world nobody has surveyed, and a count that quietly left them out would
 * be a count that was wrong.
 */
export function describeImport(name: string, report: ImportReport): string {
  const parts = [`${report.worlds} worlds from ${name}`];
  if (report.unreadable.length > 0) {
    parts.push(`${report.unreadable.length} with no readable profile`);
  }
  if (report.unnamed.length > 0) parts.push(`${report.unnamed.length} unnamed`);
  return `${parts.join(", ")}.`;
}
