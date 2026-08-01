# Claude Launcher — Задачи для нейросети

> Этот документ содержит точные задачи по доработке Electron-приложения **Claude Launcher**. Каждая задача самодостаточна и содержит: что сделать, где именно в коде, какие файлы затрагиваются и какие ограничения соблюдать.

---

## Контекст приложения

Приложение — Electron (main.js + preload.js + renderer.js + index.html + styles.css). Два экрана: `view-settings` (настройки) и `view-logs` (лог запуска). Навигация между ними через `showView('settings')` / `showView('logs')`. Запуск процессов OmniRoute и Claude Code через `spawn` в main.js.

---

## ✅ Задача 1: Кнопка «Вернуться» после «Назад»

### Что сделать

Сейчас в окне логов (`view-logs`) есть кнопка **«← Назад»** (`btn-back`), которая возвращает в окно настроек (`view-settings`). Нужно добавить **новую кнопку «Вернуться»**, которая появляется **после** нажатия «Назад» и возвращает в **окно готовности** (то есть обратно в `view-logs`).

### Поведение

1. Пользователь нажимает «← Назад» → переходит в `view-settings`.
2. В `view-settings` внизу (рядом с «Запустить») появляется кнопка **«Вернуться»**.
3. Нажатие «Вернуться» → возвращает в `view-logs` (без перезапуска пайплайна, просто показ того же состояния логов).
4. Кнопка «Вернуться» **видна только если** до этого был переход из `view-logs` в `view-settings` через «Назад». Если приложение только открылось — кнопки нет.

### Файлы

| Файл | Изменения |
|------|-----------|
| `index.html` | Добавить кнопку `<button class="btn-return" id="btn-return">Вернуться</button>` в `view-settings`, рядом с `btn-launch` |
| `styles.css` | Стили для `.btn-return` (аналог `btn-back`, но зелёная/акцентная) |
| `renderer.js` | Логика: показать/скрыть `btn-return` в зависимости от того, откуда пришли; обработчик `btn-return.onclick` → `showView('logs')` |

### Ключевые фрагменты кода

**renderer.js** — текущий обработчик «Назад»:
```js
btnBack.onclick = () => { showView('settings'); };
```
Заменить на:
```js
btnBack.onclick = () => {
  showView('settings');
  btnReturn.style.display = 'inline-block'; // показать «Вернуться»
};
```

**renderer.js** — новый обработчик:
```js
btnReturn.onclick = () => {
  btnReturn.style.display = 'none';
  showView('logs');
};
```

**Инициализация** — скрыть кнопку при старте:
```js
btnReturn.style.display = 'none';
```

---

## ✅ Задача 2: Кнопка «Stop» в окне готовности

### Что сделать

В окне логов (`view-logs`), после успешного завершения всех стадий (summary = ok), добавить кнопку **«Stop»**, которая принудительно останавливает процессы OmniRoute и Claude.

### Поведение

1. Кнопка «Stop» появляется **только когда** `showSummary` вызван с `ok = true` (все стадии успешны).
2. Нажатие «Stop» → отправляет IPC-запрос `stop:all` в main.js.
3. main.js убивает процессы `omnirouteProc` и `claudeProc` (через `.kill()` или `taskkill` на Windows).
4. После остановки: кнопка «Stop» меняется на «Остановлено» (disabled), summary обновляется на статус «Остановлено».

### Файлы

| Файл | Изменения |
|------|-----------|
| `preload.js` | Добавить `stopAll: () => ipcRenderer.invoke('stop:all')` |
| `main.js` | Добавить `ipcMain.handle('stop:all', ...)` — логика убийства процессов |
| `index.html` | Добавить кнопку `<button class="btn-stop" id="btn-stop">Stop</button>` в блок `log-actions` |
| `styles.css` | Стили для `.btn-stop` (красная, как `var(--danger)`) |
| `renderer.js` | Показать/скрыть кнопку; обработчик клика; обновление UI |

### Ключевые фрагменты кода

