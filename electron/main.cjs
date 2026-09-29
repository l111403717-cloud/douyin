const { app, BrowserWindow, BaseWindow, WebContentsView, dialog, ipcMain, session, safeStorage } = require('electron')
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const net = require('net')

const BACKEND_PORT = process.env.SAU_BACKEND_PORT || '5409'
let backendProcess = null
let mainWindow = null
let douyinWindow = null
let douyinView = null
const backendInstanceToken = crypto.randomUUID()

function writeLog(message) {
  try {
    const logDir = app.isReady() ? app.getPath('userData') : __dirname
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(
      path.join(logDir, 'desktop.log'),
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8'
    )
  } catch {
    // Logging must not crash the desktop shell.
  }
}

function getAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend-source')
  }
  return path.join(__dirname, '..')
}

function getBackendExecutable() {
  if (!app.isPackaged) {
    return null
  }
  const exe = path.join(process.resourcesPath, 'backend-runtime', 'sau_backend.exe')
  return fs.existsSync(exe) ? exe : null
}

function getBackendDataDir() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'backend-data')
  }
  return getAppRoot()
}

function getPlaywrightBrowsersPath() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'ms-playwright')
    const chromium = path.join(bundled, 'chromium-1169', 'chrome-win', 'chrome.exe')
    const headless = path.join(
      bundled, 'chromium_headless_shell-1169', 'chrome-win', 'headless_shell.exe'
    )
    return fs.existsSync(chromium) && fs.existsSync(headless) ? bundled : null
  }
  const candidates = [
    path.join(getAppRoot(), 'ms-playwright'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    process.env.PLAYWRIGHT_BROWSERS_PATH
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }
    const hasBrowser = fs.readdirSync(candidate).some((name) => /^(chromium|firefox|webkit)-/.test(name))
    if (hasBrowser) {
      return candidate
    }
  }
  return null
}

function getBundledFfmpegDir() {
  const candidate = path.join(process.resourcesPath, 'ms-playwright', 'ffmpeg-1011')
  return app.isPackaged && fs.existsSync(candidate) ? candidate : null
}

function getBundledHuggingFaceHome() {
  const candidate = path.join(process.resourcesPath, 'huggingface')
  return app.isPackaged && fs.existsSync(candidate) ? candidate : null
}

function ensureBackendDataDir() {
  const dataDir = getBackendDataDir()
  for (const name of ['db', 'cookies', 'cookiesFile', 'videoFile', 'videos', 'logs']) {
    fs.mkdirSync(path.join(dataDir, name), { recursive: true })
  }
  const settingsPath = path.join(dataDir, 'settings.json')
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({
      codexCliPath: '',
      codexAnalysisModel: 'gpt-5.4-mini',
      codexAnalysisTimeout: 180,
      hermes: {
        gatewayUrl: 'http://127.0.0.1:8642',
        apiKey: '',
        timeout: 300
      },
      agentModels: [],
      taskModels: {
        viralAnalysis: ''
      }
    }, null, 2), 'utf8')
  }
  return dataDir
}

function getPythonCommand(root) {
  const candidates = [
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    process.env.PYTHON,
    'D:\\python\\python.exe',
    'python'
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue
    const probe = spawnSync(candidate, ['-c', 'from flask import Blueprint'], {
      cwd: root,
      windowsHide: true,
      timeout: 5000,
      stdio: 'ignore'
    })
    if (probe.status === 0) return candidate
  }
  return 'python'
}

