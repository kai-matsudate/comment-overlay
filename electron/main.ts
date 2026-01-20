import { app, BrowserWindow, screen } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import http from 'http'
import path from 'path'

// シグナルハンドリング: グレースフルシャットダウン
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing...')
  cleanupAndQuit()
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// セキュリティ: 固定URLのみ許可（環境変数経由の外部URL注入を防止）
const SETUP_URL = 'http://localhost:8001'
const OVERLAY_URL = 'http://localhost:8000'

// プロセス管理
let setupServerProcess: ChildProcess | null = null
let setupWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let overlayPollingInterval: ReturnType<typeof setInterval> | null = null

/**
 * Setup Serverを子プロセスとして起動
 * - 開発時: npx tsx でTypeScriptソースを実行
 * - 本番時: node でコンパイル済みJSを実行
 */
function startSetupServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string
    let args: string[]
    let cwd: string

    if (app.isPackaged) {
      // パッケージ済みアプリ: コンパイル済みJSを node で実行
      // asarUnpack で展開されたファイルは app.asar.unpacked に配置される
      // 注意: macOS Hardened Runtime の制限により ELECTRON_RUN_AS_NODE が使えないため、
      //       システムの node を使用する（Node.js がインストールされている必要あり）
      const resourcesPath = process.resourcesPath
      const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked')
      command = 'node'
      args = [
        path.join(unpackedPath, 'dist', 'setup', 'setupServer.js'),
      ]
      // asarUnpack で展開されたディレクトリを作業ディレクトリにする
      cwd = unpackedPath
    } else {
      // 開発モード: TypeScriptソースを tsx で実行
      const projectRoot = path.join(__dirname, '..')
      command = 'npx'
      args = ['tsx', 'src/setup/setupServer.ts']
      cwd = projectRoot
    }

    setupServerProcess = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        // パッケージ済みアプリの場合、子プロセスにも伝達
        ...(app.isPackaged && {
          PACKAGED_APP: '1',
          PACKAGED_APP_UNPACKED_PATH: path.join(process.resourcesPath, 'app.asar.unpacked'),
        }),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let started = false

    const onData = (data: Buffer) => {
      const output = data.toString()
      console.log('[Setup Server]', output.trim())
      if (output.includes('Comment Overlay Setup Server') && !started) {
        started = true
        resolve()
      }
    }

    setupServerProcess.stdout?.on('data', onData)
    setupServerProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Setup Server Error]', data.toString().trim())
    })

    setupServerProcess.on('error', (err) => {
      if (!started) {
        reject(new Error(`Setup Server failed to start: ${err.message}`))
      }
    })

    setupServerProcess.on('exit', (code) => {
      if (!started && code !== 0) {
        reject(new Error(`Setup Server exited with code ${code}`))
      }
    })

    // タイムアウト: 30秒
    setTimeout(() => {
      if (!started) {
        reject(new Error('Setup Server startup timeout'))
      }
    }, 30000)
  })
}

/**
 * Setup Windowを作成
 */
function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Comment Overlay - Setup',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(SETUP_URL)

  win.on('closed', () => {
    setupWindow = null
    // Setup Windowが閉じられたらアプリ全体を終了
    cleanupAndQuit()
  })

  return win
}

/**
 * Overlay Windowを作成（全画面透過オーバーレイ）
 */
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

/**
 * Overlay Serverの起動を検知するためのポーリング
 */
function startOverlayPolling(): void {
  if (overlayPollingInterval) {
    clearInterval(overlayPollingInterval)
  }

  overlayPollingInterval = setInterval(() => {
    // 既にOverlay Windowが存在する場合はスキップ
    if (overlayWindow) {
      return
    }

    // Overlay Serverにヘルスチェック
    const req = http.get(OVERLAY_URL, (res) => {
      if (res.statusCode === 200) {
        console.log('Overlay Server detected, creating Overlay Window...')
        overlayWindow = createOverlayWindow()
      }
    })

    req.on('error', () => {
      // Overlay Serverがまだ起動していない場合は無視
    })

    req.setTimeout(1000, () => {
      req.destroy()
    })
  }, 1000)
}

/**
 * Overlay Serverの停止を検知するためのポーリング（既存のOverlay Windowを閉じる）
 */
function checkOverlayServerDown(): void {
  if (!overlayWindow) {
    return
  }

  const req = http.get(OVERLAY_URL, () => {
    // サーバーが応答している間は何もしない
  })

  req.on('error', () => {
    // サーバーが停止した場合、Overlay Windowを閉じる
    if (overlayWindow) {
      console.log('Overlay Server stopped, closing Overlay Window...')
      overlayWindow.close()
      overlayWindow = null
    }
  })

  req.setTimeout(1000, () => {
    req.destroy()
  })
}

/**
 * クリーンアップしてアプリを終了
 */
function cleanupAndQuit(): void {
  // ポーリングを停止
  if (overlayPollingInterval) {
    clearInterval(overlayPollingInterval)
    overlayPollingInterval = null
  }

  // Setup Serverを終了
  if (setupServerProcess && !setupServerProcess.killed) {
    setupServerProcess.kill('SIGTERM')
    setupServerProcess = null
  }

  // Electronを終了
  app.quit()
}

// メイン処理
app.whenReady().then(async () => {
  try {
    console.log('Starting Comment Overlay Desktop App...')

    // Setup Serverを起動
    await startSetupServer()

    // Setup Windowを作成
    setupWindow = createSetupWindow()

    // Overlay Serverのポーリングを開始
    startOverlayPolling()

    // 定期的にOverlay Serverの状態をチェック（停止検知用）
    setInterval(checkOverlayServerDown, 2000)
  } catch (error) {
    console.error('Failed to start:', error)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  cleanupAndQuit()
})