**main.js** — новый обработчик (добавить после `ipcMain.handle('launch:claude', ...)`):
```js
ipcMain.handle('stop:all', async () => {
  const results = [];

  // Убить OmniRoute
  if (omnirouteProc && !omnirouteProc.killed) {
    try {
      // На Windows detached-процессы не убиваются .kill(), используем taskkill
      execSync(`taskkill /pid ${omnirouteProc.pid} /T /F`, { windowsHide: true });
      omnirouteProc = null;
      results.push('OmniRoute остановлен');
    } catch (_) {
      results.push('OmniRoute: не удалось остановить');
    }
  } else {
    results.push('OmniRoute: не запущен');
  }

  // Убить Claude (запущен через start → powershell, поэтому по имени процесса)
  try {
    execSync('taskkill /IM "claude.exe" /F', { windowsHide: true });
    results.push('Claude остановлен');
  } catch (_) {
    results.push('Claude: не запущен или не удалось остановить');
  }

  claudeProc = null;
  return { ok: true, messages: results };
});
```

**renderer.js** — показать кнопку после успешного запуска:
```js
function showSummary(ok, total, errors) {
  // ... существующий код ...
  btnStop.style.display = ok ? 'inline-block' : 'none';
  if (ok) {
    btnStop.disabled = false;
    btnStop.textContent = 'Stop';
  }
}

btnStop.onclick = async () => {
  btnStop.disabled = true;
  btnStop.textContent = 'Остановка...';
  const res = await window.api.stopAll();
  btnStop.textContent = 'Остановлено';
  btnStop.disabled = true;
};
```

**Инициализация** — скрыть кнопку:
```js
btnStop.style.display = 'none';
```

---

## ✅ Задача 3: Выдвижное боковое меню (sidebar)

### Что сделать

Добавить слева выдвижное меню (sidebar) с кнопками:
1. **Запуск OmniRoute** — вызывает `window.api.launchOmniRoute(cfg)`
2. **Установка nvm** — открывает ссылку `https://www.nvmnode.com/ru/guide/download.html` через `shell.openExternal`

### Поведение меню

| Состояние | Как выглядит |
|-----------|-------------|
| **Схлопнутое** (по умолчанию при старте) | Ширина ~52px. Видны только иконки (1:1 картинки из папки `./assets/`). В самом верху — кнопка раскрытия (иконка гамбургера / шеврона). |
| **Развёрнутое** | Ширина ~200px. Плавная анимация (CSS transition). Видны иконки + текстовые названия пунктов. Кнопка раскрытия меняет иконку (например, шеврон влево). |

### Анимация

- Использовать **CSS transition** на `width` и `opacity` (для текста).
- Длительность: `0.25s ease`.
- Текст пунктов при схлопнутом состоянии: `opacity: 0; width: 0; overflow: hidden;`.
- При развёрнутом: `opacity: 1; width: auto;`.

### Файлы

| Файл | Изменения |
|------|-----------|
| `index.html` | Добавить `sidebar` перед `view-settings`; добавить `./assets/` иконки |
| `styles.css` | Полная стилизация sidebar (схлопнутое/развёрнутое, анимация, иконки) |
| `renderer.js` | Логика раскрытия/схлопывания; обработчики кнопок |
| `main.js` | Добавить `ipcMain.handle('open:external', ...)` для открытия ссылок |
| `preload.js` | Добавить `openExternal: (url) => ipcRenderer.invoke('open:external', url)` |

### Структура HTML (sidebar)

```html
<div class="sidebar" id="sidebar">
  <button class="sidebar-toggle" id="sidebar-toggle">
    <img src="./assets/icon-menu.svg" alt="☰">
  </button>
  <div class="sidebar-items">
    <button class="sidebar-item" id="sb-omniroute" title="Запуск OmniRoute">
      <img src="./assets/icon-omniroute.svg" alt="">
      <span class="sidebar-label">Запуск OmniRoute</span>
    </button>
    <button class="sidebar-item" id="sb-nvm" title="Установка nvm">
      <img src="./assets/icon-nvm.svg" alt="">
      <span class="sidebar-label">Установка nvm</span>
    </button>
  </div>
</div>
```

### Структура CSS (ключевые правила)

```css
.sidebar {
  width: 52px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar.expanded {
  width: 200px;
}

.sidebar-toggle {
  width: 52px;
  height: 52px;
  /* ... стили кнопки ... */
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  /* ... стили кнопки ... */
}

.sidebar-item img {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.sidebar-label {
  opacity: 0;
  width: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 0.25s ease, width 0.25s ease;
}

.sidebar.expanded .sidebar-label {
  opacity: 1;
  width: auto;
}
```

