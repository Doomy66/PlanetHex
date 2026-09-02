// The desktop shell. There is no server here: `vite build` writes static files
// into dist/, and this process serves them to the window over a custom scheme.
//
// The scheme exists because Chromium refuses `<script type="module">` from a
// file:// origin, which is what Vite's output is. Registering app:// as
// standard and secure gives the page a real origin instead of a null one, which
// module loading needs and the File System Access API of src/io/files.ts wants.

const { app, BrowserWindow, dialog, protocol, net, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "dist");
const START = "app://bundle/index.html";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/**
 * Map an app:// URL onto a file in dist/, refusing anything that climbs out of
 * it. `path.resolve` collapses the ../ before the check, so a crafted URL
 * cannot reach the rest of the disk.
 */
function resolveWithin(pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = path.resolve(DIST, "." + decoded);
  const root = path.resolve(DIST);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function createWindow() {
  // A packaged build takes its icon from the executable. This is for
  // `npm run desktop`, which has no executable of its own to take it from.
  const icon = path.join(__dirname, "..", "build", "icon.ico");

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: false,
    backgroundColor: "#101014",
    title: "PlanetHex",
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The window is built hidden so it does not flash unpainted, and then shown by
  // whichever of these comes first. ready-to-show on its own is not enough: it
  // does not fire if the first paint never arrives, and the app is then running
  // with no window and no way to reach it.
  const reveal = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once("ready-to-show", reveal);
  win.webContents.once("did-finish-load", reveal);
  const failsafe = setTimeout(reveal, 5000);
  win.once("closed", () => clearTimeout(failsafe));
  win.setMenuBarVisibility(false);

  // The unsaved-changes warning of Spec 6.4.4.3.1.
  //
  // src/main.ts cancels the unload while the planet has unsaved edits. A browser
  // answers that with its own Leave site? dialog; Chromium embedded has no such
  // dialog and hands the decision here instead. An embedder that does not listen
  // leaves the cancel standing with nothing said, and the window then ignores the
  // close button, which is the application ignoring the user.
  //
  // preventDefault here means let the unload through, which is the opposite of
  // how it reads: the event being prevented is the page's refusal, not the close.
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      title: "PlanetHex",
      message: "This planet has unsaved changes.",
      detail: "Close it and lose them?",
      buttons: ["Close without saving", "Cancel"],
      // Cancel is the safe one, so it is what Enter and Escape both land on.
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (choice === 0) event.preventDefault();
  });

  // Anything that is not the application itself belongs in the user's browser,
  // not in a chromeless Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(START);
  return win;
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const target = resolveWithin(new URL(request.url).pathname);
    if (!target) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
