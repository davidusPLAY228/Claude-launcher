const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const { spawn, execSync, exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Config in C:\Users\%USER%\AppData\Local\Claude-launcher
const CONFIG_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Claude-launcher');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const RECOMMENDED_NODE = '22.22.2';

const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:20129/v1',
  authToken: '',
  model: 'oc/deepseek-v4-flash-free',
  customModel: '',
  port: 20129,
  workDir: '',
  models: [
    'oc/deepseek-v4-flash-free',
    'kr/glm-5',
    'kr/claude-sonnet-4.5'
  ]
};

let win = null;
let omnirouteProc = null;
let claudeProc = null;

// ---- Config ----

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...saved, models: DEFAULT_CONFIG.models };
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ---- Network ----

function checkPort(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise(async (resolve) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await checkPort(port)) return resolve(true);
      await new Promise(r => setTimeout(r, 500));
    }
    resolve(false);
  });
}

// ---- Dependency checks ----

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\u001b\[[0-9;]*m/g, '');
}

function runCmd(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 8000, windowsHide: true }).trim();
    return { ok: true, output: stripAnsi(out) };
  } catch (e) {
    const raw = (e.stdout || '').trim() || e.message;
    return { ok: false, output: stripAnsi(raw) };
  }
}

function extractVersion(output) {
  if (!output) return null;
  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^(\d+\.\d+\.\d+)/);
    if (m) return m[1];
  }
  return null;
}

function whichCmd(name) {
  try {
    const out = execSync(`where ${name} 2>nul`, { encoding: 'utf-8', timeout: 5000, windowsHide: true }).trim();
    return out.split('\n')[0];
  } catch (_) {
    return null;
  }
}

ipcMain.handle('check:deps', async () => {
  const result = { node: null, omniroute: null, claude: null };

  const nodePath = whichCmd('node');
  if (nodePath) {
    const v = runCmd('node --version');
    if (v.ok) {
      const ver = v.output.replace(/^v/, '');
      const versionMatch = ver.match(/^(\d+\.\d+\.\d+)/);
      const cleanVer = versionMatch ? versionMatch[1] : ver;
      const isRecommended = cleanVer === RECOMMENDED_NODE;
      result.node = { installed: true, version: cleanVer, recommended: isRecommended };
    } else {
      result.node = { installed: true, version: '?', recommended: false };
    }
  } else {
    result.node = { installed: false, version: null, recommended: false };
  }

  const omniPath = whichCmd('omniroute');
  if (omniPath) {
    const v = runCmd('omniroute -v');
    const omVer = (v.ok || v.output) ? extractVersion(v.output) : null;
    result.omniroute = { installed: true, version: omVer };
  } else {
    result.omniroute = { installed: false, version: null };
  }

  const claudePath = whichCmd('claude');
  if (claudePath) {
    const v = runCmd('claude --version');
    const clVer = (v.ok || v.output) ? extractVersion(v.output) : null;
    result.claude = { installed: true, version: clVer };
  } else {
    result.claude = { installed: false, version: null };
  }

  return result;
});

// ---- Install commands ----

ipcMain.handle('install:omniroute', async () => {
  return new Promise((resolve) => {
    const proc = spawn('cmd', ['/c', 'npm', 'install', '-g', 'omniroute'], {
      stdio: 'pipe', shell: false, windowsHide: false
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, message: 'OmniRoute установлен успешно' });
      else resolve({ ok: false, message: `Ошибка установки (код ${code}): ${stderr || stdout}` });
    });
    proc.on('error', (err) => {
      resolve({ ok: false, message: `Ошибка: ${err.message}` });
    });
  });
});

ipcMain.handle('install:claude', async () => {
  return new Promise((resolve) => {
    const proc = spawn('cmd', ['/c', 'winget', 'install', 'Anthropic.ClaudeCode'], {
      stdio: 'pipe', shell: false, windowsHide: false
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ ok: true, message: 'Claude Code установлен успешно' });
      else resolve({ ok: false, message: `Ошибка установки (код ${code}): ${stderr || stdout}` });
    });
    proc.on('error', (err) => {
      resolve({ ok: false, message: `Ошибка: ${err.message}` });
    });
  });
});

// ---- Window ----

function createWindow() {
  win = new BrowserWindow({
    width: 560, height: 680, minWidth: 480, minHeight: 580,
    resizable: false, title: 'Claude Launcher',
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'manifest.ico'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);
}

// ---- IPC: config & dialog ----

ipcMain.handle('config:load', () => loadConfig());
ipcMain.handle('config:save', (_e, cfg) => saveConfig(cfg));

ipcMain.handle('dialog:folder', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Выберите рабочую папку для Claude'
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ---- IPC: launch ----

ipcMain.handle('launch:omniroute', async (_e, cfg) => {
  const port = cfg.port || 20129;
  const alreadyRunning = await checkPort(port);
  if (alreadyRunning) {
    return { ok: true, message: `OmniRoute уже запущен на порту ${port}` };
  }
  return new Promise((resolve) => {
    omnirouteProc = spawn('cmd.exe', ['/c', 'omniroute'], {
      stdio: 'ignore', detached: true, windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' }
    });
    omnirouteProc.unref();
    new Notification({ title: 'Claude Launcher', body: `OmniRoute запускается (порт ${port})...`, silent: false }).show();
    waitForPort(port, 30000).then((up) => {
      if (up) resolve({ ok: true, message: `OmniRoute запущен на порту ${port}` });
      else resolve({ ok: false, message: `Таймаут ожидания OmniRoute (порт ${port})` });
    });
  });
});

ipcMain.handle('launch:claude', async (_e, cfg) => {
  const dir = cfg.workDir;
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, message: 'Рабочая папка не указана или не существует' };
  }

  const model = cfg.model === '__custom__' ? cfg.customModel : cfg.model;
  // Always derive baseUrl from port to avoid desync when user changes port
  const baseUrl = `http://localhost:${cfg.port || 20129}/v1`;

  // Find claude executable path
  const claudePath = whichCmd('claude');
  if (!claudePath) {
    return { ok: false, message: 'Claude Code не найден в PATH' };
  }

  // Ensure config dir exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Escape single quotes for PowerShell (' → '')
  function psSafe(v) {
    return (v || '').replace(/'/g, "''");
  }

  const ps1Content = [
    `Set-Location -LiteralPath '${psSafe(dir)}'`,
    `$env:ANTHROPIC_API_KEY = '${psSafe(cfg.authToken)}'`,
    `$env:ANTHROPIC_BASE_URL = '${psSafe(baseUrl)}'`,
    `$env:ANTHROPIC_MODEL = '${psSafe(model)}'`,
    `$env:CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1'`,
    `claude`,
    `if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {`,
    `  Write-Host ''`,
    `  Write-Host "Claude exited with code $LASTEXITCODE" -ForegroundColor Red`,
    `}`,
  ].join('\r\n');

  const ps1Path = path.join(CONFIG_DIR, 'run-claude.ps1');
  fs.writeFileSync(ps1Path, ps1Content, 'utf-8');

  return new Promise((resolve) => {
    // Use shell:true so Node.js passes the command as a single string to cmd.exe,
    // avoiding double-quote escaping that breaks 'start' and the file path.
    // /s flag (added by shell:true) strips outer quotes and preserves inner ones.
    const cmdLine = `start "Claude Code" powershell.exe -NoExit -File "${ps1Path}"`;
    const proc = spawn(cmdLine, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: true
    });
    proc.unref();
    setTimeout(() => {
      resolve({ ok: true, message: `Claude запускается в ${dir}` });
    }, 1000);
  });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
