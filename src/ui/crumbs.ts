/**
 * The trail across the top of every level: Sector, Subsector, System, Planet.
 * AppSpec 6.2.
 *
 * The four levels are always all four, whether they are open or not, so that the
 * window says where what you are looking at sits even when you came in at the
 * bottom. A level that is open is named and can be gone back to; a level that is
 * not is greyed, because a planet rolled on its own is not in any subsector and
 * pretending otherwise would invent a place.
 */

export const LEVELS = ["sector", "subsector", "system", "planet"] as const;

export type Level = (typeof LEVELS)[number];

/** What a level is called on the bar. Absent means the level is not open. */
export type Trail = Partial<Record<Level, string>>;

const WORD: Record<Level, string> = {
  sector: "Sector",
  subsector: "Subsector",
  system: "System",
  planet: "Planet",
};

export interface Crumbs {
  readonly element: HTMLElement;
  render(trail: Trail, current: Level | null): void;
  onGo(handler: (level: Level) => void): void;
}

/**
 * One bar. There is one of these in each level's header rather than one shared
 * across the window, because each level lays its own header out; they are all
 * drawn from the same trail, so they always say the same thing.
 */
export function createCrumbs(): Crumbs {
  const nav = document.createElement("nav");
  nav.className = "crumbs";
  nav.setAttribute("aria-label", "Levels");
  const handlers: ((level: Level) => void)[] = [];

  function render(trail: Trail, current: Level | null): void {
    nav.replaceChildren();
    for (const [at, level] of LEVELS.entries()) {
      if (at > 0) {
        const tick = document.createElement("span");
        tick.className = "crumb-tick";
        tick.setAttribute("aria-hidden", "true");
        tick.textContent = "›";
        nav.append(tick);
      }
      const name = trail[level];
      const open = name !== undefined && name !== "";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "crumb";
      button.textContent = open ? name : WORD[level];
      button.title = open ? `${WORD[level]} — ${name}` : `No ${WORD[level].toLowerCase()} open`;
      // The level being looked at is where you already are, and a level that is
      // not open has nothing to go to.
      button.disabled = !open || level === current;
      if (level === current) button.setAttribute("aria-current", "true");
      if (!open) button.classList.add("crumb-shut");
      button.addEventListener("click", () => {
        for (const handler of handlers) handler(level);
      });
      nav.append(button);
    }
  }

  render({}, null);
  return {
    element: nav,
    render,
    onGo(handler) {
      handlers.push(handler);
    },
  };
}