function startBackend() {
  const root = getAppRoot()
  const backendExecutable = getBackendExecutable()
  const dataDir = ensureBackendDataDir()
  const playwrightBrowsersPath = getPlaywrightBrowsersPath()
  const env = {
    ...process.env,
    SAU_APP_DIR: root,
    SAU_BASE_DIR: dataDir,
    SAU_BACKEND_PORT: BACKEND_PORT,
    SAU_INSTANCE_TOKEN: backendInstanceToken,
    SAU_PACKAGED: app.isPackaged ? '1' : '0'
  }
  if (playwrightBrowsersPath) {
    env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersPath
    env.SAU_BUNDLED_PLAYWRIGHT_PATH = playwrightBrowsersPath
  }
  const bundledFfmpegDir = getBundledFfmpegDir()
  if (bundledFfmpegDir) {
    env.SAU_FFMPEG_DIR = bundledFfmpegDir
    env.PATH = `${bundledFfmpegDir}${path.delimiter}${env.PATH || ''}`
  }
  const bundledHuggingFaceHome = getBundledHuggingFaceHome()
  if (bundledHuggingFaceHome) {
    env.HF_HOME = bundledHuggingFaceHome
    env.HUGGINGFACE_HUB_CACHE = path.join(bundledHuggingFaceHome, 'hub')
  }

  writeLog(`Starting backend. packaged=${app.isPackaged}, dataDir=${dataDir}`)

  if (backendExecutable) {
    writeLog(`Using backend executable: ${backendExecutable}`)
    backendProcess = spawn(backendExecutable, [], {
      cwd: path.dirname(backendExecutable),
      env,
      windowsHide: true,
      stdio: 'ignore'
    })
  } else {
    const python = getPythonCommand(root)
    const backendEntry = path.join(root, 'sau_koubo_server.py')
    writeLog(`Using python backend: ${python} ${backendEntry}`)
    backendProcess = spawn(python, [backendEntry], {
      cwd: root,
      env,
      windowsHide: true,
      stdio: app.isPackaged ? 'ignore' : 'inherit'
    })
  }

  backendProcess.on('error', (error) => {
    writeLog(`Backend start failed: ${error.stack || error.message}`)
    dialog.showErrorBox('后端启动失败', error.message)
  })

  backendProcess.on('exit', (code) => {
    writeLog(`Backend exited with code: ${code}`)
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox('后端已退出', `本地服务异常退出，退出码：${code}`)
    }
  })
}

async function waitForBackend(retries = 60) {
  const url = `http://127.0.0.1:${BACKEND_PORT}/auth/login`
  for (let index = 0; index < retries; index += 1) {
    try {
      const response = await fetch(url, { method: 'OPTIONS' })
      if (response.ok || [200, 204, 400, 405].includes(response.status)) {
        writeLog(`Backend instance is reachable with status ${response.status}`)
        return true
      }
    } catch (error) {
      if (index === retries - 1) {
        writeLog(`Backend wait failed: ${error.message}`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

function isBackendPortAvailable() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(Number(BACKEND_PORT), '127.0.0.1')
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: '抖音对标',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  mainWindow = win

  if (process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL)
    return
  }

  win.loadFile(path.join(__dirname, '..', 'sau_frontend', 'dist', 'index.html'))
}

function isAllowedDouyinUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    return hostname === 'douyin.com' || hostname.endsWith('.douyin.com') ||
      hostname.endsWith('.douyincdn.com') || hostname.endsWith('.byteimg.com') ||
      hostname.endsWith('.pstatp.com') || hostname.endsWith('.snssdk.com')
  } catch {
    return false
  }
}

function openDouyinWindow() {
  if (douyinWindow && !douyinWindow.isDestroyed()) {
    douyinWindow.show()
    douyinWindow.focus()
    return
  }
  douyinWindow = new BaseWindow({ width: 1280, height: 860, title: '抖音登录与验证' })
  douyinView = new WebContentsView({
    webPreferences: {
      partition: 'persist:douyin',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  douyinWindow.contentView.addChildView(douyinView)
  const resize = () => {
    const [width, height] = douyinWindow.getContentSize()
    douyinView.setBounds({ x: 0, y: 0, width, height })
  }
  resize()
  douyinWindow.on('resize', resize)
  douyinView.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDouyinUrl(url)) douyinView.webContents.loadURL(url)
    return { action: 'deny' }
  })
  douyinView.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedDouyinUrl(url)) event.preventDefault()
  })
  douyinWindow.on('closed', () => {
    if (douyinView && !douyinView.webContents.isDestroyed()) douyinView.webContents.close()
    douyinView = null
    douyinWindow = null
  })
  douyinView.webContents.loadURL('https://www.douyin.com/')
}

