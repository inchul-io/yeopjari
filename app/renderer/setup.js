(async function () {
  const api = window.yeop;
  const prev = (await api.getConfig()) || {};
  const state = {
    name: prev.name || '',
    animal: prev.animal || 'cat',
    color: prev.color || Sprites.COLORS[0],
    groupCode: prev.groupCode || '',
    position: prev.position || 'full',
    display: prev.display || 0,
    autoStart: prev.autoStart !== false,
    customBroker: prev.customBroker || '',
  };
  let picked = !!prev.color;   // 사용자가 직접 색을 골랐는지
  let hover = null;            // 마우스를 올린 색 (임시 미리보기)
  const shown = () => hover || state.color;
  const suggested = (id) => (Sprites.ANIMALS.find((a) => a.id === id) || {}).color || Sprites.COLORS[0];
  const $ = (id) => document.getElementById(id);
  if (prev.name) $('save').textContent = '저장하기';

  function renderAnimals() {
    const box = $('animals');
    box.innerHTML = '';
    Sprites.ANIMALS.forEach((a) => {
      const d = document.createElement('div');
      d.className = 'animal' + (a.id === state.animal ? ' on' : '');
      const col = a.id === state.animal || picked || hover ? shown() : a.color || state.color;
      d.appendChild(Sprites.toCanvas(a.id, col, 'stand', 'open', 3));
      d.appendChild(document.createTextNode(a.name));
      d.onclick = () => { state.animal = a.id; if (!picked && a.color) state.color = a.color; renderAll(); };
      box.appendChild(d);
    });
  }
  function renderColors() {
    const box = $('colors');
    box.innerHTML = '';
    Sprites.COLORS.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'color' + (c === state.color ? ' on' : '');
      d.style.background = c;
      d.title = c;
      d.onclick = () => { state.color = c; picked = true; hover = null; renderAll(); };
      d.onmouseenter = () => { hover = c; renderAnimals(); renderPreview(); };
      d.onmouseleave = () => { hover = null; renderAnimals(); renderPreview(); };
      box.appendChild(d);
    });
  }
  let frame = 0;
  function renderPreview() {
    const ctx = $('pv').getContext('2d');
    ctx.clearRect(0, 0, 64, 68);
    Sprites.draw(ctx, state.animal, shown(), ['walk1', 'stand', 'walk2', 'stand'][frame % 4], 'open', 4, 0, 0);
  }
  setInterval(() => { frame++; renderPreview(); }, 260);
  function renderPos() {
    document.querySelectorAll('#pos button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.position));
  }
  function renderAll() { renderAnimals(); renderColors(); renderPreview(); renderPos(); }

  document.querySelectorAll('#pos button').forEach((b) => (b.onclick = () => { state.position = b.dataset.v; renderPos(); }));
  const displays = await api.getDisplays();
  $('display').innerHTML = displays.map((d) => `<option value="${d.index}">${d.label}</option>`).join('');
  $('display').value = String(state.display);
  $('name').value = state.name;
  $('code').value = state.groupCode;
  $('autoStart').checked = state.autoStart;
  $('broker').value = state.customBroker;
  $('name').addEventListener('input', () => { $('pvname').textContent = $('name').value.trim() || '나'; });
  $('pvname').textContent = state.name || '나';
  $('reset').onclick = () => { picked = false; state.color = suggested(state.animal); renderAll(); };
  $('gen').onclick = async () => { $('code').value = await api.newCode(); };

  $('save').onclick = async () => {
    const name = $('name').value.trim();
    const code = $('code').value.trim().toUpperCase();
    const broker = $('broker').value.trim();
    if (!name) return ($('err').textContent = '이름을 입력해 주세요.');
    if (code.length < 6) return ($('err').textContent = '그룹 코드를 입력하거나 [새 그룹 만들기]를 눌러주세요.');
    if (broker && !/^wss?:\/\//.test(broker)) return ($('err').textContent = '서버 주소는 wss:// 로 시작해야 합니다.');
    await api.saveConfig({
      name, animal: state.animal, color: state.color, groupCode: code, position: state.position,
      display: Number($('display').value) || 0, autoStart: $('autoStart').checked, customBroker: broker,
    });
  };
  renderAll();
})();