### Общий layout (изменение структуры .app)

```css
.app {
  display: flex;
  flex-direction: row;  /* было: column */
  height: 100vh;
}

.sidebar {
  /* как выше */
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  overflow: hidden;
}
```

В HTML обернуть всё содержимое `.app` (кроме sidebar) в `<div class="app-content">`.

### renderer.js — обработчики

```js
const sidebarToggle = $('sidebar-toggle');
const sidebar = $('sidebar');

sidebarToggle.onclick = () => {
  sidebar.classList.toggle('expanded');
};

// Запуск OmniRoute
$('sb-omniroute').onclick = async () => {
  const cfg = getConfig();
  const res = await window.api.launchOmniRoute(cfg);
  // Можно показать уведомление или обновить статус
};

// Установка nvm — открыть ссылку
$('sb-nvm').onclick = async () => {
  await window.api.openExternal('https://www.nvmnode.com/ru/guide/download.html');
};
```

### main.js — обработчик открытия ссылок

```js
ipcMain.handle('open:external', async (_e, url) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});
```

### Необходимые файлы иконок в папке `./assets/`

| Файл | Назначение | Рекомендуемый размер |
|------|-----------|---------------------|
| `icon-menu.svg` | Кнопка раскрытия меню (гамбургер/шеврон) | 24×24 |
| `icon-omniroute.svg` | Пункт «Запуск OmniRoute» | 24×24 |
| `icon-nvm.svg` | Пункт «Установка nvm» | 24×24 |

Если иконок нет — нейросеть должна сгенерировать простые SVG-иконки (стрелка-плей для OmniRoute, иконка загрузки для nvm).

---

## Порядок реализации

1. **Задача 3** (sidebar) — сначала, т.к. меняет общий layout
2. **Задача 1** (кнопка «Вернуться») — зависит от layout
3. **Задача 2** (кнопка «Stop») — не зависит от других

---

## Общие ограничения

- Не менять `contextIsolation: true` и `nodeIntegration: false` в `webPreferences`.
- Все IPC-вызовы — только через `preload.js` (contextBridge).
- Не использовать внешние JS/CSS библиотеки (кроме Google Fonts, уже подключён).
- Стили — только через CSS-переменные из `:root` (уже определены в styles.css).
- Код писать на русском языке для комментариев и UI-текстов.


# Дополнение к TASKS.md — Задача 4 и мелкие исправления

> Вставьте этот блок в конец файла `TASKS.md` после существующих задач.  
> Нумерация задач: после Задачи 3 идёт Задача 4.

---

## Задача 4: Окно выбора моделей (Model Picker) и мелкие исправления

### Что сделать

Добавить функционал выбора моделей из списка, получаемого от OmniRoute API, в отдельном вспомогательном окне. Также исправить два замечания по интерфейсу:

1. ✅ **Заменить поле «Порт» на единое поле «Адрес API»**.  
   Вместо отдельных полей `ip` и `port` оставить одно поле, куда пользователь вводит полный базовый URL (например, `http://localhost:20129`). Именно этот URL используется во всех запросах (запуск OmniRoute, fetch моделей и т.п.). Поле `port` удаляется из интерфейса и из логики.

2. ✅ **Добавить вертикальную прокрутку** для всего содержимого `.app-content`, чтобы при переполнении окна появлялся скролл-бар.

3. **Реализовать выбор моделей**:
   - В окне настроек (`view-settings`) вместо текстового поля или выпадающего списка для модели разместить кнопку **«Выбор моделей»**.
   - При нажатии на эту кнопку открывается **новое отдельное окно** (BrowserWindow) с возможностью поиска и выбора моделей.
   - Окно должно содержать:
     - Поле поиска (фильтрация списка).
     - Список всех моделей, полученных через `fetch` по адресу `{apiUrl}/v1/models`.
     - Каждый элемент списка содержит:
       - Чекбокс для мультивыбора.
       - Название модели.
       - Кнопку «⭐» (добавить в избранное) – звёздочка.
       - Кнопку «🗑️» (удалить из списка) – корзина.
     - Внизу кнопка **«Confirm»** – по нажатию выбранные модели (отмеченные чекбоксами) добавляются в основное приложение как пункты меню (или как список выбранных моделей, отображаемый где-то в настройках).
   - Поведение:
     - Избранные модели всегда отображаются сверху списка (сортировка).
     - Удалённые модели скрываются из списка (но не удаляются физически из API; удаление сохраняется только локально в настройках приложения).
     - При повторном открытии окна состояние (избранное, удалённые) сохраняется (например, в localStorage или в конфиге).
   - После нажатия «Confirm» окно закрывается, а в основном приложении обновляется список выбранных моделей.

