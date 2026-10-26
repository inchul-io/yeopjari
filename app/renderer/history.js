(async function () {
  const api = window.yeop;
  const list = document.getElementById('list');
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const pad = (n) => String(n).padStart(2, '0');

  function render(items) {
    if (!items.length) { list.innerHTML = '<div class="empty">아직 대화가 없어요.<br>캐릭터를 클릭해서 한마디 남겨보세요!</div>'; return; }
    let lastDay = '';
    list.innerHTML = items.map((h) => {
      const d = new Date(h.at);
      const day = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      const head = day !== lastDay ? `<div class="day">${day}</div>` : '';
      lastDay = day;
      return `${head}<div class="m ${h.mine ? 'mine' : ''}">${h.mine ? '' : `<div class="who">${esc(h.name)}</div>`}
        <div class="txt">${esc(h.text)}</div><div class="time">${pad(d.getHours())}:${pad(d.getMinutes())}</div></div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  render(await api.getHistory());
  api.onHistory(render);
  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = document.getElementById('t');
    const text = t.value.trim();
    if (text) api.sendFromHistory(text);
    t.value = '';
  });
})();
