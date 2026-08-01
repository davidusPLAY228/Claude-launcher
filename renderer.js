const $ = (id) => document.getElementById(id);

const inpApiUrl = $('inp-api-url');
const inpToken  = $('inp-token');
const selModel  = $('sel-model');
const customF   = $('custom-field');
const inpCustom = $('inp-custom-model');
const inpDir    = $('inp-dir');
const btnLaunch = $('btn-launch');
const btnReturn = $('btn-return');
const btnEye    = $('btn-eye');
const btnBrowse = $('btn-browse');
const viewSet   = $('view-settings');
const viewLog   = $('view-logs');
const logList   = $('log-list');
const logSumm   = $('log-summary');
const btnBack   = $('btn-back');
const btnStop   = $('btn-stop');
const btnRetry  = $('btn-retry');

// Dependency check elements
const depNode      = $('dep-node');
const depOmni      = $('dep-omniroute');
const depClaude    = $('dep-claude');
const depNodeWarn  = $('dep-node-warn');

let savedModels = [];
let tokenVisible = false;
let depsResult = null;

// ---- Init ----
(async () => {
  const cfg = await window.api.loadConfig();
  savedModels = cfg.models || [];
  fillModelSelect(cfg);
  inpApiUrl.value = cfg.apiUrl || 'http://localhost:20129';
  inpToken.value  = cfg.authToken;
  inpDir.value    = cfg.workDir;
  inpCustom.value = cfg.customModel;

  // Run dependency checks
  checkDependencies();
})();

// ---- Dependency checking ----
async function checkDependencies() {
  // Set loading state
  depNode.querySelector('.dep-dot').className = 'dep-dot loading';
  depOmni.querySelector('.dep-dot').className = 'dep-dot loading';
  depClaude.querySelector('.dep-dot').className = 'dep-dot loading';
  depNode.querySelector('.dep-ver').textContent = 'проверка...';
  depOmni.querySelector('.dep-ver').textContent = 'проверка...';
  depClaude.querySelector('.dep-ver').textContent = 'проверка...';
  removeInstallBtn(depOmni);
  removeInstallBtn(depClaude);
  depNodeWarn.style.display = 'none';

  try {
    depsResult = await window.api.checkDeps();
  } catch (e) {
    setDepError(depNode, 'ошибка проверки');
    setDepError(depOmni, 'ошибка проверки');
    setDepError(depClaude, 'ошибка проверки');
    return;
  }

  // --- Node.js ---
  const nd = depsResult.node;
  if (!nd.installed) {
    setDepError(depNode, 'не установлен');
  } else {
    depNode.querySelector('.dep-dot').className = 'dep-dot ok';
    depNode.querySelector('.dep-ver').textContent = `v${nd.version}`;
    if (!nd.recommended) {
      depNode.querySelector('.dep-dot').className = 'dep-dot warn';
      depNodeWarn.innerHTML = `Рекомендуемая версия: <strong>v22.22.2</strong>. Текущая: v${nd.version}. Некоторые функции могут работать некорректно.`;
      depNodeWarn.style.display = 'block';
    }
  }

  // --- OmniRoute ---
  const om = depsResult.omniroute;
  if (!om.installed) {
    setDepError(depOmni, 'не установлен');
    addInstallBtn(depOmni, 'npm install -g omniroute', async () => {
      await runInstall('omniroute');
    });
  } else {
    depOmni.querySelector('.dep-dot').className = 'dep-dot ok';
    depOmni.querySelector('.dep-ver').textContent = om.version ? `v${om.version}` : 'установлен';
  }

  // --- Claude ---
  const cl = depsResult.claude;
  if (!cl.installed) {
    setDepError(depClaude, 'не установлен');
    addInstallBtn(depClaude, 'winget install Anthropic.ClaudeCode', async () => {
      await runInstall('claude');
    });
  } else {
    depClaude.querySelector('.dep-dot').className = 'dep-dot ok';
    depClaude.querySelector('.dep-ver').textContent = cl.version ? `v${cl.version}` : 'установлен';
  }
}

function setDepError(row, text) {
  row.querySelector('.dep-dot').className = 'dep-dot err';
  row.querySelector('.dep-ver').textContent = text;
}

function removeInstallBtn(row) {
  const existing = row.querySelector('.dep-install-btn');
  if (existing) existing.remove();
}

