const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, powerMonitor, nativeImage, clipboard, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const updater = require('./updater');

if (process.env.YEOP_USERDATA) app.setPath('userData', process.env.YEOP_USERDATA);
app.setAppUserModelId('app.yeopjari.messenger');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const DATA = () => app.getPath('userData');
const CONFIG_FILE = () => path.join(DATA(), 'config.json');
const HISTORY_FILE = () => path.join(DATA(), 'history.json');
const ICON = path.join(__dirname, 'assets', 'icon.png');
const OVERLAY_H = 260;
const HISTORY_DAYS = 7;

// 채팅 단축키 후보 (앞에서부터 기본값 → 등록 실패 시 다음 후보로)
const CHAT_KEYS = [
  { key: 'Alt+`', label: 'Alt + `  (숫자 1 왼쪽 키)' },
  { key: 'Control+Alt+Enter', label: 'Ctrl + Alt + Enter' },
  { key: 'Control+Alt+Space', label: 'Ctrl + Alt + Space' },
  { key: 'Alt+Enter', label: 'Alt + Enter  (⚠ 엑셀 셀 줄바꿈 안 됨)' },
];
const keyLabel = (k) => (CHAT_KEYS.find((c) => c.key === k) || { label: k }).label.replace(/\s*\(.*\)/, '').replace(/ \+ /g, '+');
let chatKey = null;

const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

let config = null;
let overlay = null;
let setupWin = null;
let historyWin = null;
let tray = null;
let quiet = false;
let hidden = false;
let myStatus = 'online';
let quitting = false;

// ---------- 저장 ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function loadConfig() {
  const c = readJson(CONFIG_FILE(), null);
  if (c && process.env.YEOP_BROKER) c.brokers = [process.env.YEOP_BROKER];
  return c;
}
function brokersOf(c) {
  if (process.env.YEOP_BROKER) return [process.env.YEOP_BROKER];
  const custom = (c.customBroker || '').trim();
  return custom ? [custom, ...DEFAULT_BROKERS] : DEFAULT_BROKERS;
}

function loadHistory() {
  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  return readJson(HISTORY_FILE(), []).filter((h) => h.at >= cutoff);
}
function addHistory(entry) {
  const list = loadHistory();
  if (list.some((h) => h.id === entry.id)) return;
  list.push(entry);
  list.sort((a, b) => a.at - b.at);
  writeJson(HISTORY_FILE(), list.slice(-500));
  if (historyWin && !historyWin.isDestroyed()) historyWin.webContents.send('history', loadHistory());
}

// ---------- 창 ----------
function overlayBounds() {
  const displays = screen.getAllDisplays();
  const d = displays[config.display || 0] || screen.getPrimaryDisplay();
  const wa = d.workArea;
  const third = Math.floor(wa.width / 3);
  let x = wa.x, w = wa.width;
  if (config.position === 'left') { w = third; }
  else if (config.position === 'center') { x = wa.x + third; w = third; }
  else if (config.position === 'right') { x = wa.x + wa.width - third; w = third; }
  return { x, y: wa.y + wa.height - OVERLAY_H, width: w, height: OVERLAY_H };
}

function createOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = new BrowserWindow({
    ...overlayBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => { if (!hidden) overlay.showInactive(); });
  overlay.webContents.once('did-finish-load', () => {
    const u = updater.takeJustUpdated();
    if (u) setTimeout(() => sendOverlay('updated', u), 2500);
  });
  overlay.on('closed', () => { overlay = null; });
}