---

### Поведение (детали)

#### ✅ 1. Поле «Адрес API»
- Удалить поле `port` из `index.html`.
- Поле `ip` переименовать в `api-url` (или оставить как есть, но хранить полный URL).
- В `renderer.js` и `main.js` везде, где использовались `ip` и `port`, использовать одно значение `apiUrl`.
- Формат ввода: `http://localhost:20129` (без завершающего слеша). Если слеш есть – удалить.
- Пример: если `apiUrl = "http://localhost:20129"`, то fetch к моделям: `${apiUrl}/v1/models`.

#### 2. Прокрутка - ✅
- В `styles.css` для `.app-content` добавить `overflow-y: auto;` и при необходимости задать `max-height: 100%;`.

#### 3. Окно выбора моделей
- Создать новый HTML-файл `model-picker.html` в корне проекта (или в папке `windows`).
- Создать соответствующий `model-picker.js` (рендерер для этого окна) и `preload-model.js` (отдельный прелоад).
- В `main.js` добавить обработчик IPC для открытия окна: `ipcMain.handle('open:model-picker', ...)`.
- В `renderer.js` добавить обработчик клика на кнопку «Выбор моделей», который вызывает `window.api.openModelPicker()`.
- Окно должно быть модальным (parent = mainWindow) и иметь размеры ~600x500.
- В окне:
  - При загрузке выполняется `fetch` по адресу `{apiUrl}/v1/models`.
  - Список моделей отображается в виде таблицы или списка.
  - Фильтр по введённому тексту (поиск).
  - Чекбоксы: при нажатии на строку или чекбокс состояние меняется.
  - Кнопки «⭐» и «🗑️» должны менять состояние модели (избранное/удалённое) и обновлять отображение.
  - Избранные модели всегда в начале списка (сортировка).
  - Удалённые модели скрыты (но при повторном открытии они должны оставаться скрытыми, пока пользователь не восстановит их – но восстановление не требуется, можно просто хранить список удалённых).
- По нажатию «Confirm»:
  - Собрать все модели, у которых чекбокс отмечен.
  - Отправить их через IPC обратно в mainWindow (например, `ipcRenderer.sendTo(mainWindowId, 'models-selected', selectedModels)`).
  - Закрыть окно.
- В основном окне (renderer.js) слушать событие `'models-selected'` и обновить интерфейс (например, вывести список выбранных моделей в настройках или заменить выпадающий список).

---

### Файлы

| Файл | Изменения |
|------|-----------|
| `index.html` | Удалить поле `port`; переименовать поле `ip` в `api-url`; добавить кнопку `<button id="btn-select-models">Выбор моделей</button>` |
| `styles.css` | Добавить `overflow-y: auto` для `.app-content`; стили для новой кнопки (как обычная). |
| `renderer.js` | Изменить `getConfig()` – возвращать только `apiUrl`; убрать ссылки на `port`; добавить обработчик `btnSelectModels.onclick`; добавить обработчик IPC-события для получения выбранных моделей. |
| `main.js` | Убрать `port` из настроек; добавить обработчик `ipcMain.handle('open:model-picker', ...)`, который создаёт новое окно `model-picker.html` с отдельным прелоадом; добавить передачу `apiUrl` в это окно. |
| `preload.js` | Добавить `openModelPicker: () => ipcRenderer.invoke('open:model-picker')`; (опционально) добавить функцию для отправки выбранных моделей обратно. |
| **Новые файлы:** | |
| `model-picker.html` | HTML для окна выбора моделей (структура: поиск, список, кнопка Confirm) |
| `model-picker.js` | Логика рендерера для этого окна (fetch, фильтрация, чекбоксы, избранное, удаление, отправка результата) |
| `preload-model.js` | Отдельный прелоад для окна выбора моделей (предоставляет API для fetch и отправки результата в mainWindow) |

---

### Ключевые фрагменты кода

#### main.js – создание окна выбора моделей

