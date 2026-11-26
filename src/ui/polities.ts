/**
 * Editing the allegiance table. AppSpec 9.2.
 *
 * A dialog over whichever map is open: a row for each polity, the codes a
 * world already wears offered as rows to fill in, and nothing written back
 * until Save. The rows are built here rather than in the markup, so a sector
 * with twenty polities and one with none use the same dialog.
 */

import type { AllegianceName } from "../charted-map";
import { CODE_LIMIT, tidyAllegiances, unnamedCodes, type PolityRow } from "../polities";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

/**
 * One row of the table.
 *
 * The code is narrow and the name is wide, because that is the shape of the
 * data: four letters against "Zhodani Consulate, Iadr Nsobl Province".
 */
function rowFor(held: PolityRow): HTMLElement {
  const row = document.createElement("div");
  row.className = "polity-row";

  const field = (
    cls: string,
    value: string,
    placeholder: string,
    label: string,
    max?: number,
  ): HTMLInputElement => {
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.className = cls;
    input.value = value;
    input.placeholder = placeholder;
    // Each box says what it is, for anybody not reading the column headings -
    // which on a narrow window are above the fold.
    input.setAttribute("aria-label", label);
    if (max !== undefined) input.maxLength = max;
    return input;
  };

  row.append(
    field("polity-code", held.code, "ZhIN", "Allegiance code", CODE_LIMIT),
    field("polity-name", held.name, "Zhodani Consulate", "Full name"),
    field("polity-short", held.short, "Consulate", "Short name for the map"),
  );

  // Whether a frontier is drawn round what it holds. Off for the rows a
  // published table brought, which names the unclaimed and the client states
  // as well as the powers. AppSpec 9.5.2.
  const wants = document.createElement("label");
  wants.className = "polity-border";
  const tick = document.createElement("input");
  tick.type = "checkbox";
  tick.className = "polity-draw";
  tick.checked = held.border;
  tick.setAttribute("aria-label", "Draw a border round this polity");
  tick.title = "Draw a frontier round the hexes this polity holds";
  wants.append(tick);
  row.append(wants);

  const drop = document.createElement("button");
  drop.type = "button";
  drop.className = "polity-drop";
  drop.textContent = "×";
  drop.title = "Remove this polity";
  drop.setAttribute("aria-label", "Remove this polity");
  drop.addEventListener("click", () => {
    row.remove();
    showHeadings();
  });
  row.append(drop);
  return row;
}

/** What is in the boxes right now, in the order they are shown. */
function readRows(): PolityRow[] {
  return [...el("polity-rows").querySelectorAll<HTMLElement>(".polity-row")].map((row) => ({
    code: row.querySelector<HTMLInputElement>(".polity-code")?.value ?? "",
    name: row.querySelector<HTMLInputElement>(".polity-name")?.value ?? "",
    short: row.querySelector<HTMLInputElement>(".polity-short")?.value ?? "",
    border: row.querySelector<HTMLInputElement>(".polity-draw")?.checked ?? false,
  }));
}

/** A new row asks for a border: adding a polity is asking to see where it is. */
const FRESH: PolityRow = { code: "", name: "", short: "", border: true };

function addRow(held: PolityRow = FRESH): void {
  const rows = el("polity-rows");
  const row = rowFor(held);
  rows.append(row);
  showHeadings();
  row.querySelector<HTMLInputElement>(".polity-code")?.focus();
}

/**
 * The headings, hidden while there is nothing under them.
 *
 * Three words floating over an empty box label nothing and only make the
 * dialog look like it failed to load.
 */
function showHeadings(): void {
  const rows = el("polity-rows");
  const head = rows.querySelector<HTMLElement>(".polity-head");
  if (head === null) return;
  head.hidden = rows.querySelectorAll(".polity-row:not(.polity-head)").length === 0;
}

/** The headings over the columns, built once with the rows. */
function headings(): HTMLElement {
  const head = document.createElement("div");
  head.className = "polity-row polity-head";
  for (const [text, cls] of [
    ["Code", "polity-code"],
    ["Name", "polity-name"],
    ["Short", "polity-short"],
    ["Border", "polity-border"],
  ] as const) {
    const cell = document.createElement("span");
    cell.className = cls;
    cell.textContent = text;
    head.append(cell);
  }
  // A spacer under the remove buttons, so the headings sit over their columns.
  head.append(document.createElement("span"));
  return head;
}

/**
 * Open the dialog and resolve with the table to keep, or null where it was
 * closed without saving.
 *
 * `used` is every allegiance code worn by a world of the open document. The
 * ones it has no row for are offered under the list, since a referee who has
 * marked twenty hexes `ZhIN` wants that row started for them.
 */
export function editPolities(
  held: readonly AllegianceName[],
  used: readonly string[],
): Promise<AllegianceName[] | null> {
  const dialog = el<HTMLDialogElement>("polity-dialog");
  const rows = el("polity-rows");
  const status = el("polity-status");
  const suggest = el("polity-suggest");

  const say = (message: string): void => {
    status.textContent = message;
  };

  const showSuggestions = (): void => {
    const missing = unnamedCodes(used, tidyAllegiances(readRows()).kept);
    suggest.replaceChildren();
    if (missing.length === 0) return;
    suggest.append(
      document.createTextNode(
        missing.length === 1 ? "A code in use with no name: " : "Codes in use with no name: ",
      ),
    );
    for (const code of missing) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "linky";
      add.textContent = code;
      add.title = `Add a row for ${code}`;
      add.addEventListener("click", () => {
        addRow({ ...FRESH, code });
        showSuggestions();
      });
      suggest.append(add, document.createTextNode(" "));
    }
  };

  rows.replaceChildren(headings());
  for (const one of held) addRow({ ...one, border: one.border === true });
  showHeadings();
  say(
    held.length === 0
      ? "Nothing named yet. Add a polity, or pick one of the codes below."
      : `${held.length} ${held.length === 1 ? "polity" : "polities"}.`,
  );
  showSuggestions();

  // The suggestions follow what has been typed, so a code given a row stops
  // being offered without waiting for Save.
  const watch = () => showSuggestions();
  rows.addEventListener("input", watch);

  const add = el<HTMLButtonElement>("polity-new");
  const onAdd = () => {
    addRow();
    showSuggestions();
  };
  add.addEventListener("click", onAdd);

  const cancel = el<HTMLButtonElement>("polity-cancel");
  const onCancel = () => dialog.close("");
  cancel.addEventListener("click", onCancel);

  dialog.showModal();

  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        rows.removeEventListener("input", watch);
        add.removeEventListener("click", onAdd);
        cancel.removeEventListener("click", onCancel);
        if (dialog.returnValue !== "save") {
          resolve(null);
          return;
        }
        resolve(tidyAllegiances(readRows()).kept);
      },
      { once: true },
    );
  });
}

/** What the save did, for the status bar, including what it could not keep. */
export function describePolities(rows: readonly PolityRow[]): string {
  const tidy = tidyAllegiances(rows);
  const parts = [`${tidy.kept.length} ${tidy.kept.length === 1 ? "polity" : "polities"}`];
  if (tidy.repeated.length > 0) parts.push(`${tidy.repeated.join(", ")} given twice, kept once`);
  if (tidy.uncoded > 0) {
    parts.push(`${tidy.uncoded} with no code ${tidy.uncoded === 1 ? "was" : "were"} dropped`);
  }
  return `${parts.join(", ")}.`;
}
