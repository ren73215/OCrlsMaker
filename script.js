(function () {
  'use strict';

  /* ===== 상수 ===== */
  var KEY = 'characterRelationArchive_v6';
  var BOARD_W = 1600;
  var BOARD_H = 1200;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MIN_Y = 90;   // 호버 메뉴가 보드 위로 잘리지 않도록 위쪽 여백 확보
  var DIRS = ['to', 'from', 'both', 'none'];

  var REL_TYPES = {
    blue:   { name: '호의적', color: '#4a90e2' },
    red:    { name: '적대적', color: '#e25555' },
    pink:   { name: '애정',   color: '#ec6fa5' },
    yellow: { name: '무난함', color: '#e6b422' }
  };
  var PRESETS = ['#e07a5f', '#f2a65a', '#e9c46a', '#81b29a', '#4a90e2', '#7b6fd6', '#ec6fa5', '#8d99ae'];

  var DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#e6e1d6"/>' +
    '<circle cx="50" cy="38" r="18" fill="#b9b2a2"/>' +
    '<path d="M14 92c4-22 20-32 36-32s32 10 36 32z" fill="#b9b2a2"/></svg>'
  );

  /* ===== DOM ===== */
  function $(id) { return document.getElementById(id); }
  var wrap = $('boardWrap'), board = $('board'), linesEl = $('lines'), nodesEl = $('nodes');
  var emptyEl = $('empty'), hintEl = $('hint'), btnConnect = $('btnConnect');
  var charModal = $('charModal'), relModal = $('relModal');
  var fName = $('fName'), fImgFile = $('fImgFile'), fColor = $('fColor'), fMain = $('fMain');
  var rDir = $('rDir');
  var fStory = $('fStory'), fMemo = $('fMemo');
  var imgPreview = $('imgPreview'), previewAvatar = $('previewAvatar');
  var relSection = $('relSection'), relList = $('relList'), relTarget = $('relTarget');
  var rLabel = $('rLabel'), rDesc = $('rDesc'), relPair = $('relPair'), typeGroup = $('typeGroup');

  /* ===== 상태 ===== */
  var state = load();
  var connectMode = false;
  var connectFirst = null;
  var charCtx = null;   // 편집 중인 캐릭터 id (null이면 새 캐릭터)
  var imgData = '';     // 모달에서 선택한 프로필 사진 (data URL, 비어 있으면 기본 아바타)
  var relCtx = null;    // { id, a, b }

  /* ===== 저장 / 불러오기 ===== */
  function normalize(d) {
    var chars = [];
    var rels = [];
    if (!d || !Array.isArray(d.chars)) return { chars: [], rels: [] };
    d.chars.forEach(function (c) {
      if (!c || !c.id) return;
      chars.push({
        id: String(c.id),
        name: String(c.name || '이름 없음').slice(0, 30),
        img: typeof c.img === 'string' ? c.img : '',
        color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PRESETS[0],
        x: clamp(Number(c.x) || 200, 50, BOARD_W - 50),
        y: clamp(Number(c.y) || 200, MIN_Y, BOARD_H - 50),
        main: !!c.main,
        story: typeof c.story === 'string' ? c.story : '',
        memo: typeof c.memo === 'string' ? c.memo : ''
      });
    });
    var ids = {};
    chars.forEach(function (c) { ids[c.id] = true; });
    (Array.isArray(d.rels) ? d.rels : []).forEach(function (r) {
      if (!r || !ids[r.a] || !ids[r.b] || r.a === r.b || !REL_TYPES[r.type]) return;
      rels.push({
        id: String(r.id || uid()),
        a: r.a, b: r.b, type: r.type,
        dir: DIRS.indexOf(r.dir) >= 0 ? r.dir : 'to',
        label: typeof r.label === 'string' ? r.label.slice(0, 20) : '',
        desc: typeof r.desc === 'string' ? r.desc.slice(0, 20) : ''
      });
    });
    return { chars: chars, rels: rels };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* 무시 */ }
    return { chars: [], rels: [] };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('저장에 실패했어요. 브라우저의 저장 공간/시크릿 모드 설정을 확인해 주세요.');
    }
  }

  /* ===== 유틸 ===== */
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function getChar(id) {
    for (var i = 0; i < state.chars.length; i++) if (state.chars[i].id === id) return state.chars[i];
    return null;
  }
  function getRel(id) {
    for (var i = 0; i < state.rels.length; i++) if (state.rels[i].id === id) return state.rels[i];
    return null;
  }
  function textOn(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#2d2c28' : '#ffffff';
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* ===== 렌더링: 캐릭터 노드 ===== */
  function renderNodes() {
    nodesEl.innerHTML = '';
    state.chars.forEach(function (c) {
      var n = document.createElement('div');
      n.className = 'node' + (c.main ? ' main' : '') + (connectFirst === c.id ? ' selected' : '');
      n.dataset.id = c.id;
      n.style.left = c.x + 'px';
      n.style.top = c.y + 'px';
      n.style.setProperty('--pc', c.color);
      n.style.setProperty('--pt', textOn(c.color));

      var av = document.createElement('div');
      av.className = 'avatar';
      var img = new Image();
      img.alt = '';
      img.draggable = false;
      img.onerror = function () { img.onerror = null; img.src = DEFAULT_AVATAR; };
      img.src = c.img || DEFAULT_AVATAR;
      av.appendChild(img);

      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = c.name;

      n.appendChild(av);
      if (c.main) {
        var crown = document.createElement('span');
        crown.className = 'crown';
        crown.textContent = '★';
        n.appendChild(crown);
      }
      n.appendChild(tag);
      n.appendChild(buildNodeMenu(c));

      n.addEventListener('pointerdown', function (e) { onNodeDown(e, c, n); });
      nodesEl.appendChild(n);
    });
    emptyEl.hidden = state.chars.length > 0;
  }

  /* ===== 호버 설정 메뉴 ===== */
  function buildNodeMenu(c) {
    var menu = document.createElement('div');
    menu.className = 'node-menu';
    var row = document.createElement('div');
    row.className = 'row';

    var items = [
      { text: '상세', title: '상세 정보 / 수정', fn: function () { openCharModal(c.id); } },
      { text: '연결', title: '여기서 관계 연결 시작', fn: function () { startConnectFrom(c); } },
      { text: c.main ? '메인 해제' : '메인', title: '메인 캐릭터 지정/해제', fn: function () { toggleMain(c); } },
      { text: '삭제', title: '캐릭터 삭제', cls: 'del', fn: function () { deleteChar(c.id); } }
    ];
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.text;
      b.title = it.title;
      if (it.cls) b.className = it.cls;
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) { e.stopPropagation(); it.fn(); });
      row.appendChild(b);
    });
    menu.appendChild(row);
    return menu;
  }

  function toggleMain(c) {
    var willBeMain = !c.main;
    state.chars.forEach(function (o) { o.main = false; });
    c.main = willBeMain;
    save();
    renderNodes();
  }

  function deleteChar(id) {
    var c = getChar(id);
    if (!c) return;
    if (!confirm('“' + c.name + '” 캐릭터와 연결된 모든 관계를 삭제할까요?\n되돌릴 수 없어요.')) return;
    state.chars = state.chars.filter(function (o) { return o.id !== id; });
    state.rels = state.rels.filter(function (r) { return r.a !== id && r.b !== id; });
    if (connectFirst === id) connectFirst = null;
    save();
    render();
  }

  function startConnectFrom(c) {
    if (!connectMode) toggleConnect();
    connectFirst = c.id;
    setHint('“' + c.name + '” 선택됨 — 화살표가 향할 두 번째 캐릭터를 눌러주세요.');
    renderNodes();
  }

  /* ===== 렌더링: 관계선 (HTML 컨테이너를 활용한 아이콘 호버 스타일 적용) ===== */
  function radiusOf(c) {
    var a = nodesEl.querySelector('.node[data-id="' + c.id + '"] .avatar');
    return a ? a.offsetWidth / 2 : 42;
  }

  function renderLines() {
    linesEl.innerHTML = '';
    linesEl.setAttribute('viewBox', '0 0 ' + BOARD_W + ' ' + BOARD_H);

    var defs = svgEl('defs', {});
    Object.keys(REL_TYPES).forEach(function (k) {
      var m = svgEl('marker', {
        id: 'arrow-' + k, viewBox: '0 0 10 10', refX: 6, refY: 5,
        markerWidth: 13, markerHeight: 13, markerUnits: 'userSpaceOnUse',
        orient: 'auto-start-reverse'
      });
      m.appendChild(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', fill: REL_TYPES[k].color }));
      defs.appendChild(m);
    });
    linesEl.appendChild(defs);

    var groups = {};
    state.rels.forEach(function (r) {
      if (!getChar(r.a) || !getChar(r.b)) return;
      var k = [r.a, r.b].sort().join('|');
      (groups[k] = groups[k] || []).push(r);
    });

    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      var ids = k.split('|');
      var A = getChar(ids[0]), B = getChar(ids[1]);
      var dx = B.x - A.x, dy = B.y - A.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var rA = radiusOf(A), rB = radiusOf(B);
      if (len < rA + rB + 16) return;

      list.forEach(function (r, i) {
        var off = (i - (list.length - 1) / 2) * 50;
        var cx = (A.x + B.x) / 2 + nx * off;
        var cy = (A.y + B.y) / 2 + ny * off;
        var type = REL_TYPES[r.type];

        var dir = r.dir || 'to';
        var atStart = false, atEnd = false;
        function mark(id) { if (id === B.id) atEnd = true; else atStart = true; }
        if (dir === 'to') mark(r.b);
        else if (dir === 'from') mark(r.a);
        else if (dir === 'both') { atStart = true; atEnd = true; }

        var gapA = rA + (atStart ? 8 : 3), gapB = rB + (atEnd ? 8 : 3);
        var ux = cx - A.x, uy = cy - A.y, ul = Math.hypot(ux, uy) || 1;
        var vx = cx - B.x, vy = cy - B.y, vl = Math.hypot(vx, vy) || 1;
        var sx = A.x + ux / ul * gapA, sy = A.y + uy / ul * gapA;
        var ex = B.x + vx / vl * gapB, ey = B.y + vy / vl * gapB;
        var d = 'M' + sx + ' ' + sy + ' Q' + cx + ' ' + cy + ' ' + ex + ' ' + ey;

        var hit = svgEl('path', { d: d, 'class': 'hit' });
        var vis = svgEl('path', { d: d, 'class': 'rel', stroke: type.color });
        if (atEnd) vis.setAttribute('marker-end', 'url(#arrow-' + r.type + ')');
        if (atStart) vis.setAttribute('marker-start', 'url(#arrow-' + r.type + ')');

        var lx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
        var ly = 0.25 * sy + 0.5 * cy + 0.25 * ey;
        var txt = svgEl('text', { x: lx, y: ly });
        txt.textContent = r.label || type.name;

        var open = function () { if (!connectMode) openRelModal(r.id); };
        hit.addEventListener('click', open);
        txt.addEventListener('click', open);

        linesEl.appendChild(hit);
        linesEl.appendChild(vis);
        linesEl.appendChild(txt);

        // HTML 보드 내에 관계선 위치를 기준으로 아이콘 호버와 완전히 동일한 툴팁 컨테이너 생성
        if (r.desc && r.desc.trim() !== '') {
          var relGroup = document.createElement('div');
          relGroup.className = 'rel-group';
          relGroup.style.position = 'absolute';
          relGroup.style.left = lx + 'px';
          relGroup.style.top = ly + 'px';
          relGroup.style.width = '0px';
          relGroup.style.height = '0px';
          relGroup.style.pointerEvents = 'none';

          var hoverWrap = document.createElement('div');
          hoverWrap.className = 'rel-hover-wrap';

          var hoverBox = document.createElement('div');
          hoverBox.className = 'rel-hover-box';
          hoverBox.textContent = r.desc;

          hoverWrap.appendChild(hoverBox);
          relGroup.appendChild(hoverWrap);

          // 선을 클릭했을 때도 모달이 열리도록 투명 영역이나 이벤트 전달
          relGroup.style.pointerEvents = 'auto';
          relGroup.style.cursor = 'pointer';
          relGroup.addEventListener('click', open);

          nodesEl.appendChild(relGroup);
        }
      });
    });
  }

  function render() { renderNodes(); renderLines(); }

  /* ===== 드래그 & 클릭 ===== */
  function onNodeDown(e, c, el) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();

    var br = board.getBoundingClientRect();
    var startX = e.clientX, startY = e.clientY;
    var offX = e.clientX - br.left - c.x;
    var offY = e.clientY - br.top - c.y;
    var moved = false;

    try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }

    function move(ev) {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      moved = true;
      el.classList.add('dragging');
      var r = board.getBoundingClientRect();
      c.x = Math.round(clamp(ev.clientX - r.left - offX, 40, BOARD_W - 40));
      c.y = Math.round(clamp(ev.clientY - r.top - offY, MIN_Y, BOARD_H - 40));
      el.style.left = c.x + 'px';
      el.style.top = c.y + 'px';
      renderLines();
    }

    function end(ev) {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.classList.remove('dragging');
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (moved) save();
      else if (ev.type === 'pointerup') onNodeClick(c);
    }

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function onNodeClick(c) {
    if (!connectMode) { openCharModal(c.id); return; }

    if (!connectFirst) {
      connectFirst = c.id;
      setHint('“' + c.name + '” 선택됨 — 화살표가 향할 두 번째 캐릭터를 눌러주세요.');
      renderNodes();
    } else if (connectFirst === c.id) {
      connectFirst = null;
      setHint('화살표가 출발할 첫 번째 캐릭터를 눌러주세요.');
      renderNodes();
    } else {
      var first = connectFirst;
      connectFirst = null;
      renderNodes();
      setHint('화살표가 출발할 첫 번째 캐릭터를 눌러주세요.');
      openRelModal(null, first, c.id);
    }
  }

  /* ===== 관계 연결 모드 ===== */
  function setHint(text) {
    hintEl.textContent = text;
    hintEl.hidden = !connectMode;
  }

  function toggleConnect() {
    connectMode = !connectMode;
    connectFirst = null;
    btnConnect.classList.toggle('active', connectMode);
    btnConnect.textContent = connectMode ? '연결 모드 끄기' : '관계 연결 모드';
    document.body.classList.toggle('connect-on', connectMode);
    setHint('화살표가 출발할 첫 번째 캐릭터를 눌러주세요.');
    renderNodes();
  }

  /* ===== 모달 공통 ===== */
  function showModal(m) { m.hidden = false; }
  function hideModal(m) { m.hidden = true; }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-close]') : null;
    if (t) hideModal($(t.getAttribute('data-close')));
  });

  [charModal, relModal].forEach(function (m) {
    m.addEventListener('mousedown', function (e) { if (e.target === m) hideModal(m); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!relModal.hidden) hideModal(relModal);
    else if (!charModal.hidden) hideModal(charModal);
  });

  /* ===== 캐릭터 모달 ===== */
  function buildSwatches() {
    var box = $('swatches');
    PRESETS.forEach(function (col) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = col;
      b.setAttribute('aria-label', '색상 ' + col);
      b.dataset.color = col;
      b.addEventListener('click', function () { setColor(col); });
      box.appendChild(b);
    });
  }

  function setColor(col) {
    fColor.value = col;
    previewAvatar.style.setProperty('--pc', col);
    var sw = document.querySelectorAll('.swatch');
    for (var i = 0; i < sw.length; i++) {
      sw[i].classList.toggle('active', sw[i].dataset.color.toLowerCase() === col.toLowerCase());
    }
  }

  function updatePreview() {
    imgPreview.onerror = function () { imgPreview.onerror = null; imgPreview.src = DEFAULT_AVATAR; };
    imgPreview.src = imgData || DEFAULT_AVATAR;
  }

  function openCharModal(id) {
    charCtx = id;
    var c = id ? getChar(id) : null;

    $('charModalTitle').textContent = c ? '캐릭터 상세 정보' : '새 캐릭터 추가';
    fName.value = c ? c.name : '';
    imgData = c ? c.img : '';
    fImgFile.value = '';
    setColor(c ? c.color : PRESETS[Math.floor(Math.random() * PRESETS.length)]);
    fMain.checked = c ? !!c.main : state.chars.length === 0;
    fStory.value = c ? c.story : '';
    fMemo.value = c ? c.memo : '';
    relSection.hidden = !c;
    $('btnCharDelete').hidden = !c;
    updatePreview();
    if (c) refreshRelList();

    showModal(charModal);
    if (!c) fName.focus();
  }

  function dirSymbol(r, meId) {
    var d = r.dir || 'to';
    if (d === 'both') return '↔';
    if (d === 'none') return '—';
    var meIsA = r.a === meId;
    return (d === 'to') === meIsA ? '→' : '←';
  }

  function refreshRelList() {
    if (!charCtx) return;
    relList.innerHTML = '';

    var mine = state.rels.filter(function (r) { return r.a === charCtx || r.b === charCtx; });
    if (!mine.length) {
      var none = document.createElement('li');
      none.className = 'none';
      none.textContent = '아직 연결된 관계가 없어요.';
      relList.appendChild(none);
    }
    mine.forEach(function (r) {
      var other = getChar(r.a === charCtx ? r.b : r.a);
      if (!other) return;
      var type = REL_TYPES[r.type];
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rel-item';

      var dot = document.createElement('i');
      dot.style.background = type.color;
      var nm = document.createElement('span');
      nm.className = 'rname';
      nm.textContent = dirSymbol(r, charCtx) + ' ' + other.name;
      var lb = document.createElement('span');
      lb.className = 'rlabel';
      lb.textContent = r.label ? r.label + ' (' + type.name + ')' : type.name;

      btn.appendChild(dot);
      btn.appendChild(nm);
      btn.appendChild(lb);
      btn.addEventListener('click', function () { openRelModal(r.id); });
      li.appendChild(btn);
      relList.appendChild(li);
    });

    relTarget.innerHTML = '';
    var others = state.chars.filter(function (o) { return o.id !== charCtx; });
    others.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.name;
      relTarget.appendChild(op);
    });
    if (!others.length) {
      var ph = document.createElement('option');
      ph.textContent = '다른 캐릭터가 없어요';
      relTarget.appendChild(ph);
    }
    relTarget.disabled = !others.length;
    $('btnRelAdd').disabled = !others.length;
  }

  function spawnPos() {
    var cx = wrap.scrollLeft + wrap.clientWidth / 2 + (Math.random() - 0.5) * 140;
    var cy = wrap.scrollTop + wrap.clientHeight / 2 + (Math.random() - 0.5) * 140;
    return { x: Math.round(clamp(cx, 60, BOARD_W - 60)), y: Math.round(clamp(cy, MIN_Y, BOARD_H - 60)) };
  }

  $('charForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = fName.value.trim();
    if (!name) { fName.focus(); return; }

    var data = {
      name: name,
      img: imgData,
      color: fColor.value,
      main: fMain.checked,
      story: fStory.value,
      memo: fMemo.value
    };

    var target = charCtx ? getChar(charCtx) : null;
    if (target) {
      for (var k in data) target[k] = data[k];
    } else {
      var p = spawnPos();
      target = { id: uid(), x: p.x, y: p.y };
      for (var k2 in data) target[k2] = data[k2];
      state.chars.push(target);
    }
    if (data.main) state.chars.forEach(function (o) { if (o !== target) o.main = false; });

    save();
    render();
    hideModal(charModal);
  });

  $('btnCharDelete').addEventListener('click', function () {
    var id = charCtx;
    if (!getChar(id)) return;
    deleteChar(id);
    if (!getChar(id)) hideModal(charModal);
  });

  fImgFile.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      alert('이미지 파일만 올릴 수 있어요.');
      e.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { alert('파일을 읽지 못했어요.'); };
    reader.onload = function () {
      var im = new Image();
      im.onerror = function () { alert('이 이미지는 불러올 수 없어요. 다른 파일을 선택해 주세요.'); };
      im.onload = function () {
        var SIZE = 256;
        var side = Math.min(im.naturalWidth, im.naturalHeight);
        var sx = (im.naturalWidth - side) / 2;
        var sy = (im.naturalHeight - side) / 2;
        var cv = document.createElement('canvas');
        cv.width = SIZE;
        cv.height = SIZE;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#e6e1d6';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.drawImage(im, sx, sy, side, side, 0, 0, SIZE, SIZE);
        imgData = cv.toDataURL('image/jpeg', 0.85);
        updatePreview();
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  $('btnImgClear').addEventListener('click', function () {
    imgData = '';
    updatePreview();
  });
  fColor.addEventListener('input', function () { setColor(fColor.value); });

  $('btnRelAdd').addEventListener('click', function () {
    if (charCtx && relTarget.value) openRelModal(null, charCtx, relTarget.value);
  });

  /* ===== 관계 모달 ===== */
  function buildTypeOptions() {
    Object.keys(REL_TYPES).forEach(function (key, i) {
      var t = REL_TYPES[key];
      var lab = document.createElement('label');
      lab.className = 'type-opt';
      lab.style.setProperty('--c', t.color);

      var inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'relType';
      inp.value = key;
      if (i === 0) inp.checked = true;

      var sp = document.createElement('span');
      var bar = document.createElement('i');
      bar.style.background = t.color;
      sp.appendChild(bar);
      sp.appendChild(document.createTextNode(t.name));

      lab.appendChild(inp);
      lab.appendChild(sp);
      typeGroup.appendChild(lab);
    });
  }

  function getType() {
    var el = typeGroup.querySelector('input:checked');
    return el ? el.value : 'blue';
  }
  function setType(key) {
    var el = typeGroup.querySelector('input[value="' + key + '"]');
    if (el) el.checked = true;
  }

  function fillDir(A, B, val) {
    rDir.innerHTML = '';
    [
      ['to',   A.name + ' → ' + B.name],
      ['from', B.name + ' → ' + A.name],
      ['both', A.name + ' ↔ ' + B.name + ' (양방향)'],
      ['none', '화살표 없음 (선만)']
    ].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0];
      op.textContent = o[1];
      rDir.appendChild(op);
    });
    rDir.value = val;
  }

  function openRelModal(relId, a, b) {
    var r = relId ? getRel(relId) : null;
    if (relId && !r) return;
    relCtx = { id: r ? r.id : null, a: r ? r.a : a, b: r ? r.b : b };

    var A = getChar(relCtx.a), B = getChar(relCtx.b);
    if (!A || !B) return;

    relPair.textContent = A.name + '  ·  ' + B.name;
    setType(r ? r.type : 'blue');
    fillDir(A, B, r ? (r.dir || 'to') : 'to');
    rLabel.value = r ? r.label : '';
    rDesc.value = r ? r.desc : '';
    $('btnRelDelete').hidden = !r;
    $('relModalTitle').textContent = r ? '관계 수정' : '새 관계 설정';
    showModal(relModal);
  }

  $('relForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!relCtx) return;
    var vals = { 
      type: getType(), 
      dir: rDir.value, 
      label: rLabel.value.trim().slice(0, 20), 
      desc: rDesc.value.trim().slice(0, 20) // 최대 20자 제한
    };

    if (relCtx.id) {
      var r = getRel(relCtx.id);
      if (r) { r.type = vals.type; r.dir = vals.dir; r.label = vals.label; r.desc = vals.desc; }
    } else {
      state.rels.push({ id: uid(), a: relCtx.a, b: relCtx.b, type: vals.type, dir: vals.dir, label: vals.label, desc: vals.desc });
    }
    save();
    renderLines();
    refreshRelList();
    hideModal(relModal);
  });

  $('btnRelDelete').addEventListener('click', function () {
    if (!relCtx || !relCtx.id) return;
    if (!confirm('이 관계를 삭제할까요?')) return;
    state.rels = state.rels.filter(function (r) { return r.id !== relCtx.id; });
    save();
    renderLines();
    refreshRelList();
    hideModal(relModal);
  });

  /* ===== 상단 버튼 ===== */
  $('btnAdd').addEventListener('click', function () { openCharModal(null); });
  btnConnect.addEventListener('click', toggleConnect);

  $('btnExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'character-relations-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $('btnImport').addEventListener('click', function () { $('fileInput').click(); });

  $('fileInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var next = normalize(JSON.parse(reader.result));
        if (!next.chars.length && !confirm('캐릭터가 하나도 없는 파일이에요. 그래도 현재 데이터를 덮어쓸까요?')) return;
        if (!confirm('현재 데이터를 불러온 파일 내용으로 교체할까요?')) return;
        state = next;
        save();
        render();
      } catch (err) {
        alert('올바른 JSON 파일이 아니에요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('btnReset').addEventListener('click', function () {
    if (!confirm('모든 캐릭터와 관계를 삭제할까요?\n(내보내기로 백업해 두면 복구할 수 있어요)')) return;
    state = { chars: [], rels: [] };
    connectFirst = null;
    save();
    render();
  });

  /* ===== 범례 & 초기화 ===== */
  function buildLegend() {
    var ul = $('legend');
    Object.keys(REL_TYPES).forEach(function (k) {
      var li = document.createElement('li');
      var bar = document.createElement('i');
      bar.style.background = REL_TYPES[k].color;
      li.appendChild(bar);
      li.appendChild(document.createTextNode(REL_TYPES[k].name));
      ul.appendChild(li);
    });
  }

  buildLegend();
  buildSwatches();
  buildTypeOptions();
  render();
})();