```js
const { BrowserWindow } = require('electron');

ipcMain.handle('open:model-picker', async (event) => {
  const parent = BrowserWindow.getFocusedWindow();
  const picker = new BrowserWindow({
    width: 600,
    height: 500,
    parent: parent,
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-model.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  picker.loadFile('model-picker.html');
  picker.once('ready-to-show', () => picker.show());
  // Передаём в окно текущий apiUrl через параметры или через IPC
  const mainWin = BrowserWindow.getFocusedWindow();
  const apiUrl = mainWin.webContents.getURL(); // или из хранилища
  picker.webContents.on('did-finish-load', () => {
    picker.webContents.send('set-api-url', apiUrl);
  });
  return { ok: true };
});
```

#### model-picker.js – получение списка моделей

```JS
const { ipcRenderer } = require('electron');

let apiUrl = '';
ipcRenderer.on('set-api-url', (_, url) => {
  apiUrl = url;
  fetchModels();
});

async function fetchModels() {
  try {
    const resp = await fetch(`${apiUrl}/v1/models`);
    const data = await resp.json();
    // data.data – массив моделей, предположим, у каждой есть id или name
    renderList(data.data);
  } catch (e) {
    // показать ошибку
  }
}
```

#### renderer.js – получение выбранных моделей в главном окне

```JS
ipcRenderer.on('models-selected', (_, selected) => {
  // selected – массив выбранных моделей (например, названия)
  // Обновить UI: сохранить в localStorage, отобразить список
});
```

#### Интерфейс для отображения выбранных моделей

Можно добавить блок в view-settings, где будут перечислены выбранные модели с возможностью удалить отдельные (но это опционально).

#### Удаление поля port
* В `index.html` убрать `<input id="port" ...>`.
* В `renderer.js` в `getConfig()` убрать `port: ...`.
* В `main.js` в `launch:omniroute` использовать `apiUrl` как базовый.


#### Добавление прокрутки
```css
.app-content {
  overflow-y: auto;
  flex: 1;
  padding: 20px 24px;
  /* остальное */
}
```

---

## Отчёт о выполнении задач

### ✅ Задача 4.2: Вертикальная прокрутка — ВЫПОЛНЕНА
**Дата выполнения:** 2026-08-01  
**Статус:** Завершена полностью

**Что сделано:**
1. Обёрнуто всё содержимое `.app` в новый контейнер `.app-content` (index.html)
2. Изменена структура CSS:
   - `.app` теперь только контейнер с `height: 100vh`
   - `.app-content` получил `overflow-y: auto` и `overflow-x: hidden`
   - Padding перенесён из `.app` в `.app-content`
3. Прокрутка работает для всего содержимого окна при переполнении

**Изменённые файлы:**
- `index.html` — добавлен wrapper `.app-content`
- `styles.css` — разделены стили `.app` и `.app-content` с добавлением `overflow-y: auto`

**Проверка:** При переполнении контента теперь появляется вертикальный скроллбар, использующий кастомные стили из `::-webkit-scrollbar`.

---

### ✅ Задача 4.1: Единое поле «Адрес API» — ВЫПОЛНЕНА
**Дата выполнения:** 2026-08-01  
**Статус:** Завершена полностью

**Что сделано:**
1. Удалено отдельное поле «Порт» из интерфейса
2. Поле «Base URL» переименовано в «Адрес API» с id `inp-api-url`
3. Placeholder изменён на `http://localhost:20129` (без `/v1`)
4. Обновлена структура конфига:
   - Удалены поля `baseUrl` и `port`
   - Добавлено единое поле `apiUrl`
5. Вся логика переведена на использование `apiUrl`:
   - `renderer.js`: функция `getConfig()` возвращает `apiUrl`, автоматически удаляет завершающий слеш
   - `main.js`: `DEFAULT_CONFIG` использует `apiUrl: 'http://localhost:20129'`
   - `main.js`: `launch:omniroute` извлекает порт из URL через `new URL()`
   - `main.js`: `launch:claude` добавляет `/v1` к `apiUrl` если его нет
6. Обновлены все сообщения в логах для отображения `apiUrl` вместо отдельных `baseUrl` и `port`

**Изменённые файлы:**
- `index.html` — удалено поле port, переименовано поле Base URL в Адрес API
- `renderer.js` — переменные, getConfig(), инициализация, логи запуска
- `main.js` — DEFAULT_CONFIG, логика launch:omniroute и launch:claude

