(async function () {
  const api = window.yeop;
  const cfg = await api.getConfig();
  if (!cfg) return;

  const stage = document.getElementById('stage');
  const composer = document.getElementById('composer');
  const msgInput = document.getElementById('msg');
  const menu = document.getElementById('menu');
  const statusEl = document.getElementById('status');
  const SCALE = 4;
  const STALE_MS = 100 * 1000;
  const HIDE_OFFLINE_MS = 12 * 3600 * 1000;
  const ITEMS = ['💩', '⚾', '🐤', '💖', '🍌', '❄️', '🍙', '⭐'];

  let quiet = !!cfg.quiet;
  let myStatus = cfg.myStatus || 'online';
  let connected = false;
  const chars = new Map();

  // ---------- 암호화 (그룹 코드를 아는 사람만 읽을 수 있음) ----------
  const te = new TextEncoder();
  const td = new TextDecoder();
  const code = cfg.groupCode.trim().toUpperCase();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('yeop-topic:' + code)));
  const root = 'yeop1/' + [...hash].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  const baseKey = await crypto.subtle.importKey('raw', te.encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode('yeop-v1-salt'), iterations: 120000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

  async function seal(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv); out.set(ct, 12);
    return out;
  }
  async function open(bytes) {
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
      return JSON.parse(td.decode(pt));
    } catch (e) { return null; }
  }

  // ---------- 캐릭터 ----------
  const W = () => window.innerWidth;
  const rand = (a, b) => a + Math.random() * (b - a);

  function makeChar(p) {
    const el = document.createElement('div');
    el.className = 'char';
    el.innerHTML = '<div class="bubble"></div><div class="tag"><i></i><span></span></div><canvas></canvas><div class="fx"></div>';
    stage.appendChild(el);
    const canvas = el.querySelector('canvas');
    canvas.width = 16 * SCALE; canvas.height = 17 * SCALE;
    canvas.classList.add('hit');
    const c = {
      id: p.id, el, canvas, ctx: canvas.getContext('2d'),
      bubble: el.querySelector('.bubble'), tag: el.querySelector('.tag span'), fx: el.querySelector('.fx'),
      x: rand(60, Math.max(80, W() - 60)), target: null, pauseUntil: 0, speed: rand(16, 28),
      frame: 'stand', lastStep: 0, drawn: '', bubbleUntil: 0, typingUntil: 0, dizzyUntil: 0, poopUntil: 0, jumpAt: 0,
      seenAt: Date.now(),
    };
    canvas.addEventListener('click', () => { hideMenu(); openComposer(); });
    canvas.addEventListener('dblclick', () => { if (c.id !== cfg.userId) sendEvent({ t: 'hi', to: c.id }); });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(c, e.clientX, e.clientY); });
    chars.set(p.id, c);
    return c;
  }

  function upsertPresence(p, seenAt) {
    if (!p || !p.id) return;
    const c = chars.get(p.id) || makeChar(p);
    Object.assign(c, { name: p.name, animal: p.animal, color: p.color, status: p.status, at: p.at, seenAt });
    c.tag.textContent = p.name + (p.id === cfg.userId ? ' (나)' : '');
    c.drawn = '';
  }

  function effectiveStatus(c) {
    if (c.id === cfg.userId) return connected ? myStatus : 'online';
    if (c.status === 'offline') return 'offline';
    if (Date.now() - c.seenAt > STALE_MS) return 'offline';
    return c.status || 'online';
  }

  function drawChar(c, eyes) {
    const k = c.animal + c.color + c.frame + eyes;
    if (k === c.drawn) return;
    c.drawn = k;
    c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
    Sprites.draw(c.ctx, c.animal, c.color, c.frame, eyes, SCALE, 0, 0);
  }

  function say(c, text, ms) {
    c.bubble.classList.remove('typing');
    c.bubble.textContent = quiet ? '💬' : text;
    c.bubble.classList.add('show');
    c.bubbleUntil = Date.now() + (ms || Math.min(15000, 5000 + text.length * 90));
    c.typingUntil = 0;
  }

  let lastT = performance.now();
  function tick(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    const now = Date.now();
    for (const c of chars.values()) {
      const st = effectiveStatus(c);
      c.el.classList.toggle('online', st === 'online');
      c.el.classList.toggle('away', st === 'away');
      c.el.classList.toggle('offline', st === 'offline');
      c.el.classList.toggle('me', c.id === cfg.userId);
      const visible = !(st === 'offline' && now - (c.at || 0) > HIDE_OFFLINE_MS);
      c.el.style.display = visible ? '' : 'none';
      if (!visible) continue;

      let eyes = 'open';
      let moving = false;
      const busy = now < c.bubbleUntil || now < c.typingUntil || c.id === composerOwner;
      if (st === 'online' && !busy && now > c.dizzyUntil) {
        if (c.target == null && now > c.pauseUntil) c.target = rand(60, Math.max(80, W() - 60));
        if (c.target != null) {
          const dx = c.target - c.x;
          const step = c.speed * dt;
          if (Math.abs(dx) <= step) { c.x = c.target; c.target = null; c.pauseUntil = now + rand(1500, 6000); }
          else { c.x += Math.sign(dx) * step; moving = true; }
        }
      }
      c.x = Math.max(40, Math.min(W() - 40, c.x));
      if (moving) {
        if (t - c.lastStep > 220) { c.frame = c.frame === 'walk1' ? 'walk2' : 'walk1'; c.lastStep = t; }
      } else c.frame = 'stand';
      if (st === 'away') eyes = 'half';
      if (st === 'offline') eyes = 'closed';

      // 효과
      let fx = '';
      if (st === 'away') fx = '<span class="zz">z</span>';
      if (st === 'offline') fx = '<span class="zz">Zz</span>';
      if (now < c.dizzyUntil) { fx = '<span class="stars">✦ ✧</span>'; eyes = 'closed'; }
      if (now < c.poopUntil) fx += '<span class="poop">💩<b>~</b></span>';
      if (c.fx.dataset.k !== fx) { c.fx.innerHTML = fx; c.fx.dataset.k = fx; }

      let ty = moving && c.frame === 'walk1' ? -2 : 0;
      let rot = 0;
      const sinceJump = now - c.jumpAt;
      if (sinceJump < 500) ty -= Math.sin((sinceJump / 500) * Math.PI) * 26;
      if (now < c.dizzyUntil) rot = Math.sin(now / 70) * 9;
      c.el.style.left = c.x + 'px';
      c.el.style.transform = `translateY(${ty}px) rotate(${rot}deg)`;
      drawChar(c, eyes);

      // 말풍선 / 입력 중
      if (now < c.typingUntil && now >= c.bubbleUntil) {
        if (!c.bubble.classList.contains('typing')) { c.bubble.classList.add('typing', 'show'); }
        c.bubble.textContent = ['·', '· ·', '· · ·'][Math.floor(now / 350) % 3];
      } else if (now >= c.bubbleUntil && c.bubble.classList.contains('show')) {
        c.bubble.classList.remove('show', 'typing');
      }
    }
    if (composer.classList.contains('show')) {
      const me = chars.get(cfg.userId);
      if (me) composer.style.left = Math.max(135, Math.min(W() - 135, me.x)) + 'px';
    }
    requestAnimationFrame(tick);
  }

  // ---------- 클릭 통과 처리 ----------
  let ignoring = true;
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.setIgnore(v); } }
  window.addEventListener('mousemove', (e) => {
    if (composer.classList.contains('show') || menu.classList.contains('show')) return setIgnore(false);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setIgnore(!(el && el.closest('.hit')));
  });
  document.addEventListener('mouseleave', () => {
    if (!composer.classList.contains('show') && !menu.classList.contains('show')) setIgnore(true);
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.hit')) { closeComposer(); hideMenu(); }
  });

  // ---------- 메시지 입력 ----------
  let composerOwner = null;
  let lastTypingSent = 0;
  function openComposer() {
    composerOwner = cfg.userId;
    composer.classList.add('show');
    setIgnore(false);
    setTimeout(() => msgInput.focus(), 30);
  }
  function closeComposer() {
    composerOwner = null;
    composer.classList.remove('show');
    msgInput.value = '';
    updateCount();
    setIgnore(true);
  }
  function updateCount() { composer.querySelector('.count').textContent = `${msgInput.value.length}/80`; }
  function submit() {
    const text = msgInput.value.trim();
    if (text) sendMessage(text);
    closeComposer();
  }
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') closeComposer();
  });
  msgInput.addEventListener('input', () => {
    updateCount();
    if (Date.now() - lastTypingSent > 2000 && msgInput.value) { lastTypingSent = Date.now(); sendEvent({ t: 'typing' }); }
  });
  document.getElementById('send').addEventListener('click', submit);

  function sendMessage(text) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
    const ev = { t: 'msg', id, text };
    sendEvent(ev);
  }

  // ---------- 던지기 메뉴 ----------
  function showMenu(c, x, y) {
    const isMe = c.id === cfg.userId;
    menu.innerHTML = isMe
      ? `<div class="title">나 (${esc(c.name)})</div><div class="grid">
           <button class="wide" data-a="write">✏️ 메시지 쓰기</button>
           <button class="wide" data-a="history">🕘 최근 대화</button>
           <button class="wide" data-a="setup">⚙️ 설정</button></div>`
      : `<div class="title">${esc(c.name)}에게</div><div class="grid">
           ${ITEMS.map((i) => `<button data-item="${i}">${i}</button>`).join('')}
           <button class="wide" data-a="hi">👋 인사하기</button></div>`;
    menu.classList.add('show');
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(W() - r.width - 4, x - r.width / 2)) + 'px';
    menu.style.top = Math.max(4, y - r.height - 12) + 'px';
    setIgnore(false);
    menu.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.item) sendEvent({ t: 'throw', to: c.id, item: b.dataset.item });
      if (b.dataset.a === 'hi') sendEvent({ t: 'hi', to: c.id });
      if (b.dataset.a === 'write') { hideMenu(); return openComposer(); }
      if (b.dataset.a === 'history') api.openHistory();
      if (b.dataset.a === 'setup') api.openSetup();
      hideMenu();
    };
  }
  function hideMenu() {
    if (!menu.classList.contains('show')) return;
    menu.classList.remove('show');
    if (!composer.classList.contains('show')) setIgnore(true);
  }
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function animateThrow(fromC, toC, item) {
    const p = document.createElement('div');
    p.className = 'proj';
    p.textContent = item;
    stage.appendChild(p);
    const H = window.innerHeight;
    const sx = fromC ? fromC.x : (toC.x > W() / 2 ? 0 : W());
    const sy = H - 60;
    const start = performance.now();
    const dur = 750;
    const peak = 120 + Math.random() * 40;
    function step(t) {
      const k = Math.min(1, (t - start) / dur);
      const ex = toC.x, ey = H - 70;
      const x = sx + (ex - sx) * k;
      const y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * peak;
      p.style.left = x - 12 + 'px';
      p.style.top = y - 12 + 'px';
      p.style.transform = `rotate(${k * 720}deg)`;
      if (k < 1) return requestAnimationFrame(step);
      toC.dizzyUntil = Date.now() + 1600;
      toC.target = null;
      if (item === '💩') {
        toC.poopUntil = Date.now() + 6000;
        p.remove();
        if (Date.now() > toC.bubbleUntil) say(toC, '으엑!! 💩', 2500);
        return;
      }
      // 맞고 떨어지기
      const fall = performance.now();
      const vx = (Math.random() - 0.5) * 120;
      (function drop(t2) {
        const s = (t2 - fall) / 1000;
        p.style.left = x - 12 + vx * s + 'px';
        p.style.top = y - 12 + 160 * s + 300 * s * s + 'px';
        p.style.opacity = String(Math.max(0, 1 - s * 1.4));
        if (s < 0.8) requestAnimationFrame(drop); else p.remove();
      })(fall);
    }
    requestAnimationFrame(step);
  }

  // ---------- 통신 ----------
  const T_PRESENCE = root + '/p/';
  const T_EVENT = root + '/e';
  const myPresence = (status) => ({
    id: cfg.userId, name: cfg.name, animal: cfg.animal, color: cfg.color, status, at: Date.now(),
  });

  const willPayload = await seal(myPresence('offline'));
  const client = new MqttLite({
    urls: cfg.brokers,
    clientId: 'yeop-' + cfg.userId.slice(0, 8) + '-' + Math.random().toString(36).slice(2, 8),
    will: { topic: T_PRESENCE + cfg.userId, payload: willPayload, retain: true },
    onStatus: (s) => {
      connected = s === 'connected';
      if (connected) { publishPresence(); statusEl.classList.remove('show'); }
      else if (s === 'retry' || s === 'disconnected' || s === 'refused') {
        statusEl.textContent = '연결 재시도 중… (회사 방화벽이면 설정에서 서버 변경)';
        statusEl.classList.add('show');
      }
    },
    onMessage: async (topic, payload, retained) => {
      if (!payload.length) return;
      const data = await open(payload);
      if (!data) return;
      if (topic.startsWith(T_PRESENCE)) {
        if (data.id === cfg.userId) return;
        upsertPresence(data, retained ? data.at : Date.now());
      } else if (topic === T_EVENT) {
        handleEvent(data);
      }
    },
  });
  client.subscribe(T_PRESENCE + '+');
  client.subscribe(T_EVENT);

  async function publishPresence(status) {
    const p = myPresence(status || myStatus);
    upsertPresence(p, Date.now());
    client.publish(T_PRESENCE + cfg.userId, await seal(p), true);
  }
  async function sendEvent(ev) {
    ev.from = cfg.userId;
    ev.at = Date.now();
    handleEvent(ev); // 내 화면에 바로 반영
    client.publish(T_EVENT, await seal(ev), false);
  }
  const seenEvents = new Set();
  function handleEvent(ev) {
    if (!ev || Math.abs(Date.now() - ev.at) > 120000) return;
    const key = ev.t + ev.from + ev.at + (ev.id || '');
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    if (seenEvents.size > 500) seenEvents.clear();
    const from = chars.get(ev.from);
    if (from) from.seenAt = Date.now();
    if (ev.t === 'msg' && from) {
      say(from, ev.text);
      api.addHistory({ id: ev.id, from: ev.from, name: from.name, text: ev.text, at: ev.at, mine: ev.from === cfg.userId });
    } else if (ev.t === 'typing' && from && ev.from !== cfg.userId) {
      from.typingUntil = Date.now() + 4000;
    } else if (ev.t === 'throw') {
      const to = chars.get(ev.to);
      if (to) animateThrow(from, to, ev.item);
    } else if (ev.t === 'hi') {
      const to = chars.get(ev.to);
      if (from) from.jumpAt = Date.now();
      if (to) setTimeout(() => { to.jumpAt = Date.now(); }, 450);
      if (from && to) say(from, `👋 ${to.name}님 안녕!`, 3500);
    }
  }

  // ---------- 메인 프로세스 연동 ----------
  api.onOpenInput(() => openComposer());
  api.onQuiet((v) => { quiet = v; });
  api.onMyStatus((s) => { myStatus = s; publishPresence(); });
  api.onSendText((text) => sendMessage(text));
  api.onUpdated((u) => {
    const me = chars.get(cfg.userId);
    if (me) say(me, `🎉 v${u.to} 업데이트 완료!${u.notes ? '\n' + u.notes : ''}`, 9000);
  });
  api.onGoingOffline(async () => { await publishPresence('offline'); setTimeout(() => client.stop(), 200); });
  setInterval(() => { if (connected) publishPresence(); }, 30000);
  window.addEventListener('resize', () => { for (const c of chars.values()) c.x = Math.min(c.x, W() - 40); });

  upsertPresence(myPresence(myStatus), Date.now());
  client.start();
  requestAnimationFrame(tick);
  window.__yeop = { chars, sendEvent, sendMessage, openComposer }; // 테스트용
})();
