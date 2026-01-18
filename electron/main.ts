import { app, BrowserWindow, screen, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import {
  getSlackTokens,
  setSlackTokens,
  isSetupComplete,
  getRecentThreads,
  addRecentThread,
} from './store'
import { decryptEnvContent } from './decrypt'

// Window references
let controlWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null

// Constants
const OVERLAY_URL = 'http://localhost:8000'
const SERVER_PORT = 8000
const SERVER_STARTUP_TIMEOUT_MS = 30000
const SERVER_READY_FALLBACK_MS = 3000
const isDev = !app.isPackaged

// Get the base path for resources
function getBasePath(): string {
  if (isDev) {
    return path.join(__dirname, '..')
  }
  return path.join(process.resourcesPath, '..')
}

function getPublicPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'public')
  }
  return path.join(process.resourcesPath, '..', 'public')
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js')
}

// Create the control window (main GUI)
function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 380,
    minHeight: 480,
    resizable: true,
    title: 'Comment Overlay',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  })

  const htmlPath = path.join(getPublicPath(), 'control.html')
  win.loadFile(htmlPath)

  win.on('closed', () => {
    controlWindow = null
    // Stop server when control window is closed
    stopServer()
  })

  return win
}

// Create the setup window
function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 600,
    minWidth: 420,
    minHeight: 520,
    resizable: true,
    title: 'Comment Overlay - Setup',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
    },
  })

  const htmlPath = path.join(getPublicPath(), 'setup.html')
  win.loadFile(htmlPath)

  return win
}

// Create the overlay window (transparent, always on top)
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

  win.on('closed', () => {
    overlayWindow = null
  })

  return win
}

// Start the backend server
function startServer(threadUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tokens = getSlackTokens()

    if (!tokens.botToken || !tokens.appToken) {
      reject(new Error('Slack tokens not configured'))
      return
    }

    // Set environment variables for the server
    const env = {
      ...process.env,
      SLACK_BOT_TOKEN: tokens.botToken,
      SLACK_APP_TOKEN: tokens.appToken,
      PORT: String(SERVER_PORT),
    }

    // Determine server entry point
    let serverPath: string
    if (isDev) {
      // In dev, use tsx to run TypeScript directly
      serverPath = path.join(__dirname, '..', 'src', 'server.ts')
      serverProcess = spawn('npx', ['tsx', serverPath, threadUrl], {
        env,
        cwd: path.join(__dirname, '..'),
        shell: true,
      })
    } else {
      // In production, use compiled JavaScript
      serverPath = path.join(getBasePath(), 'dist', 'server.js')
      serverProcess = spawn('node', [serverPath, threadUrl], {
        env,
        cwd: getBasePath(),
      })
    }

    // Single state management to prevent race conditions
    let resolved = false

    const markStarted = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve()
    }

    const timeout = setTimeout(() => {
      if (!resolved) {
        reject(new Error('Server startup timeout'))
      }
    }, SERVER_STARTUP_TIMEOUT_MS)

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log('[Server]', output)

      // Check for server ready message
      if (output.includes('Server running') || output.includes('listening')) {
        markStarted()
      }
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Server Error]', data.toString())
    })

    serverProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })

    serverProcess.on('exit', (code) => {
      console.log('[Server] Process exited with code:', code)
      serverProcess = null

      if (controlWindow) {
        controlWindow.webContents.send('status-change', 'waiting')
      }
    })

    // Fallback: if server doesn't emit ready message, assume started after fallback delay
    setTimeout(() => {
      if (serverProcess) {
        markStarted()
      }
    }, SERVER_READY_FALLBACK_MS)
  })
}

// Stop the backend server
function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }

  if (overlayWindow) {
    overlayWindow.close()
    overlayWindow = null
  }
}

// Extract thread name from URL (simplified)
function getThreadNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const channelId = pathParts[2] || 'Unknown'
    const timestamp = pathParts[3] || ''

    // Format: #CHANNEL_ID (timestamp)
    const date = new Date()
    return `#${channelId} (${date.getMonth() + 1}/${date.getDate()})`
  } catch {
    return 'Unknown Thread'
  }
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Decrypt .env.encrypted file
  ipcMain.handle('decrypt-env-file', async (_event, encryptedBase64: string, password: string) => {
    return decryptEnvContent(encryptedBase64, password)
  })

  // Save tokens
  ipcMain.handle('save-tokens', async (_event, botToken: string, appToken: string) => {
    setSlackTokens(botToken, appToken)

    // Close setup window and open control window
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win !== controlWindow) {
        win.close()
      }
    })

    controlWindow = createControlWindow()
    return { success: true }
  })

  // Check if setup is complete
  ipcMain.handle('is-setup-complete', async () => {
    return isSetupComplete()
  })

  // Get recent threads
  ipcMain.handle('get-recent-threads', async () => {
    return getRecentThreads()
  })

  // Start overlay
  ipcMain.handle('start-overlay', async (_event, threadUrl: string) => {
    try {
      // Update status
      if (controlWindow) {
        controlWindow.webContents.send('status-change', 'connecting')
      }

      // Start server
      await startServer(threadUrl)

      // Create overlay window
      overlayWindow = createOverlayWindow()

      // Add to recent threads
      const threadName = getThreadNameFromUrl(threadUrl)
      addRecentThread(threadUrl, threadName)

      // Update status
      if (controlWindow) {
        controlWindow.webContents.send('status-change', 'connected')
      }

      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'

      if (controlWindow) {
        controlWindow.webContents.send('status-change', 'error')
      }

      return { success: false, error }
    }
  })

  // Stop overlay
  ipcMain.handle('stop-overlay', async () => {
    stopServer()
    return { success: true }
  })

  // Get app version
  ipcMain.handle('get-app-version', async () => {
    return app.getVersion()
  })

  // Check for updates
  ipcMain.handle('check-for-updates', async () => {
    if (!isDev) {
      try {
        await autoUpdater.checkForUpdatesAndNotify()
      } catch (err) {
        console.error('Update check failed:', err)
      }
    }
    return { success: true }
  })
}

// Auto-updater events
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    if (controlWindow) {
      controlWindow.webContents.send('update-available', info)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart now to install?`,
        buttons: ['Restart', 'Later'],
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })
}

// App lifecycle
app.whenReady().then(() => {
  setupIpcHandlers()
  setupAutoUpdater()

  // Show setup or control window based on setup state
  if (isSetupComplete()) {
    controlWindow = createControlWindow()
  } else {
    createSetupWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isSetupComplete()) {
        controlWindow = createControlWindow()
      } else {
        createSetupWindow()
      }
    }
  })
})

app.on('window-all-closed', () => {
  stopServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopServer()
})
