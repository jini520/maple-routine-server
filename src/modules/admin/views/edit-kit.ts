/**
 * 관리 화면이 함께 쓰는 칸 편집 · 저장 막대 · 작은 창 · 화면 전환 막대. EDIT_JS 와 EDIT_CSS 는 layout 의 스크립트와 스타일에
 * 그대로 들어가는 글자다.
 *
 * 값은 칸을 눌러 바로 고치고, 바뀐 칸은 화면 아래 막대의 저장으로 한 번에 보낸다. 한 요청에 여러 칸이 실리는 줄은 key 하나로
 * 묶는다. 저장이 실패한 key 의 칸은 바뀐 표시를 남겨 다시 저장할 수 있다.
 *
 * @example
 * var batch = editing(load)
 * numCell(batch, 'star:' + s.fromStar, s.divisor, function () { return call('PUT', url, body()) })
 */
export const EDIT_JS = `
  // 칸 묶음. 저장하면 바뀐 칸이 있는 key 마다 send 를 한 번 부르고, 성공한 key 의 칸만 지금 값을 처음 값으로 삼는다.
  function EditBatch(onChange) {
    var groups = [];
    function notify() { if (onChange) onChange(); }
    function changedIn(g) { return g.cells.some(function (c) { return c.changed(); }); }
    return {
      add: function (key, cell, send) {
        var g = null;
        for (var i = 0; i < groups.length; i++) if (groups[i].key === key) g = groups[i];
        if (g === null) { g = { key: key, send: send, cells: [] }; groups.push(g); }
        g.cells.push(cell);
      },
      count: function () { var n = 0; groups.forEach(function (g) { g.cells.forEach(function (c) { if (c.changed()) n++; }); }); return n; },
      changed: notify,
      revert: function () { groups.forEach(function (g) { g.cells.forEach(function (c) { if (c.changed()) c.revert(); }); }); notify(); },
      clear: function () { groups = []; notify(); },
      save: async function () {
        var failed = [];
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (!changedIn(g)) continue;
          var r;
          try { r = await g.send(); } catch (e) { r = { ok: false, status: 0, text: String(e) }; }
          if (r && r.ok) g.cells.forEach(function (c) { c.commit(); });
          else failed.push({ key: g.key, result: r });
        }
        notify();
        return failed;
      },
    };
  }
  function numText(v) { return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 6 }); }
  function numRaw(text) { return String(text).replace(/[,\\s]/g, ''); }
  // 바로 고치는 칸 하나. 숫자 칸은 칸에 들어가면 쉼표를 떼고 나오면 다시 붙인다. Enter 는 나가고 Escape 는 처음 값으로 돌린다.
  function editCell(batch, key, value, send, opts) {
    var number = !opts || opts.text !== true;
    var i = el('input', undefined, (number ? 'num-in' : 'text-in') + (opts && opts.cls ? ' ' + opts.cls : ''));
    if (number) i.inputMode = 'decimal';
    var start = value === null || value === undefined ? '' : String(value);
    var raw = function () { return number ? numRaw(i.value) : i.value.trim(); };
    var shown = function (t) { return number && /^-?\\d*\\.?\\d+$/.test(t) ? numText(t) : t; };
    i.value = shown(start);
    var c = {
      input: i,
      changed: function () { return raw() !== start; },
      commit: function () { start = raw(); i.classList.remove('changed'); },
      revert: function () { i.value = shown(start); i.classList.remove('changed'); },
      value: function () { var t = raw(); return number ? (t === '' ? null : Number(t)) : t; },
    };
    i.addEventListener('focus', function () { if (number) i.value = numRaw(i.value); i.select(); });
    i.addEventListener('blur', function () { i.value = shown(raw()); i.classList.toggle('changed', c.changed()); batch.changed(); });
    i.addEventListener('keydown', function (e) { if (e.key === 'Enter') i.blur(); if (e.key === 'Escape') { c.revert(); i.blur(); } });
    batch.add(key, c, send);
    return c;
  }
  function numCell(batch, key, value, send, cls) { return editCell(batch, key, value, send, { cls: cls }); }
  function textCell(batch, key, value, send, cls) { return editCell(batch, key, value, send, { text: true, cls: cls }); }
  // 화면 아래에 뜨는 저장 막대가 달린 칸 묶음. 모두 저장되면 onSaved 를 부른다. 실패하면 바뀐 칸을 남기고 알린다.
  function editing(onSaved) {
    var bar = el('div', undefined, 'savebar'), label = span(''), revert = button('되돌리기', 'btn ghost sm'), save = button('저장', 'btn sm');
    bar.appendChild(label); bar.appendChild(revert); bar.appendChild(save); document.body.appendChild(bar);
    var batch = EditBatch(function () { var n = batch.count(); bar.classList.toggle('show', n > 0); label.textContent = '바뀐 칸 ' + n + '개'; });
    revert.addEventListener('click', function () { batch.revert(); });
    save.addEventListener('click', async function () {
      save.disabled = true;
      var failed = await batch.save();
      save.disabled = false;
      if (failed.length > 0) { show(failed.length + '건을 못 적었다. 그 칸은 바뀐 채로 두었다\\n' + failed.map(function (f) { return f.key + ' ' + (f.result ? f.result.status + ' ' + (f.result.text || '') : ''); }).join('\\n'), true); return; }
      show('적었다', false);
      if (onSaved) onSaved();
    });
    return batch;
  }
  // 새로 넣는 폼을 띄우는 작은 창. 닫으면 창을 지운다.
  function openForm(title, body) {
    var d = el('dialog', undefined, 'form-dialog'), h = el('header'), x = button('닫기', 'btn ghost sm');
    h.appendChild(el('b', title)); h.appendChild(x); d.appendChild(h);
    var b = el('div', undefined, 'form-body'); b.appendChild(body); d.appendChild(b);
    x.addEventListener('click', function () { d.close(); });
    d.addEventListener('close', function () { d.remove(); });
    document.body.appendChild(d); d.showModal();
    return d;
  }
`

