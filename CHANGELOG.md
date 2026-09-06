# Version history

The version in [package.json](package.json) is what the Windows installer of
`npm run package` names itself after, so it is the one number that reaches a
user. Dates are the day the release was tagged.

## 1.0.1 — 2026-09-06

- **Saving and loading no longer need Chromium.** The File System Access API is
  still used where it exists, because writing a folder in place and rewriting it
  on the next Save is the better behaviour. Where it is missing the same five
  files — the planet's JSON and the map at each of the four detail levels —
  arrive as a single zip download instead, and Load accepts either that zip or
  the JSON inside it. Firefox and Safari can now run the application in full.
- The status line says which of the two paths is in use, rather than the
  application failing at the moment the user clicks Save.
- README documents the two save paths, what publishing `dist/` to a static host
  involves, and the Traveller SRD and trademark position.

## 1.0.0 — 2026-09-02

- **The desktop build installs itself** rather than unpacking the whole
  application on every launch, which is what made the first start slow.
- First release considered finished rather than in progress.

## 0.2.0 — 2026-09-02

- The starport moves when the world is rerolled, instead of staying on a hex
  that the new surface may have put under water.
- The window closes when asked. Embedded Chromium has no `Leave site?` dialog of
  its own, so the shell now answers `beforeunload` itself.

## 0.1.0 — 2026-09-02

Initial release. One world seen two ways at once — the flat hex map on the
icosahedral net and the turning globe — at four detail levels, driven by a UWP
rolled to Traveller's world creation rules and editable digit by digit.
