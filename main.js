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
  apiUrl: 'http://localhost:20129',
  authToken: '',
  model: 'oc/deepseek-v4-flash-free',
  customModel: '',
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
    width: 660, height: 680, minWidth: 580, minHeight: 580,
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
  // Извлекаем порт и хост из apiUrl (например, http://localhost:20129 → порт 20129, хост localhost)
  let port = 20129; // default
  let host = 'localhost'; // default
  try {
    const url = new URL(cfg.apiUrl);
    if (url.port) {
      port = parseInt(url.port);
    }
    host = url.hostname || 'localhost';
  } catch (e) {
    return { ok: false, message: `Некорректный URL API: ${cfg.apiUrl}` };
  }

  const alreadyRunning = await checkPort(port);
  if (alreadyRunning) {
    return { ok: true, message: `OmniRoute уже запущен на ${cfg.apiUrl}` };
  }

  // Обновляем .env файлы OmniRoute перед запуском
  const omnirouteEnvPaths = [
    path.join(os.homedir(), '.omniroute', '.env'), // ~/.omniroute/.env
  ];

  // Добавляем путь к .env в node_modules/omniroute
  try {
    const omniroutePath = whichCmd('omniroute');
    if (omniroutePath) {
      // Путь к omniroute: C:\...\nvm\v22.22.2\node_modules\.bin\omniroute.cmd
      // Нужен путь: C:\...\nvm\v22.22.2\node_modules\omniroute\.env
      const nodeModulesOmniroute = path.join(path.dirname(path.dirname(omniroutePath)), 'omniroute', '.env');
      if (fs.existsSync(path.dirname(nodeModulesOmniroute))) {
        omnirouteEnvPaths.push(nodeModulesOmniroute);
      }
    }
  } catch (_) {}

  // Обновляем все найденные .env файлы
  for (const omnirouteEnvPath of omnirouteEnvPaths) {
    try {
      const omnirouteDir = path.dirname(omnirouteEnvPath);

      // Создаём папку если не существует
      if (!fs.existsSync(omnirouteDir)) {
        fs.mkdirSync(omnirouteDir, { recursive: true });
      }

      // Читаем существующий .env или создаём новый
      let envContent = '';
      if (fs.existsSync(omnirouteEnvPath)) {
        envContent = fs.readFileSync(omnirouteEnvPath, 'utf-8');
      }

      // Парсим существующие переменные
      const envVars = {};
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      });

      // Обновляем PORT и HOST
      envVars['PORT'] = port.toString();
      envVars['HOST'] = host;

      // Записываем обратно
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      fs.writeFileSync(omnirouteEnvPath, newEnvContent, 'utf-8');
    } catch (e) {
      console.error(`Failed to update ${omnirouteEnvPath}:`, e);
    }
  }

  return new Promise((resolve) => {
    // Создаём PowerShell скрипт для запуска OmniRoute
    const psScriptPath = path.join(CONFIG_DIR, 'launch-omniroute.ps1');
    const psContent = `
# Запуск OmniRoute
omniroute
`;
    fs.writeFileSync(psScriptPath, psContent, 'utf-8');

    // Запускаем через PowerShell с NoExit для отображения вывода
    omnirouteProc = spawn('cmd.exe', ['/c', `start "OmniRoute - ${cfg.apiUrl}" powershell -NoExit -ExecutionPolicy Bypass -File "${psScriptPath}"`], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      shell: true
    });
    omnirouteProc.unref();

    new Notification({ title: 'Claude Launcher', body: `OmniRoute запускается (${cfg.apiUrl})...`, silent: false }).show();
    waitForPort(port, 30000).then((up) => {
      if (up) resolve({ ok: true, message: `OmniRoute запущен на ${cfg.apiUrl}` });
      else resolve({ ok: false, message: `Таймаут ожидания OmniRoute (${cfg.apiUrl})` });
    });
  });
});

ipcMain.handle('launch:claude', async (_e, cfg) => {
  const dir = cfg.workDir;
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, message: 'Рабочая папка не указана или не существует' };
  }

  const model = cfg.model === '__custom__' ? cfg.customModel : cfg.model;
  // Используем apiUrl напрямую, добавляя /v1 если его нет
  let baseUrl = cfg.apiUrl;
  if (!baseUrl.endsWith('/v1')) {
    baseUrl = `${baseUrl}/v1`;
  }

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

// ---- IPC: stop processes ----

