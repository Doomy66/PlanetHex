// Turns the splash below into build/splash.bmp. Run with `npm run splash`.
//
// The portable executable is a self-extracting archive: it unpacks the whole
// application into a temp folder and only then starts it. Nothing of ours is
// running during that wait, so nothing of ours can say anything about it. The
// one thing that can is the extractor, which will show a bitmap if it is given
// one. Hence a picture rather than a message: there is no process of ours alive
// to write a message with.
//
// Electron does the drawing, as it does for the icon in make-icon.cjs, so there
// is no image toolchain to install. NSIS wants an uncompressed BMP, which is
// written out by hand at the foot of this file.

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const WIDTH = 420;
const HEIGHT = 240;
const BMP = path.join(__dirname, "splash.bmp");

/**
 * A 24 bit uncompressed BMP from Electron's BGRA bitmap.
 *
 * BMP rows run bottom to top and each is padded to a multiple of four bytes.
 * Alpha is dropped: the splash sits on the desktop as an opaque rectangle, and
 * the extractor does nothing with a transparency channel.
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

// The palette is the application's own, from src/style.css, so the wait looks
// like the front of the program rather than like something else starting.
const PAGE = `<style>
    html, body { margin: 0; height: 100%; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      background: #14161a;
      color: #dfe3ea;
      font: 15px/1.5 "Segoe UI", system-ui, sans-serif;
      border: 1px solid #2e333c;
      box-sizing: border-box;
    }
    h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.06em; }
    p { margin: 0; color: #8b93a1; font-size: 13px; }
    svg { display: block; }
  </style>
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#e0b341"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18v-5l4 -2l4 2v5l-4 2l-4 -2" />
    <path d="M8 11v-5l4 -2l4 2v5" />
    <path d="M12 13l4 -2l4 2v5l-4 2l-4 -2" />
  </svg>
  <h1>PlanetHex</h1>
  <p>Unpacking the application. This takes a moment.</p>`;

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
  fs.writeFileSync(BMP, buildBmp(shot.toBitmap(), width, height));
  console.log(`Wrote ${BMP} (${width}x${height})`);
  app.exit(0);
});
