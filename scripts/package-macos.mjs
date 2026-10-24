// Package Call Sheet Biblical Cinema.app for macOS — no electron-builder, no downloads.
// Copies the local Electron runtime, rebrands the bundle (name, id, icon),
// drops the built app into Resources/app, and ad-hoc signs the result.
// Usage: node scripts/package-macos.mjs [--install]

import { execFileSync } from 'child_process'
import { cpSync, rmSync, mkdirSync, writeFileSync, renameSync, existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] })

const electronApp = resolve(root, 'node_modules/electron/dist/Electron.app')
const dist = resolve(root, 'dist')
const pkgVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version
const appPath = resolve(dist, 'Call Sheet Biblical Cinema.app')

if (!existsSync(resolve(root, 'out/main/index.js'))) {
  console.error('No build found — run `npm run build` first.')
  process.exit(1)
}

console.log('→ icns from build/icon.png (pure Node)')
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
// ICNS container: 'icns' magic + entries of [4-byte type][4-byte length][PNG bytes].
// 'ic10' = 1024×1024 PNG — sufficient on modern macOS, which downscales the rest.
{
  const png = readFileSync(resolve(root, 'build/icon.png'))
  const entry = Buffer.concat([Buffer.from('ic10'), u32(png.length + 8), png])
  const icns = Buffer.concat([Buffer.from('icns'), u32(entry.length + 8), entry])
  writeFileSync(resolve(dist, 'call-sheet.icns'), icns)
}
function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

console.log('→ copying Electron runtime')
run('ditto', [electronApp, appPath])

console.log('→ payload into Resources/app')
const res = resolve(appPath, 'Contents/Resources')
rmSync(resolve(res, 'default_app.asar'), { force: true })
const payload = resolve(res, 'app')
mkdirSync(payload, { recursive: true })
cpSync(resolve(root, 'out'), resolve(payload, 'out'), { recursive: true })
cpSync(resolve(root, 'build/icon.png'), resolve(payload, 'build/icon.png'), { recursive: true })
cpSync(resolve(root, 'data'), resolve(payload, 'data'), { recursive: true })
writeFileSync(
  resolve(payload, 'package.json'),
  JSON.stringify({ name: 'call-sheet-biblical-period', productName: 'Call Sheet Biblical Cinema', version: pkgVersion, main: 'out/main/index.js' }, null, 2)
)

console.log('→ rebranding bundle')
cpSync(resolve(dist, 'call-sheet.icns'), resolve(res, 'call-sheet.icns'))
rmSync(resolve(res, 'electron.icns'), { force: true })
const plist = resolve(appPath, 'Contents/Info.plist')
const pb = (args) => run('/usr/libexec/PlistBuddy', [...args, plist])
pb(['-c', 'Set :CFBundleName Call Sheet Biblical Cinema'])
pb(['-c', 'Set :CFBundleDisplayName Call Sheet Biblical Cinema'])
pb(['-c', 'Set :CFBundleIdentifier com.wassermanproductions.call-sheet.biblical'])
pb(['-c', 'Set :CFBundleIconFile call-sheet.icns'])
pb(['-c', 'Set :CFBundleExecutable Call Sheet'])
pb(['-c', 'Add :LSUIElement bool true'])
pb(['-c', `Set :CFBundleShortVersionString ${pkgVersion}`])
renameSync(resolve(appPath, 'Contents/MacOS/Electron'), resolve(appPath, 'Contents/MacOS/Call Sheet'))

console.log('→ ad-hoc signing')
// Electron.app may inherit Finder metadata/resource forks from the npm cache.
// codesign rejects those extended attributes, so clear them from the copied
// bundle before applying the release signature.
run('xattr', ['-cr', appPath])
run('codesign', ['--force', '--deep', '--sign', '-', appPath])

if (process.argv.includes('--install')) {
  console.log('→ installing to /Applications/Call Sheet Biblical Cinema.app')
  rmSync('/Applications/Call Sheet Biblical Cinema.app', { recursive: true, force: true })
  run('ditto', [appPath, '/Applications/Call Sheet Biblical Cinema.app'])
}

console.log('✓ packaged', appPath)