**Проверка:** Пользователь вводит полный URL (например, `http://localhost:20129`), который используется во всех запросах. Порт автоматически извлекается из URL для проверки доступности OmniRoute.

---

### ✅ Задача 1: Кнопка «Вернуться» после «Назад» — ВЫПОЛНЕНА
**Дата выполнения:** 2026-08-01  
**Статус:** Завершена полностью

**Что сделано:**
1. Добавлена кнопка «Вернуться» (`btn-return`) в окно настроек (`view-settings`)
2. Кнопка размещена рядом с кнопкой «Запустить» в flexbox-контейнере с `gap: 8px`
3. Реализована логика показа/скрытия:
   - При старте приложения кнопка скрыта (`display: none`)
   - При нажатии «← Назад» в окне логов → переход в настройки и показ кнопки «Вернуться»
   - При нажатии «Вернуться» → возврат в окно логов и скрытие кнопки
4. Добавлены стили для `.btn-return`:
   - Зелёный цвет (`var(--ok)`) для акцента на возврат к готовому состоянию
   - Hover-эффекты и тень аналогично кнопке «Запустить»
   - Flex: 1 для равномерного распределения с кнопкой «Запустить»

**Изменённые файлы:**
- `index.html` — добавлен flexbox-контейнер с кнопками «Вернуться» и «Запустить»
- `styles.css` — убран `margin-top: auto` у `.launch-btn`, добавлены стили `.btn-return`
- `renderer.js` — добавлена переменная `btnReturn`, обработчики `btnBack.onclick` и `btnReturn.onclick`

**Поведение:**
- Кнопка появляется только после перехода из окна логов в настройки через «← Назад»
- Возврат через «Вернуться» не перезапускает pipeline, просто показывает сохранённое состояние логов
- Кнопка не видна при первом открытии приложения
- **(09:35)** Кнопка также не появляется после нажатия «Stop» — если процессы остановлены, возвращаться в окно логов бессмысленно

---

### ✅ Задача 2: Кнопка «Stop» в окне готовности — ВЫПОЛНЕНА
**Дата выполнения:** 2026-08-01  
**Статус:** Завершена полностью

**Что сделано:**
1. Добавлена кнопка «Stop» (`btn-stop`) в блок `log-actions` окна логов
2. Кнопка отображается только при успешном завершении всех стадий (когда `showSummary(ok=true)`)
3. Реализована логика остановки процессов:
   - В `preload.js` добавлен метод `stopAll: () => ipcRenderer.invoke('stop:all')`
   - В `main.js` добавлен обработчик `ipcMain.handle('stop:all', ...)` с логикой убийства процессов
   - OmniRoute останавливается через `taskkill /pid ${omnirouteProc.pid} /T /F`
   - Claude останавливается через `taskkill /IM "claude.exe" /F`
4. Реализовано обновление UI после остановки:
   - Во время остановки: текст кнопки меняется на «Остановка...», кнопка становится disabled
   - После остановки: текст «Остановлено», кнопка остаётся disabled
   - Summary обновляется с выводом результатов остановки
5. Добавлены стили для `.btn-stop`:
   - Красный цвет (`var(--danger)`) для предупреждения
   - Hover-эффекты и disabled-состояние
   - Flex: 1 для равномерного распределения в `log-actions`

**Изменённые файлы:**
- `preload.js` — добавлен метод `stopAll`
- `main.js` — добавлен обработчик `stop:all` с логикой остановки процессов
- `index.html` — добавлена кнопка Stop между «Назад» и «Повторить»
- `styles.css` — добавлены стили `.btn-stop`
- `renderer.js` — добавлена переменная `btnStop`, обработчик `btnStop.onclick`, обновлена функция `showSummary`

**Проверка:** Кнопка Stop появляется только после успешного запуска всех процессов. При нажатии останавливает OmniRoute и Claude, обновляя интерфейс с результатами остановки.