function addInstallBtn(row, title, onClick) {
  removeInstallBtn(row);
  const btn = document.createElement('button');
  btn.className = 'dep-install-btn';
  btn.textContent = 'Установить';
  btn.title = title;
  btn.addEventListener('click', onClick);
  row.appendChild(btn);
}

async function runInstall(type) {
  let res;
  if (type === 'omniroute') {
    res = await window.api.installOmniRoute();
  } else {
    res = await window.api.installClaude();
  }
  // Re-check deps after install attempt
  if (res.ok) {
    checkDependencies();
  } else {
    // Show error somehow - brief flash on the row
    const row = type === 'omniroute' ? depOmni : depClaude;
    const ver = row.querySelector('.dep-ver');
    const prev = ver.textContent;
    ver.textContent = 'ошибка установки';
    ver.style.color = 'var(--danger)';
    setTimeout(() => {
      ver.style.color = '';
      checkDependencies();
    }, 3000);
  }
}

// ---- Model select ----

function fillModelSelect(cfg) {
  selModel.innerHTML = '';
  savedModels.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (m === cfg.model) opt.selected = true;
    selModel.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = 'Custom...';
  if (cfg.model === '__custom__' || !savedModels.includes(cfg.model)) customOpt.selected = true;
  selModel.appendChild(customOpt);
  customF.classList.toggle('visible', selModel.value === '__custom__');
}

function getConfig() {
  // Удаляем завершающий слеш, если он есть
  let apiUrl = inpApiUrl.value.trim();
  if (apiUrl.endsWith('/')) {
    apiUrl = apiUrl.slice(0, -1);
  }

  return {
    apiUrl:      apiUrl,
    authToken:   inpToken.value.trim(),
    model:       selModel.value,
    customModel: inpCustom.value.trim(),
    workDir:     inpDir.value.trim(),
    models:      savedModels
  };
}

function maskToken(t) {
  if (!t) return '***';
  if (t.length <= 8) return t.slice(0, 3) + '***';
  return t.slice(0, 5) + '***' + t.slice(-3);
}

// ---- Events ----
selModel.onchange = () => {
  customF.classList.toggle('visible', selModel.value === '__custom__');
};

btnEye.onclick = () => {
  tokenVisible = !tokenVisible;
  inpToken.type = tokenVisible ? 'text' : 'password';
};

btnBrowse.onclick = async () => {
  const dir = await window.api.pickFolder();
  if (dir) inpDir.value = dir;
};

btnBack.onclick = () => {
  showView('settings');
  btnReturn.style.display = 'inline-block'; // показать «Вернуться»
};

btnReturn.onclick = () => {
  btnReturn.style.display = 'none';
  showView('logs');
};

btnStop.onclick = async () => {
  btnStop.disabled = true;
  btnStop.textContent = 'Остановка...';
  const res = await window.api.stopAll();
  btnStop.textContent = 'Остановлено';
  btnStop.disabled = true;
  // Обновить summary
  if (res.ok) {
    logSumm.className = 'summary ok';
    logSumm.innerHTML = `
      <div class="summary-title">Остановлено</div>
      <div class="summary-sub">${res.messages.join(', ')}</div>
    `;
  }
};

btnRetry.onclick = () => { startLaunch(); };
btnLaunch.onclick = () => { startLaunch(); };

function showView(name) {
  viewSet.classList.toggle('active', name === 'settings');
  viewLog.classList.toggle('active', name === 'logs');
}

// ---- Log helpers ----
function addLog(stage, title, details, status) {
  const el = document.createElement('div');
  el.className = `log-item ${status}`;
  el.id = `log-${stage}`;

  let iconHtml;
  if (status === 'pending') iconHtml = '<span class="spinner"></span>';
  else if (status === 'ok') iconHtml = '✓';
  else iconHtml = '✗';

  el.innerHTML = `
    <div class="log-icon">${iconHtml}</div>
    <div class="log-body">
      <div class="log-title">${title}</div>
      <div class="log-detail">${details}</div>
    </div>`;
  logList.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return el;
}

function updateLog(stage, details, status) {
  const el = $(`log-${stage}`);
  if (!el) return;
  el.className = `log-item ${status}`;
  const icon = el.querySelector('.log-icon');
  icon.innerHTML = status === 'ok' ? '✓' : '✗';
  el.querySelector('.log-detail').innerHTML = details;
}