export const EDIT_CSS = `
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px }
  .top h1 { margin: 0; font-size: 20px; letter-spacing: -.01em }
  .top .grow { flex: 1 }
  .top .updated { font: 12px var(--mono); color: var(--text-3) }
  .seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: var(--fill); border-radius: 9px }
  .seg a { font: 600 13px/1 var(--font); padding: 8px 14px; border-radius: 7px; color: var(--text-2); text-decoration: none; white-space: nowrap }
  .seg a:hover { color: var(--text) }
  .seg a[aria-current="page"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow) }
  .panel { background: var(--surface); border-radius: var(--r-card); box-shadow: var(--shadow); padding: 16px 18px 14px }
  .panel-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-bottom: 8px }
  .panel-head .grow { flex: 1 }
  .panel-head p { margin: 0; font-size: 13px; color: var(--text-3) }
  .rule { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); white-space: nowrap }
  .num-in, .text-in { font: 500 13px/1 var(--font); padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text); min-width: 0 }
  .num-in { font-family: var(--mono); text-align: right; width: 120px }
  .num-in.short { width: 58px }
  .text-in { width: 100% }
  .num-in:hover, .text-in:hover { background: var(--fill) }
  .num-in:focus, .text-in:focus { outline: 2px solid var(--accent); background: var(--surface) }
  .num-in.changed, .text-in.changed { background: var(--accent-tint); color: var(--accent-ink) }
  .rule .num-in, .rule .text-in { background: var(--field) }
  .sheet { width: 100% }
  .sheet th { padding: 8px 10px }
  .sheet td { padding: 1px 8px }
  .sheet td.label { font: 12.5px var(--mono); color: var(--text-2); padding-left: 10px; white-space: nowrap }
  .sheet tr.group td { padding: 12px 10px 4px; font: 600 12.5px/1 var(--font); color: var(--text) }
  .sheet tr.group:hover td { background: transparent }
  .sheet tr.group .btn { margin-left: 8px }
  .sheet td.act { width: 1%; white-space: nowrap }
  .sheet tr .row-act { visibility: hidden }
  .sheet tr:hover .row-act { visibility: visible }
  .savebar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 18px; display: none; align-items: center; gap: 10px; padding: 9px 12px 9px 16px; background: var(--text); color: var(--surface); border-radius: 10px; box-shadow: 0 8px 24px rgba(16,24,40,.25); z-index: 30 }
  .savebar.show { display: flex }
  .savebar span { font-size: 13px; margin-right: 6px }
  .savebar .btn.ghost { background: transparent; color: var(--surface) }
  .form-dialog { border: 0; border-radius: 14px; padding: 0; width: min(440px, calc(100vw - 32px)); background: var(--surface); color: var(--text); box-shadow: 0 12px 32px rgba(16,24,40,.18) }
  .form-dialog::backdrop { background: rgba(17,24,39,.35) }
  .form-dialog > header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 0 }
  .form-dialog .form-body { display: grid; gap: 12px; padding: 16px 20px 20px }
  .form-dialog .form-body .btn { justify-self: start }
`

/** 한 메뉴를 하는 일마다 나눈 화면 사이를 오가는 막대. current 는 지금 화면의 경로다. */
export function subNav(
  items: readonly (readonly [href: string, label: string])[],
  current: string,
): string {
  const links = items
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('')
  return `<nav class="seg">${links}</nav>`
}
