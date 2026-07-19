import { app, BrowserWindow, screen } from 'electron'
import resolvePort from '../shared/resolvePort.cjs'

// シグナルハンドリング: グレースフルシャットダウン
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing...')
  app.quit()
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// セキュリティ: ホストは localhost 固定。ポートのみ環境変数 OVERLAY_PORT で変更可能とし、
// 数値以外（外部URL注入など）は受け付けずデフォルトにフォールバックする。
const overlayPort = resolvePort(process.env['OVERLAY_PORT'], 8000)
const OVERLAY_URL = `http://localhost:${overlayPort}`

function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadURL(OVERLAY_URL)

  return win
}

app.whenReady().then(() => {
  createOverlayWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