function showSummary(ok, total, errors) {
  logSumm.style.display = 'block';
  logSumm.className = `summary ${ok ? 'ok' : 'err'}`;
  logSumm.innerHTML = `
    <div class="summary-title">${ok ? 'Готово!' : 'Ошибка'}</div>
    <div class="summary-sub">${total - errors}/${total} стадий выполнено успешно, ошибок: ${errors}</div>
  `;
  btnRetry.disabled = ok;

  // Показать кнопку Stop только при успешном запуске
  btnStop.style.display = ok ? 'inline-block' : 'none';
  if (ok) {
    btnStop.disabled = false;
    btnStop.textContent = 'Stop';
  }
}

// ---- Launch pipeline ----
async function startLaunch() {
  const cfg = getConfig();

  // Validate
  if (!cfg.authToken) {
    inpToken.focus();
    inpToken.style.borderColor = 'var(--danger)';
    setTimeout(() => inpToken.style.borderColor = '', 2000);
    return;
  }
  if (!cfg.workDir) {
    btnBrowse.focus();
    return;
  }
  const modelDisplay = cfg.model === '__custom__' ? cfg.customModel : cfg.model;
  if (cfg.model === '__custom__' && !modelDisplay) {
    inpCustom.focus();
    inpCustom.style.borderColor = 'var(--danger)';
    setTimeout(() => inpCustom.style.borderColor = '', 2000);
    return;
  }

  // Block launch if omniroute or claude not installed
  if (depsResult) {
    if (!depsResult.omniroute.installed) {
      showInlineError('OmniRoute не установлен. Установите его в панели зависимостей выше.');
      return;
    }
    if (!depsResult.claude.installed) {
      showInlineError('Claude Code не установлен. Установите его в панели зависимостей выше.');
      return;
    }
  }

  // Save config
  await window.api.saveConfig(cfg);

  // Switch to log view
  logList.innerHTML = '';
  logSumm.style.display = 'none';
  btnRetry.disabled = true;
  showView('logs');

  let errors = 0;
  const total = 4;

  // P1: Settings
  addLog('p1', 'P1: Применение настроек',
    `<code>1.</code> Key=${maskToken(cfg.authToken)}<br>` +
    `<code>2.</code> Model=<code>${modelDisplay}</code><br>` +
    `<code>3.</code> API URL=<code>${cfg.apiUrl}</code>`,
    'pending');
  await delay(400);
  updateLog('p1',
    `<code>1.</code> Key=${maskToken(cfg.authToken)}<br>` +
    `<code>2.</code> Model=<code>${modelDisplay}</code><br>` +
    `<code>3.</code> API URL=<code>${cfg.apiUrl}</code>`,
    'ok');

  // P2: OmniRoute
  addLog('p2', 'P2: Открытие OmniRoute',
    `Проверка доступности <code>${cfg.apiUrl}</code>...`,
    'pending');
  await delay(300);

  try {
    const res = await window.api.launchOmniRoute(cfg);
    if (res.ok) {
      updateLog('p2', `OmniRoute готов по адресу <code>${cfg.apiUrl}</code>`, 'ok');
    } else {
      updateLog('p2', res.message, 'err');
      errors++;
    }
  } catch (e) {
    updateLog('p2', `Ошибка: ${e.message}`, 'err');
    errors++;
  }

  // P3: Folder
  addLog('p3', 'P3: Открытие папки', `Путь: <code>${cfg.workDir}</code>`, 'pending');
  await delay(300);
  updateLog('p3', `Папка: <code>${cfg.workDir}</code>`, 'ok');

  // P4: Claude
  addLog('p4', 'P4: Открытие Claude',
    `Model=<code>${modelDisplay}</code> в <code>${cfg.workDir}</code>...`,
    'pending');
  await delay(200);

  try {
    const res = await window.api.launchClaude(cfg);
    if (res.ok) {
      updateLog('p4', `Claude запущен (model=<code>${modelDisplay}</code>)`, 'ok');
    } else {
      updateLog('p4', res.message, 'err');
      errors++;
    }
  } catch (e) {
    updateLog('p4', `Ошибка: ${e.message}`, 'err');
    errors++;
  }

  showSummary(errors === 0, total, errors);
}

function showInlineError(msg) {
  // Brief flash on launch button
  btnLaunch.style.background = 'var(--danger)';
  btnLaunch.textContent = msg;
  setTimeout(() => {
    btnLaunch.style.background = '';
    btnLaunch.textContent = 'Запустить';
  }, 3000);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