ipcMain.handle('stop:all', async () => {
  const results = [];

  // Убить все процессы OmniRoute (даже запущенные не через приложение)
  try {
    // Создаём временный PowerShell скрипт для получения процессов node.exe с omniroute и их родителей
    const psScript1 = path.join(CONFIG_DIR, 'find-omniroute.ps1');
    const psContent1 = `
$nodeProcesses = Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like '*omniroute*' }
foreach ($proc in $nodeProcesses) {
  # Выводим PID процесса node.exe
  Write-Output $proc.ProcessId
  # Выводим PID родительского процесса (cmd.exe или powershell.exe)
  Write-Output "parent:$($proc.ParentProcessId)"
}
`;
    fs.writeFileSync(psScript1, psContent1, 'utf-8');

    const psOut = execSync(`powershell -ExecutionPolicy Bypass -File "${psScript1}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000
    }).trim();

    // Удаляем временный скрипт
    try { fs.unlinkSync(psScript1); } catch (_) {}

    if (psOut) {
      const lines = psOut.split('\n').map(l => l.trim()).filter(l => l);
      const nodePids = [];
      const parentPids = new Set();

      for (const line of lines) {
        if (/^\d+$/.test(line)) {
          nodePids.push(line);
        } else if (line.startsWith('parent:')) {
          const pid = line.replace('parent:', '');
          if (/^\d+$/.test(pid)) {
            parentPids.add(pid);
          }
        }
      }

      let stoppedCount = 0;

      // Убиваем процессы node.exe
      for (const pid of nodePids) {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { windowsHide: true });
          stoppedCount++;
        } catch (_) {}
      }

      // Убиваем родительские терминалы (cmd.exe, powershell.exe)
      for (const pid of parentPids) {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { windowsHide: true });
        } catch (_) {}
      }

      omnirouteProc = null;
      if (stoppedCount > 0) {
        results.push(`OmniRoute остановлен (${stoppedCount} процесс(ов))`);
      } else {
        results.push('OmniRoute: не запущен');
      }
    } else {
      results.push('OmniRoute: не запущен');
    }
  } catch (e) {
    results.push(`OmniRoute: не найден или не запущен`);
  }

  // Убить Claude и все связанные PowerShell процессы
  try {
    // Создаём временный PowerShell скрипт для получения процессов powershell.exe с run-claude.ps1
    const psScript2 = path.join(CONFIG_DIR, 'find-claude.ps1');
    const psContent2 = `Get-CimInstance Win32_Process -Filter "name='powershell.exe'" | Where-Object { $_.CommandLine -like '*run-claude.ps1*' } | Select-Object -ExpandProperty ProcessId`;
    fs.writeFileSync(psScript2, psContent2, 'utf-8');

    const psOut = execSync(`powershell -ExecutionPolicy Bypass -File "${psScript2}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000
    }).trim();

    // Удаляем временный скрипт
    try { fs.unlinkSync(psScript2); } catch (_) {}

    let stopped = false;

    if (psOut) {
      const pids = psOut.split('\n').map(l => l.trim()).filter(l => l && /^\d+$/.test(l));
      if (pids.length > 0) {
        for (const pid of pids) {
          try {
            execSync(`taskkill /pid ${pid} /T /F`, { windowsHide: true });
            stopped = true;
          } catch (_) {}
        }
        claudeProc = null;
        results.push(`Claude остановлен (${pids.length} процесс(ов) PowerShell)`);
      }
    }

    // Дополнительно убиваем все claude.exe процессы (на случай если остались)
    try {
      execSync('taskkill /IM "claude.exe" /F', { windowsHide: true });
      if (!stopped) {
        stopped = true;
        results.push('Claude остановлен');
      }
    } catch (_) {
      if (!stopped) {
        results.push('Claude: не запущен');
      }
    }

    claudeProc = null;
  } catch (e) {
    results.push(`Claude: не найден или не запущен`);
  }

  return { ok: true, messages: results };
});

// ---- IPC: open external links ----

ipcMain.handle('open:external', async (_e, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// ---- IPC: check OmniRoute status ----

ipcMain.handle('check:omniroute-status', async () => {
  try {
    // Создаём временный PowerShell скрипт для проверки запущен ли OmniRoute
    const psScript = path.join(CONFIG_DIR, 'check-omniroute.ps1');
    const psContent = `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -like '*omniroute*' } | Select-Object -ExpandProperty ProcessId`;
    fs.writeFileSync(psScript, psContent, 'utf-8');

    const psOut = execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000
    }).trim();

    // Удаляем временный скрипт
    try { fs.unlinkSync(psScript); } catch (_) {}

    const running = psOut && psOut.split('\n').filter(l => l.trim() && /^\d+$/.test(l.trim())).length > 0;
    return { running };
  } catch (e) {
    return { running: false };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
