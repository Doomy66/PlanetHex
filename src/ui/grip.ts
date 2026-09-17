/**
 * A panel edge the user can drag, so a column is as wide as what is in it.
 *
 * The lists down the left of the sector, subsector and system views hold names,
 * and a name is as long as the referee made it. A column fixed at what looked
 * right for the names the generator draws is a column that cuts theirs off, so
 * how wide it is is theirs to say.
 *
 * The width is remembered, because it is a choice about the window rather than
 * about any one sector: a referee who widened the list once meant it.
 */

/** How narrow the column may be dragged before it stops being a list. */
const LEAST = 150;

/**
 * What the rest of the view has to keep. The middle is the thing the view is
 * about and the panel on the right is the detail of what is picked: a drag that
 * squeezed either to nothing would have taken the view apart to fix a name.
 */
const KEEP_FOR_THE_REST = 520;

export interface GripParts {
  /** The bar being dragged. */
  readonly grip: HTMLElement;
  /** The grid whose first column the bar moves. */
  readonly frame: HTMLElement;
  /** Where the width is remembered. */
  readonly key: string;
  /** The width the column has before anybody moves it. */
  readonly start: number;
}

/**
 * How far right the bar can go in this window, which the window decides.
 *
 * A view that is not the one on screen has no width at all, and a width of
 * nothing would say every column must be the narrowest there is. Until a view is
 * shown there is nothing to measure and so nothing to hold the column back.
 */
function most(frame: HTMLElement): number {
  const width = frame.clientWidth;
  return width === 0 ? Number.POSITIVE_INFINITY : Math.max(LEAST, width - KEEP_FOR_THE_REST);
}

function stored(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const width = Number(raw);
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    // Storage refused, which costs the memory of the width and nothing else.
    return null;
  }
}

function remember(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // As above: the panel still resizes, it is only forgotten.
  }
}

/**
 * Hang a drag on a bar. The column follows the pointer, within what the window
 * leaves it, and the width outlives the session.
 */
export function makeGrip({ grip, frame, key, start }: GripParts): void {
  let width = stored(key) ?? start;

  const apply = (wanted: number, keep: boolean): void => {
    const ceiling = most(frame);
    width = Math.min(Math.max(wanted, LEAST), ceiling);
    frame.style.setProperty("--tree-width", `${Math.round(width)}px`);
    grip.setAttribute("aria-valuenow", String(Math.round(width)));
    grip.setAttribute("aria-valuemin", String(LEAST));
    // Only where there is one: an unshown view has no ceiling to announce, and
    // a screen reader told the maximum is Infinity has been told nothing.
    if (Number.isFinite(ceiling)) grip.setAttribute("aria-valuemax", String(Math.round(ceiling)));
    if (keep) remember(key, width);
  };

  apply(width, false);

  grip.addEventListener("pointerdown", (event: PointerEvent) => {
    // The pointer is held for the whole drag, so a hand that outruns the bar -
    // which every hand does - goes on moving it rather than dropping it.
    grip.setPointerCapture(event.pointerId);
    grip.classList.add("dragging");
    document.body.classList.add("resizing");
    const from = event.clientX;
    const was = width;

    const move = (held: PointerEvent): void => apply(was + (held.clientX - from), false);
    const done = (): void => {
      grip.classList.remove("dragging");
      document.body.classList.remove("resizing");
      grip.removeEventListener("pointermove", move);
      remember(key, width);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", done, { once: true });
    grip.addEventListener("pointercancel", done, { once: true });
    event.preventDefault();
  });

  // A bar that can only be dragged is a bar somebody cannot use. The arrows move
  // it a step at a time and Home puts it back where it started.
  grip.addEventListener("keydown", (event: KeyboardEvent) => {
    const step = event.shiftKey ? 48 : 12;
    if (event.key === "ArrowLeft") apply(width - step, true);
    else if (event.key === "ArrowRight") apply(width + step, true);
    else if (event.key === "Home") apply(start, true);
    else return;
    event.preventDefault();
  });

  // A window made narrower can leave the column wider than the window allows,
  // and the view would be the panel and nothing else. Watched on the view rather
  // than on the window because a view has no width until it is the one on
  // screen: this is also what measures the column the first time it is seen.
  new ResizeObserver(() => apply(width, false)).observe(frame);
}