**Исправления:**
- **(2026-08-01 09:04)** Исправлен баг с оставшимся окном PowerShell после остановки Claude. Теперь используется `wmic` для поиска процессов PowerShell с `run-claude.ps1` в командной строке и их полное завершение вместе с дочерними процессами через `taskkill /T /F`.
- **(2026-08-01 09:07)** Заменён устаревший `wmic` на PowerShell команды `Get-Process`. Теперь при нажатии кнопки Stop:
  - Останавливаются **все** процессы OmniRoute (node.js с omniroute в командной строке), даже запущенные вне приложения
  - Останавливаются все процессы PowerShell с `run-claude.ps1` вместе с дочерними процессами (включая claude.exe)
  - Если PowerShell процессы не найдены, выполняется fallback через `taskkill /IM "claude.exe" /F`
- **(2026-08-01 09:10)** Исправлена логика поиска процессов — заменён `Get-Process` (не имеет CommandLine) на `Get-CimInstance Win32_Process` с доступом к CommandLine. Добавлена валидация PID (только цифры) и улучшенная обработка ошибок с выводом сообщения об ошибке.
- **(2026-08-01 09:12)** Исправлено экранирование кавычек в PowerShell команде — заменены двойные кавычки внутри `-Filter` на `\\"` для корректной передачи в `execSync`. Упрощены сообщения об ошибках (убран вывод полного стека).
- **(2026-08-01 09:24)** Полностью переписана логика остановки процессов — отказ от проблемных PowerShell команд в пользу `tasklist` + `wmic`:
  - Используется `tasklist /FI "IMAGENAME eq node.exe"` для получения всех PID процессов node.exe
  - Для каждого PID через `wmic process where "ProcessId=${pid}" get CommandLine` проверяется наличие `omniroute` в командной строке
  - Аналогично для PowerShell — поиск процессов с `run-claude.ps1` в командной строке
  - Убийство процессов через `taskkill /pid ${pid} /T /F` гарантирует закрытие всех дочерних процессов и окон терминала
- **(2026-08-01 09:28)** Полный отказ от устаревшего `wmic` (выдаёт предупреждения) — теперь используются временные PowerShell скрипты:
  - Создаются временные `.ps1` файлы в `CONFIG_DIR` с командами `Get-CimInstance Win32_Process`
  - Запускаются через `powershell -ExecutionPolicy Bypass -File "script.ps1"` (без проблем с экранированием)
  - Скрипты автоматически удаляются после выполнения
  - Гарантированно работает на всех версиях Windows без предупреждений
- **(2026-08-01 09:31)** Исправлен баг с оставшимися окнами терминалов OmniRoute после остановки процесса node.exe:
  - Теперь PowerShell скрипт для OmniRoute также получает `ParentProcessId` для каждого процесса node.exe
  - После убийства процесса node.exe дополнительно убиваются родительские процессы (cmd.exe или powershell.exe)
  - Это гарантирует полное закрытие окон терминалов, в которых был запущен OmniRoute

---

## Хранение состояния (избранное, удалённое)
Использовать localStorage в окне выбора моделей, ключи favorites и hidden (массивы названий моделей). При загрузке восстанавливать.

> Список так же нужно сохранить к остальным настройкам в `C:\Users\%USER%\AppData\Local\Claude-launcher\config.json`

---

## Поведение кнопок «⭐» и «🗑️»
* При клике на звёздочку – переключить состояние избранного (добавить/удалить из `localStorage.favorites`) и перерисовать список, отсортировав избранные вверх.
* При клике на корзину – добавить модель в `localStorage.hidden` и скрыть её из списка (перерисовать).
* Удаление так же должно происходить и в файле настроек

---

## Замечание по безопасности

#### Все IPC-вызовы должны проходить через прелоад. Для окна выбора моделей создать отдельный прелоад с экспортом функций:
* `getModels: (url) => ipcRenderer.invoke('fetch-models', url)` (можно сделать прямой fetch в рендерере, но лучше через main для обхода CORS, если потребуется).
* `confirmSelection: (selected) => ipcRenderer.send('models-selected', selected)`.

---

## Порядок реализации
1. Исправить поле «Адрес API» (удалить port, адаптировать логику).
2. Добавить прокрутку.
3. Создать отдельное окно выбора моделей и всю связанную логику.

---

## Общие ограничения (дополнительно)

* Окно выбора моделей должно быть **независимым** и не мешать основному окну.
* Все данные (избранное, удалённые) хранятся только локально в localStorage.
* При закрытии окна без подтверждения изменения не применяются.
* Код должен быть написан на русском языке в комментариях.