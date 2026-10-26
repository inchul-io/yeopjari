// 픽셀 캐릭터 (16x16, 왼쪽 절반만 그리고 좌우 대칭으로 완성)
// o 외곽선, b 몸 색, d 몸 어두운 색, l 밝은 색, e 눈, p 분홍, y 노랑(부리)
(function (global) {
  const HEADS = {
    cat: [
      '........',
      '..o.....',
      '..oo....',
      '..obo...',
      '..obbooo',
      '.obbbbbb',
      '.obbbbbb',
      '.obbebbb',
      '.obbebbb',
      '.obpbbbp',
      '..obbbbb',
      '...ooooo',
    ],
    dog: [
      '........',
      '........',
      '...ooooo',
      '.oodbbbb',
      'oddobbbb',
      'oddobbbb',
      'oddbebbb',
      'oddbebbb',
      '.odbbbll',
      '.oobblll',
      '...obllo',
      '...ooooo',
    ],
    rabbit: [
      '...oo...',
      '..olo...',
      '..olo...',
      '..olo...',
      '..obbooo',
      '.obbbbbb',
      '.obbbbbb',
      '.obbebbb',
      '.obbebbb',
      '.obpbbbb',
      '..obbbbp',
      '...ooooo',
    ],
    bear: [
      '........',
      '.ooo....',
      'olloo...',
      'olbbbooo',
      '.obbbbbb',
      '.obbbbbb',
      '.obbbbbb',
      '.obbebbb',
      '.obbebll',
      '.obbblll',
      '..obbllo',
      '...ooooo',
    ],
    duck: [
      '........',
      '........',
      '....oooo',
      '...obbbb',
      '..obbbbb',
      '..obbbbb',
      '.obbebbb',
      '.obbebbb',
      '.obbbyyy',
      '.obbyyyy',
      '..obbyyy',
      '...ooooo',
    ],
  };

  // 추가 10종 (head만 쓰면 기본 몸통, 객체면 몸통/눈꺼풀/고정색 지정)
  const EXTRA = {
    parrot: { head: ['......oo', '.....obb', '....oobb', '...obbbb', '..obbbbb', '.obwwbbb', '.obwebbb', '.obwebbb', '.obbwbkk', '.obbbbkk', '..obbbbk', '...ooooo'], lid: 'w' },
    pig: { head: ['........', '........', '..oo....', '..odoooo', '.obdbbbb', '.obbbbbb', '.obbebbb', '.obbebbb', '.obbbooo', '.obbopop', '..obbooo', '...ooooo'] },
    penguin: {
      head: ['........', '........', '...ooooo', '..obbbbb', '.obbbbbb', '.obbwwww', '.obwewww', '.obwewww', '.obwwwyy', '.obbwwwy', '..obbwww', '...obwww'],
      body: ['..obwwww', '.obbwwww', '..obwwww'], lid: 'w',
    },
    hamster: { head: ['........', '........', '.ooo....', 'oppboooo', 'obbbbbbb', 'obbbbbbb', 'obbebbbb', 'olbebbll', 'ollllllp', '.ollllll', '..olllll', '...ooooo'] },
    fox: { head: ['.o......', '.oo.....', '.odo....', '.obbo...', '.obbbooo', 'obbbbbbb', 'obbebbbb', 'olbebbbb', 'ollllbbb', '.ollllll', '..ollllo', '...ooooo'] },
    panda: {
      head: ['........', '.oo.....', 'okko....', 'okkooooo', '.obbbbbb', '.obbbbbb', '.okkbbbb', '.okekbbb', '.obkkbbb', '.obbbbbk', '..obbbbb', '...ooooo'],
      body: ['...okbbb', '..okkbbb', '...obbbb'], lid: 'k', pal: { b: '#f7f5f0', e: '#ffffff' },
    },
    frog: { head: ['........', '........', '.oooo...', 'owweo...', 'owweoooo', 'obbbbbbb', 'obbbbbbb', 'obpbbbbb', 'obbobbbb', '.obboooo', '..obllll', '...ooooo'], lid: 'w' },
    sheep: {
      head: ['........', '...ooooo', '..owwwww', '.owwwwww', '.owwbbbb', 'obbobbbb', '.oobebbb', '..obebbb', '..obbbbb', '..obbbbp', '...obbbb', '...ooooo'],
      body: ['..owwwww', '.owwwwww', '..owwwww'],
    },
    monkey: { head: ['........', '........', '...ooooo', '..obbbbb', '.obbbbbb', 'oobbllll', 'olbllell', 'olbllell', 'oobbllll', '.obllllo', '..obllll', '...ooooo'], lid: 'l' },
    tiger: { head: ['........', '.ooo....', 'olloo...', 'olbbbooo', '.obbbbbd', '.odbbbbb', '.obbebbb', '.odbebbb', '.obbblll', '.odblllo', '..obllll', '...ooooo'] },
  };
  Object.keys(EXTRA).forEach((k) => { HEADS[k] = EXTRA[k].head; });
  const BODY = ['...oblll', '..obblll', '...obbbb'];
  const LEGS = {
    stand: [['...obo..', '...obo..'], ['...ooo..', '...ooo..']],
    walk1: [['...obo..', '...ooo..'], ['...ooo..', '........']],
    walk2: [['...ooo..', '...obo..'], ['........', '...ooo..']],
  };

  const ANIMALS = [
    { id: 'cat', name: '고양이', color: '#f4a259' },
    { id: 'dog', name: '강아지', color: '#f6e7cb' },
    { id: 'rabbit', name: '토끼', color: '#ffffff' },
    { id: 'bear', name: '곰', color: '#9c6644' },
    { id: 'duck', name: '오리', color: '#ffd166' },
    { id: 'parrot', name: '앵무새', color: '#57cc99' },
    { id: 'pig', name: '돼지', color: '#ffc8dd' },
    { id: 'penguin', name: '펭귄', color: '#4a4e69' },
    { id: 'hamster', name: '햄스터', color: '#f4a259' },
    { id: 'fox', name: '여우', color: '#f28c38' },
    { id: 'panda', name: '판다', color: '#f7f5f0' },
    { id: 'frog', name: '개구리', color: '#a7c957' },
    { id: 'sheep', name: '양', color: '#9c6644' },
    { id: 'monkey', name: '원숭이', color: '#9c6644' },
    { id: 'tiger', name: '호랑이', color: '#ffb347' },
  ];
  const COLORS = ['#f4a259', '#f6e7cb', '#9c6644', '#b8c0ff', '#ffc8dd', '#a7c957', '#ffd166', '#8d99ae', '#ffffff', '#4a4e69', '#57cc99', '#ef476f', '#f28c38', '#ffb347'];

  const mirror = (h) => h + h.split('').reverse().join('');

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
    return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  // frame: stand | walk1 | walk2, eyes: open | half | closed
  function grid(animal, frame, eyes) {
    const head = (HEADS[animal] || HEADS.cat).map(mirror);
    const ex = EXTRA[animal] || {};
    const body = (ex.body || BODY).map(mirror);
    const lg = LEGS[frame] || LEGS.stand;
    const legs = [lg[0][0] + lg[0][1].split('').reverse().join(''), lg[1][0] + lg[1][1].split('').reverse().join('')];
    const rows = [...head, ...body, ...legs].map((r) => r.split(''));
    const eyeRows = [];
    rows.forEach((r, i) => { if (r.includes('e')) eyeRows.push(i); });
    if (eyes !== 'open' && eyeRows.length) {
      const top = eyeRows[0];
      rows[top] = rows[top].map((c) => (c === 'e' ? ex.lid || 'b' : c));
      if (eyes === 'closed') {
        const bot = eyeRows[eyeRows.length - 1];
        rows[bot] = rows[bot].map((c) => (c === 'e' ? 'o' : c));
      }
    }
    return rows;
  }

  function draw(ctx, animal, color, frame, eyes, scale, ox, oy) {
    const pal = {
      o: '#2b2233', b: color, d: shade(color, -0.28), l: shade(color, 0.55),
      e: '#1d1d24', p: '#ff8fab', y: '#ffb627', k: '#2f2a36', w: '#fffdf7',
    };
    const ex = EXTRA[animal];
    if (ex && ex.pal) Object.assign(pal, ex.pal);
    if (ex && ex.pal && ex.pal.b) { pal.d = shade(pal.b, -0.28); pal.l = shade(pal.b, 0.55); }
    if (animal === 'panda' && !['#f7f5f0', '#ffffff'].includes(color.toLowerCase())) pal.k = shade(color, -0.35);
    if (animal === 'duck') pal.l = pal.b;
    const rows = grid(animal, frame, eyes);
    rows.forEach((r, y) => r.forEach((c, x) => {
      if (c === '.') return;
      ctx.fillStyle = pal[c];
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }));
  }

  function toCanvas(animal, color, frame, eyes, scale) {
    const c = document.createElement('canvas');
    c.width = 16 * scale; c.height = 17 * scale;
    draw(c.getContext('2d'), animal, color, frame || 'stand', eyes || 'open', scale, 0, 0);
    return c;
  }

  global.Sprites = { ANIMALS, COLORS, draw, toCanvas, shade, ROWS: 17 };
})(typeof window !== 'undefined' ? window : globalThis);