function openSetup() {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.show(); setupWin.focus(); return; }
  setupWin = new BrowserWindow({
    width: 580, height: Math.min(1000, screen.getPrimaryDisplay().workAreaSize.height - 50), useContentSize: true, resizable: false, title: '옆자리 설정', icon: ICON,
    autoHideMenuBar: true, backgroundColor: '#fff8ef',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWin.on('closed', () => {
    setupWin = null;
    if (!config) app.quit();
  });
}

function openHistory() {
  if (historyWin && !historyWin.isDestroyed()) { historyWin.show(); historyWin.focus(); return; }
  historyWin = new BrowserWindow({
    width: 420, height: 600, title: '옆자리 최근 대화', icon: ICON,
    autoHideMenuBar: true, backgroundColor: '#fff8ef',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  historyWin.loadFile(path.join(__dirname, 'renderer', 'history.html'));
  historyWin.on('closed', () => { historyWin = null; });
}

// ---------- 트레이 ----------
function buildTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    tray.setToolTip(`옆자리 v${app.getVersion()}`);
    tray.on('click', () => sendOverlay('open-input'));
  }
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${config.name} · 그룹 ${config.groupCode}`, enabled: false },
    { type: 'separator' },
    { label: `메시지 쓰기\t${chatKey ? keyLabel(chatKey) : ''}`, click: () => sendOverlay('open-input') },
    { label: '최근 대화 보기', click: openHistory },
    { label: '조용히 모드 (말풍선 내용 숨김)', type: 'checkbox', checked: quiet, click: (i) => setQuiet(i.checked) },
    { label: '캐릭터 숨기기\tCtrl+Alt+H', type: 'checkbox', checked: hidden, click: (i) => setHidden(i.checked) },
    { type: 'separator' },
    { label: '그룹 코드 복사 (동료 초대용)', click: () => clipboard.writeText(config.groupCode) },
    { label: '설정', click: openSetup },
    { label: '저장 폴더 열기', click: () => shell.openPath(DATA()) },
    { label: `업데이트 확인 (현재 v${app.getVersion()})`, click: () => runUpdate(true) },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}

function sendOverlay(ch, data) {
  if (!overlay || overlay.isDestroyed()) return;
  if (ch === 'open-input') {
    if (hidden) setHidden(false);
    overlay.setIgnoreMouseEvents(false);
    overlay.show();
    overlay.focus();
  }
  overlay.webContents.send(ch, data);
}
function setQuiet(v) { quiet = v; sendOverlay('quiet', quiet); buildTray(); }
function setHidden(v) {
  hidden = v;
  if (overlay) { if (hidden) overlay.hide(); else overlay.showInactive(); }
  buildTray();
}

function setStatus(s) {
  if (s === myStatus) return;
  myStatus = s;
  sendOverlay('my-status', s);
}

function registerChatKey() {
  if (chatKey) { try { globalShortcut.unregister(chatKey); } catch (e) {} }
  chatKey = null;
  const wanted = config.chatKey || CHAT_KEYS[0].key;
  const order = [wanted, ...CHAT_KEYS.map((c) => c.key).filter((k) => k !== wanted)];
  for (const k of order) {
    let ok = false;
    try { ok = globalShortcut.register(k, () => sendOverlay('open-input', 'toggle')); } catch (e) { ok = false; }
    if (ok) {
      chatKey = k;
      if (k !== wanted) notify(`${keyLabel(wanted)}는 다른 프로그램이 쓰고 있어서 ${keyLabel(k)}로 바꿨어요. 설정에서 변경할 수 있어요.`);
      return;
    }
  }
  notify('채팅 단축키를 등록하지 못했어요. 캐릭터를 클릭해서 채팅할 수 있어요.');
}

function startApp() {
  quiet = !!config.quiet;
  registerChatKey();
  createOverlay();
  buildTray();
  try { app.setLoginItemSettings({ openAtLogin: !!config.autoStart }); } catch (e) {}
}

// ---------- 자동 업데이트 ----------
function notify(body) {
  try { new Notification({ title: '옆자리', body, icon: ICON }).show(); } catch (e) {}
}
async function runUpdate(manual) {
  const r = await updater.check({
    onApplied: () => setTimeout(() => { app.relaunch(); app.quit(); }, 800),
  });
  if (!manual) return;
  if (r.status === 'latest') notify(`최신 버전입니다 (v${r.version})`);
  else if (r.status === 'updated') notify(`v${r.version}으로 업데이트합니다. 잠시 후 다시 켜져요.`);
  else if (r.status === 'error') notify('업데이트 확인 실패: 인터넷 연결을 확인해 주세요.');
}

// ---------- IPC ----------
ipcMain.handle('get-config', () => (config ? { ...config, brokers: brokersOf(config), quiet, myStatus } : null));
ipcMain.handle('get-chat-keys', () => ({ keys: CHAT_KEYS, current: chatKey || config && config.chatKey || CHAT_KEYS[0].key }));
ipcMain.handle('get-displays', () => screen.getAllDisplays().map((d, i) => ({
  index: i, label: `모니터 ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (주 모니터)' : ''} · ${d.size.width}x${d.size.height}`,
})));
ipcMain.handle('new-code', () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return `YP-${s.slice(0, 4)}-${s.slice(4)}`;
});
ipcMain.handle('save-config', (e, c) => {
  const prev = config;
  config = { userId: (prev && prev.userId) || crypto.randomUUID(), ...prev, ...c };
  writeJson(CONFIG_FILE(), config);
  if (setupWin && !setupWin.isDestroyed()) setupWin.close();
  startApp();
  return true;
});
ipcMain.handle('get-history', () => loadHistory());
ipcMain.on('add-history', (e, entry) => addHistory(entry));
ipcMain.on('set-ignore', (e, ignore) => {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setIgnoreMouseEvents(ignore, { forward: true });
  if (ignore && overlay.isFocused()) overlay.blur();
});
ipcMain.on('send-from-history', (e, text) => sendOverlay('send-text', text));
ipcMain.on('open-history', openHistory);
ipcMain.on('open-setup', openSetup);

// ---------- 시작 ----------
app.on('second-instance', () => { if (config) sendOverlay('open-input'); else openSetup(); });
app.on('window-all-closed', (e) => { /* 트레이 앱이므로 유지 */ });

app.whenReady().then(() => {
  config = loadConfig();
  if (config) startApp(); else openSetup();

  globalShortcut.register('Control+Alt+H', () => setHidden(!hidden));

  // 자리 비움 감지: 5분 동안 입력이 없거나 화면 잠금이면 '조는 중'
  setInterval(() => {
    try { setStatus(powerMonitor.getSystemIdleTime() >= 300 ? 'away' : 'online'); } catch (e) {}
  }, 15000);
  powerMonitor.on('lock-screen', () => setStatus('away'));
  powerMonitor.on('unlock-screen', () => { setStatus('online'); sendOverlay('resume'); });
  powerMonitor.on('suspend', () => sendOverlay('suspend'));
  powerMonitor.on('resume', () => { setStatus('online'); setTimeout(() => sendOverlay('resume'), 3000); });

  // 다른 창에 가려지지 않도록 주기적으로 맨 위 유지
  setInterval(() => {
    if (overlay && !overlay.isDestroyed() && !hidden) { overlay.setAlwaysOnTop(true, 'screen-saver'); overlay.moveTop(); }
  }, 10000);

  // 켜고 20초 뒤, 그 후 3시간마다 업데이트 확인
  setTimeout(() => runUpdate(false), 20000);
  setInterval(() => runUpdate(false), 3 * 3600 * 1000);

  const reposition = () => { if (overlay && !overlay.isDestroyed()) overlay.setBounds(overlayBounds()); };
  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
});

app.on('before-quit', (e) => {
  if (quitting || !overlay || overlay.isDestroyed()) return;
  e.preventDefault();
  quitting = true;
  sendOverlay('going-offline');
  setTimeout(() => app.quit(), 600);
});
app.on('will-quit', () => globalShortcut.unregisterAll());