async function syncDouyinSession() {
  const cookies = await session.fromPartition('persist:douyin').cookies.get({})
  const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/runtime/douyin/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SAU-Instance-Token': backendInstanceToken
    },
    body: JSON.stringify({ cookies: cookies.filter((cookie) => cookie.domain.includes('douyin')) })
  })
  if (!response.ok) throw new Error(`同步抖音会话失败：HTTP ${response.status}`)
  return response.json()
}

function registerDesktopIpc() {
  ipcMain.handle('sunbird:runtime-info', () => ({ desktop: true }))
  ipcMain.handle('sunbird:open-douyin', () => {
    openDouyinWindow()
    return { opened: true }
  })
  ipcMain.handle('sunbird:sync-douyin-session', () => syncDouyinSession())
  ipcMain.handle('sunbird:get-pi-settings', () => loadPiSettings())
  ipcMain.handle('sunbird:save-pi-settings', (_event, settings) => savePiSettings(settings))
  ipcMain.handle('sunbird:pi-prompt', (_event, payload) => runPiPrompt(payload))
}

function getPiSettingsPath() {
  return path.join(app.getPath('userData'), 'pi-agent-settings.json')
}

function loadPiSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(getPiSettingsPath(), 'utf8'))
    let apiKey = ''
    if (stored.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, 'base64'))
    }
    return { ...stored, encryptedApiKey: undefined, apiKey, apiKeyConfigured: Boolean(apiKey) }
  } catch {
    return { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', thinkingLevel: 'off', apiKey: '', apiKeyConfigured: false }
  }
}

function savePiSettings(settings = {}) {
  const apiKey = String(settings.apiKey || '')
  if (apiKey && !safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存 API Key')
  const stored = {
    provider: 'deepseek',
    baseUrl: String(settings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: String(settings.model || 'deepseek-v4-flash'),
    thinkingLevel: String(settings.thinkingLevel || 'off'),
    encryptedApiKey: apiKey ? safeStorage.encryptString(apiKey).toString('base64') : undefined
  }
  fs.writeFileSync(getPiSettingsPath(), JSON.stringify(stored, null, 2), 'utf8')
  return { ...stored, encryptedApiKey: undefined, apiKeyConfigured: Boolean(apiKey) }
}

function runPiPrompt(payload = {}) {
  return new Promise((resolve, reject) => {
    const config = loadPiSettings()
    if (!config.apiKey) return reject(new Error('请先配置 PI Agent 的 DeepSeek API Key'))
    const sidecar = path.join(__dirname, 'pi-agent-sidecar.mjs')
    const child = spawn(process.execPath, [sidecar], {
      cwd: getAppRoot(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', () => {
      try {
        const result = JSON.parse(stdout || '{}')
        if (!result.ok) reject(new Error(result.error || stderr || 'PI Agent运行失败'))
        else resolve(result)
      } catch {
        reject(new Error(stderr || stdout || 'PI Agent返回格式无效'))
      }
    })
    child.stdin.end(JSON.stringify({
      prompt: payload.prompt,
      authToken: payload.authToken,
      backendPort: BACKEND_PORT,
      config
    }))
  })
}

process.on('uncaughtException', (error) => {
  writeLog(`Uncaught exception: ${error.stack || error.message}`)
  dialog.showErrorBox('桌面程序异常', error.message)
})

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  writeLog(`Unhandled rejection: ${message}`)
})

app.whenReady().then(async () => {
  writeLog('Electron app is ready')
  if (!(await isBackendPortAvailable())) {
    writeLog(`Backend port ${BACKEND_PORT} is already occupied; refusing to reuse it`)
    dialog.showErrorBox(
      '本地服务端口被占用',
      `端口 ${BACKEND_PORT} 已被其他程序占用。请关闭网页版后端或旧版 Sunbird OS 后重试。`
    )
    app.quit()
    return
  }
  startBackend()
  registerDesktopIpc()
  const ready = await waitForBackend()
  if (!ready) {
    dialog.showErrorBox('后端启动超时', '本地服务未能在 30 秒内启动，请查看 desktop.log。')
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
  if (douyinWindow && !douyinWindow.isDestroyed()) douyinWindow.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
