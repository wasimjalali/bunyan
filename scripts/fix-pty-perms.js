// Ensure node-pty's macOS spawn-helper is executable.
//
// node-pty execs a small `spawn-helper` binary to open a pty. Some installs of
// node-pty land that binary without the execute bit (mode 644). When that
// happens `posix_spawnp` fails with EACCES, node-pty's spawn() throws, and every
// session dies with "Could not start the session" - in dev and in the packaged
// app alike. This restores the bit after install so sessions can spawn.
//
// Idempotent. No-op off macOS. Run from postinstall and before packaging.
const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'darwin') process.exit(0)

const ptyRoot = path.join(__dirname, '..', 'node_modules', 'node-pty')
// Every place node-pty's loader looks for the native module (and so for the
// spawn-helper beside it). We touch all that exist; missing ones are fine.
const candidates = [
  'prebuilds/darwin-arm64/spawn-helper',
  'prebuilds/darwin-x64/spawn-helper',
  'build/Release/spawn-helper',
  'build/Debug/spawn-helper',
].map((rel) => path.join(ptyRoot, rel))

let fixed = 0
for (const helper of candidates) {
  try {
    fs.chmodSync(helper, 0o755)
    fixed++
  } catch (err) {
    // The binary for an arch we didn't install simply isn't here; anything else
    // is a real problem and should surface.
    if (err.code !== 'ENOENT') throw err
  }
}

console.log(`fix-pty-perms: set execute bit on ${fixed} spawn-helper binary(ies)`)
