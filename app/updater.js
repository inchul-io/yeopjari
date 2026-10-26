// 자동 업데이트: GitHub 저장소의 manifest.json을 확인해 바뀐 앱 파일만 받아 교체
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BASE = process.env.YEOP_UPDATE_BASE || 'https://raw.githubusercontent.com/inchul-io/yeopjari/main/';
const APP_DIR = __dirname;

function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function get(url) {
  const res = await net.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return Buffer.from(await res.arrayBuffer());
}

let busy = false;

// 반환: { status: 'latest' | 'updated' | 'error', version, notes, error }
async function check({ onApplied } = {}) {
  if (busy) return { status: 'busy' };
  busy = true;
  try {
    const manifest = JSON.parse((await get(BASE + 'manifest.json')).toString('utf8'));
    const current = app.getVersion();
    if (!manifest.version || !newer(manifest.version, current)) return { status: 'latest', version: current };

    fs.accessSync(APP_DIR, fs.constants.W_OK);
    const staging = path.join(app.getPath('userData'), 'update-staging', manifest.version);
    fs.rmSync(staging, { recursive: true, force: true });

    // 1) 전부 받아서 검증 (하나라도 틀리면 아무것도 바꾸지 않음)
    for (const f of manifest.files) {
      if (f.path.includes('..') || path.isAbsolute(f.path)) throw new Error('잘못된 경로: ' + f.path);
      const buf = await get(BASE + 'app/' + f.path.split('/').map(encodeURIComponent).join('/'));
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== f.sha256) throw new Error('파일 검증 실패: ' + f.path);
      const out = path.join(staging, f.path);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
    // 2) 앱 폴더에 덮어쓰기
    for (const f of manifest.files) {
      const dest = path.join(APP_DIR, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(staging, f.path), dest);
    }
    fs.rmSync(staging, { recursive: true, force: true });
    fs.writeFileSync(path.join(app.getPath('userData'), 'just-updated.json'),
      JSON.stringify({ from: current, to: manifest.version, notes: manifest.notes || '' }), 'utf8');
    if (onApplied) onApplied(manifest);
    return { status: 'updated', version: manifest.version, notes: manifest.notes };
  } catch (e) {
    return { status: 'error', error: String(e && e.message || e) };
  } finally {
    busy = false;
  }
}

function takeJustUpdated() {
  const f = path.join(app.getPath('userData'), 'just-updated.json');
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.unlinkSync(f);
    return d;
  } catch (e) { return null; }
}

module.exports = { check, takeJustUpdated, newer };
