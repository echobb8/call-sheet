// Call Sheet — menu-bar mission control for Wasserman's Filmmaker Suite.

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { DashboardState, SuiteApp } from '../shared/types'
import { buildStatuses, appPath } from './status'
import { allRecents } from './recents'

const SUITE_HUB = 'https://github.com/wassermanproductions/wassermans-filmmaker-suite'

let tray: Tray | null = null
let win: BrowserWindow | null = null
let registry: SuiteApp[] = []

function loadRegistry(): SuiteApp[] {
  const file = app.isPackaged
    ? join(process.resourcesPath, 'app', 'data', 'apps.json')
    : join(app.getAppPath(), 'data', 'apps.json')
  return JSON.parse(readFileSync(file, 'utf8'))
}

async function currentState(refresh: boolean): Promise<DashboardState> {
  const [{ apps, offline }, recents] = await Promise.all([
    buildStatuses(registry, refresh),
    allRecents(registry)
  ])
  return { apps, recents, checkedAt: new Date().toISOString(), offline }
}

function createWindow(): BrowserWindow {
  const snapH = Number(process.env.CALLSHEET_SNAP_H) || 0
  const w = new BrowserWindow({
    width: 980,
    height: snapH || 700,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Call Sheet',
    backgroundColor: '#0d0f14',
    titleBarStyle: 'hiddenInset',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), backgroundThrottling: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'))
  }
  w.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.on('close', (e) => {
    // Menu-bar app: closing the window hides it, Quit lives in the tray.
    if (!quitting) {
      e.preventDefault()
      w.hide()
    }
  })
  return w
}

let quitting = false

function showWindow(): void {
  if (!win || win.isDestroyed()) win = createWindow()
  win.show()
  win.focus()
}

// 18pt template glyph — a clapper sticks over a sheet, drawn as raw ARGB.
function trayIcon(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <g fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="13" width="24" height="17" rx="2"/>
      <path d="M6 13 L28 6 L30 12 L8 19 Z" fill="black" stroke="none"/>
      <path d="M12 30 v-6 M18 30 v-6 M24 30 v-6" stroke-width="2.4" opacity="0.85"/>
    </g>
  </svg>`
  const img = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  )
  const sized = img.resize({ width: 18, height: 18 })
  sized.setTemplateImage(true)
  return sized
}

async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return
  const { apps } = await buildStatuses(registry)
  const launchItems = apps
    .filter((a) => a.installed)
    .map((a) => ({
      label: a.updateAvailable ? `${a.name}  ↑ ${a.latestVersion}` : a.name,
      click: () => void shell.openPath(appPath(registry.find((r) => r.id === a.id)!))
    }))
  const menu = Menu.buildFromTemplate([
    { label: 'Open Call Sheet', click: showWindow },
    { type: 'separator' },
    ...launchItems,
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { label: 'Suite on GitHub', click: () => void shell.openExternal(SUITE_HUB) },
    { label: 'Support on Ko-fi ♥', click: () => void shell.openExternal('https://ko-fi.com/samwasserman') },
    { label: 'wassermanproductions.com', click: () => void shell.openExternal('https://wassermanproductions.com') },
    { label: 'wasserman.ai', click: () => void shell.openExternal('https://wasserman.ai') },
    { type: 'separator' },
    {
      label: 'Quit Call Sheet',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

app.whenReady().then(async () => {
  app.setName('Call Sheet')
  registry = loadRegistry()

  if (!process.env.CALLSHEET_SNAP_OUT) {
    tray = new Tray(trayIcon())
    tray.setToolTip('Call Sheet — Filmmaker Suite')
    void rebuildTrayMenu()
  }

  win = createWindow()
  if (!process.env.CALLSHEET_START_HIDDEN && !process.env.CALLSHEET_SNAP_OUT) showWindow()

  // Headless capture for docs: CALLSHEET_SNAP_OUT=<file.png> renders the
  // dashboard offscreen, waits for state to paint, snaps, and quits.
  if (process.env.CALLSHEET_SNAP_OUT && win) {
    const out = process.env.CALLSHEET_SNAP_OUT
    setTimeout(async () => {
      try {
        const img = await win!.webContents.capturePage()
        const { writeFileSync } = await import('fs')
        writeFileSync(out, img.toPNG())
        console.log(`snap → ${out}`)
      } finally {
        quitting = true
        app.quit()
      }
    }, 5000)
  }

  // Refresh the tray's update arrows hourly.
  setInterval(() => void rebuildTrayMenu(), 60 * 60 * 1000)
})

app.on('window-all-closed', () => {
  /* keep running in the menu bar */
})

app.on('before-quit', () => {
  quitting = true
})

app.on('activate', showWindow)

// ---- IPC ----

ipcMain.handle('state:get', async (_e, refresh?: boolean) => currentState(Boolean(refresh)))

ipcMain.handle('app:launch', async (_e, appId: string) => {
  const entry = registry.find((a) => a.id === appId)
  if (!entry) return { ok: false, error: 'Unknown app' }
  const err = await shell.openPath(appPath(entry))
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('app:openRepo', async (_e, appId: string) => {
  const entry = registry.find((a) => a.id === appId)
  if (entry?.repo) await shell.openExternal(`https://github.com/wassermanproductions/${entry.repo}`)
})

ipcMain.handle('app:openLatest', async (_e, appId: string) => {
  const entry = registry.find((a) => a.id === appId)
  if (!entry?.repo) return
  await shell.openExternal(`https://github.com/wassermanproductions/${entry.repo}/releases/latest`)
})

ipcMain.handle('path:reveal', async (_e, path: string) => {
  shell.showItemInFolder(path)
})

ipcMain.handle('hub:open', async () => {
  await shell.openExternal(SUITE_HUB)
})

ipcMain.handle('login:get', () => app.getLoginItemSettings().openAtLogin)
ipcMain.handle('login:set', (_e, open: boolean) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(open) })
})
