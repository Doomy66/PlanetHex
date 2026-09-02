// Turns build/icon.svg into build/icon.ico. Run with `npm run icon`.
//
// Electron does the rasterising, since it is already a dependency and it is the
// same renderer that will draw the app. There is no SVG toolchain to install.
//
// Windows wants several sizes in one file: the taskbar takes 32, Explorer's
// large view takes 256, and the alt-tab list sits in between. An .ico is a
// small header plus one PNG per size, so it is written out by hand below rather
// than pulling in an image library.

const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SIZES = [256, 128, 64, 48, 32, 16];
const SVG = path.join(__dirname, "icon.svg");
const ICO = path.join(__dirname, "icon.ico");
const PNG = path.join(__dirname, "icon.png");

/** Pack PNG buffers into an .ico. A size of 256 is stored as 0 in the byte. */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = header.length + dirSize;
  const dir = [];
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette colours
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG, "utf8");
  // Render at double the largest size, then downsample. Windows draws the
  // 16 and 32 pixel icons most often, and they hold up better coming down from
  // a large render than being rasterised straight at that size.
  const render = 512;
  // Offscreen rendering, so nothing flashes on screen and nothing depends on a
  // real window being composited. It hands frames straight to the paint event.
  const win = new BrowserWindow({
    width: render,
    height: render,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setFrameRate(1);

  const page = `<style>
      html, body { margin: 0; height: 100%; background: transparent; }
      svg { display: block; width: 100vw; height: 100vh; }
    </style>${svg}`;
  // Take the first painted frame, and never let a stalled render hang the build.
  const painted = new Promise((resolve, reject) => {
    win.webContents.once("paint", (_event, _dirty, image) => resolve(image));
    setTimeout(() => reject(new Error("no frame painted")), 20000);
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
  const shot = await painted;

  if (shot.isEmpty()) {
    console.error("capture came back empty");
    app.exit(1);
    return;
  }
  fs.writeFileSync(PNG, shot.toPNG());

  const entries = SIZES.map((size) => ({
    size,
    png: nativeImage
      .createFromBuffer(shot.toPNG())
      .resize({ width: size, height: size, quality: "best" })
      .toPNG(),
  }));

  fs.writeFileSync(ICO, buildIco(entries));
  console.log(`Wrote ${ICO} (${SIZES.join(", ")}) and ${PNG}`);
  app.exit(0);
});
