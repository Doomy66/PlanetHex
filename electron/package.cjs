// Runs electron-builder with the output directory on an NTFS volume.
//
// The project lives on D:, which is ReFS. Part way through packaging,
// electron-builder extracts Electron to release/win-unpacked.tmp and renames it
// to release/win-unpacked. ReFS refuses that rename with EPERM while the
// extractor still holds the directory open; NTFS allows it. So the build output
// goes elsewhere rather than next to the source.
//
// Set PLANETHEX_OUT to put the exe somewhere else. On an NTFS checkout, that can
// be a plain `release` beside the project.

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

const out =
  process.env.PLANETHEX_OUT ||
  path.join(process.env.LOCALAPPDATA || os.tmpdir(), "PlanetHex", "release");

console.log(`Packaging into ${out}`);

// Run the CLI through this same node, rather than a shell wrapper, so the
// script does not care which shell invoked it.
// --publish never because electron-builder publishes of its own accord when it
// finds itself on a git tag, and then fails for want of a token it was never
// given. Releasing is the release workflow's job: it attaches the exe with gh
// once the build has succeeded. See .github/workflows/release.yml.
const cli = require.resolve("electron-builder/cli.js");
const result = spawnSync(process.execPath, [cli, `-c.directories.output=${out}`, "--publish", "never"], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
