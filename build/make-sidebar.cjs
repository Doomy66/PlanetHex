// Draws build/installerSidebar.bmp for the installer. Run with `npm run sidebar`.
//
// NSIS puts this panel down the left of the welcome and finish pages, so it is
// the first thing a user sees of the application. It has to be an uncompressed
// BMP of exactly 164x314: the installer draws it at that size and stretches
// anything else.
//
// Electron does the drawing, as it does for the icon in make-icon.cjs, so there
// is no image toolchain to install. The BMP is written out by hand below.

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Fixed by NSIS, not by us.
const WIDTH = 164;
const HEIGHT = 314;
const BMP = path.join(__dirname, "installerSidebar.bmp");

/**
 * A 24 bit uncompressed BMP from Electron's BGRA bitmap.
 *
 * BMP rows run bottom to top and each is padded to a multiple of four bytes.
 * Alpha is dropped: the sidebar is an opaque panel and the installer does
 * nothing with a transparency channel.
 */
function buildBmp(bgra, width, height) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = row + x * 3;
      pixels[to] = bgra[from]; // blue
      pixels[to + 1] = bgra[from + 1]; // green
      pixels[to + 2] = bgra[from + 2]; // red
    }
  }

  const header = Buffer.alloc(14);
  header.write("BM", 0, "ascii");
  header.writeUInt32LE(14 + 40 + pixels.length, 2);
  header.writeUInt32LE(14 + 40, 10);

  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0);
  info.writeInt32LE(width, 4);
  info.writeInt32LE(height, 8);
  info.writeUInt16LE(1, 12); // planes
  info.writeUInt16LE(24, 14); // bits per pixel
  info.writeUInt32LE(pixels.length, 20);

  return Buffer.concat([header, info, pixels]);
}

// The palette is the application's own, from src/style.css, so the installer
// looks like the front of the program rather than like a generic setup.
const PAGE = `<style>
    html, body { margin: 0; height: 100%; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      padding: 0 14px;
      background: #14161a;
      color: #dfe3ea;
      font: 13px/1.45 "Segoe UI", system-ui, sans-serif;
      text-align: center;
      box-sizing: border-box;
    }
    h1 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: 0.05em; }
    p { margin: 0; color: #8b93a1; font-size: 11px; }
    svg { display: block; }
  </style>
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e0b341"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18v-5l4 -2l4 2v5l-4 2l-4 -2" />
    <path d="M8 11v-5l4 -2l4 2v5" />
    <path d="M12 13l4 -2l4 2v5l-4 2l-4 -2" />
  </svg>
  <h1>PlanetHex</h1>
  <p>Planet surfaces as a hex map and a globe.</p>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setFrameRate(1);

  const painted = new Promise((resolve, reject) => {
    win.webContents.once("paint", (_event, _dirty, image) => resolve(image));
    setTimeout(() => reject(new Error("no frame painted")), 20000);
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(PAGE));
  const shot = await painted;

  if (shot.isEmpty()) {
    console.error("capture came back empty");
    app.exit(1);
    return;
  }

  const { width, height } = shot.getSize();
  if (width !== WIDTH || height !== HEIGHT) {
    console.error(`capture is ${width}x${height}, and NSIS wants ${WIDTH}x${HEIGHT}`);
    app.exit(1);
    return;
  }
  fs.writeFileSync(BMP, buildBmp(shot.toBitmap(), width, height));
  console.log(`Wrote ${BMP} (${width}x${height})`);
  app.exit(0);
});
