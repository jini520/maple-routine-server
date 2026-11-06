/**
 * 사용자 · 사용 로그 대시보드가 함께 쓰는 차트 스크립트. 지표 칸 · 일별 막대 · 요일별 막대 · 요일 × 시간 · 구성 막대.
 *
 * 막대에 올리면 그 날 값이 차트 위 한 줄에 뜬다. 막대마다 숫자를 적으면 28개가 서로 겹친다.
 * 늘어남은 빨강, 줄어듦은 파랑이다. 드롭 시세 차트와 같은 규칙이다.
 * 레이아웃의 도우미(el · call · show) 뒤에 들어가야 한다.
 */
export const DASHBOARD_SCRIPT = `<script>
  var WD = ['월', '화', '수', '목', '금', '토', '일'];
  var KIND_ORDER = ['game', 'event', 'update', 'cashshop'];
  // 앱 알림 설정에 보이는 이름이다(앱 features/notice/topics.ts).
  var KIND_LABELS = { game: '게임 공지 사항', event: '썬데이 메이플', update: '게임 업데이트 안내', cashshop: '캐시 아이템 업데이트' };
  var HEAT = ['var(--ramp-0)', 'var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)'];
  var PARTS = ['var(--part-1)', 'var(--part-2)'];
  var PRESETS = [7, 28, 90, 180];

  function num(v) { return Number(v).toLocaleString('ko-KR'); }
  function weekdayOf(day) { return (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7; }
  function signed(d) { return d > 0 ? '▲ ' + num(d) : d < 0 ? '▼ ' + num(-d) : '변화 없음'; }
  function toneOf(d) { return d > 0 ? 'up' : d < 0 ? 'down' : 'flat'; }
  function niceStep(x) {
    if (!(x > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(x)));
    var r = x / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
  }
  function pct(v, top) { return (top > 0 ? v / top * 100 : 0).toFixed(2) + '%'; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /** 기간 단추 넷. 고른 것만 코발트다. */
  function presetButtons(box, current, pick) {
    clear(box);
    PRESETS.forEach(function (d) {
      var b = button(d + '일', d === current ? 'btn' : 'btn ghost');
      b.setAttribute('aria-pressed', d === current ? 'true' : 'false');
      b.addEventListener('click', function () { pick(d); });
      box.appendChild(b);
    });
  }

  /** 지표 칸. delta 가 null 이면 맞댈 앞 기간이 없다는 뜻이다. */
  function kpiTile(t) {
    var box = el('div', undefined, 'kpi');
    box.appendChild(el('span', t.label, 'label'));
    var fig = el('div', undefined, 'figure');
    var v = el('span', num(t.value), 'value');
    v.appendChild(el('small', t.unit || '명'));
    fig.appendChild(v);
    var has = t.delta !== null && t.delta !== undefined;
    if (has) fig.appendChild(el('span', signed(t.delta), 'delta ' + toneOf(t.delta)));
    box.appendChild(fig);
    box.appendChild(el('span', (has ? t.vs : '맞댈 앞 기간이 없다') + (t.note ? ' · ' + t.note : ''), 'vs'));
    if (t.series && t.series.length) {
      var spark = el('div', undefined, 'spark');
      spark.setAttribute('aria-hidden', 'true');
      var max = Math.max.apply(null, t.series), min = Math.min.apply(null, t.series), span = max - min || 1;
      t.series.forEach(function (x) {
        var i = el('i');
        i.style.height = (18 + 82 * (x - min) / span).toFixed(1) + '%';
        spark.appendChild(i);
      });
      box.appendChild(spark);
    }
    return box;
  }

  function alertsText(a) {
    if (!a || (a.app === 0 && a.game === 0)) return '이 날 보낸 알림 없음';
    var parts = KIND_ORDER.filter(function (k) { return a.kinds[k]; }).map(function (k) { return KIND_LABELS[k] + ' ' + a.kinds[k]; });
    return '알림 · 앱 공지 ' + a.app + '번 · 게임 알림 ' + a.game + '번' + (parts.length ? ' (' + parts.join(' · ') + ')' : '');
  }

  /**
   * 날짜 칸 아래 글자. 짧은 기간은 요일과 월요일 날짜, 길어지거나 좁으면 날짜만 드문드문 둔다.
   * 첫날 날짜는 사흘 안에 월요일이 없을 때만 적는다. 붙어 있으면 두 날짜가 겹친다.
   */
  function xLabel(days, i, compact) {
    var d = days[i].day, w = weekdayOf(d);
    var long = days.length > 100;
    var marks = long ? d.slice(8) === '01' : w === 0;
    var firstAlone = !days.slice(1, 4).some(function (x) { return long ? x.day.slice(8) === '01' : weekdayOf(x.day) === 0; });
    var date = marks || (i === 0 && firstAlone) ? d.slice(5) : '';
    return { wd: days.length <= 35 && !compact ? WD[w] : '', date: date };
  }

  /**
   * 일별 막대. o.days 는 [{ day, value, extra?, alerts? }].
   * o.alerts 면 막대 아래에 앱 공지 · 게임 알림 두 줄, o.delta 면 맨 아래에 전날 대비 막대를 둔다.
   */
  function dailyChart(o) {
    var days = o.days, H = o.height || 200, unit = o.unit || '';
    var root = el('div', undefined, 'chart');
    var ro = el('div', undefined, 'readout');
    ro.setAttribute('aria-live', 'polite');
    root.appendChild(ro);
    if (days.length === 0) { ro.textContent = '기간에 날이 없다'; return root; }

    var max = 0;
    days.forEach(function (d) { if (d.value > max) max = d.value; });
    var step = niceStep(max / 4), top = Math.max(step, Math.ceil(max / step) * step);
    var cells = days.map(function () { return []; });
    var bars = [];

    var row = el('div', undefined, 'row');
    var axis = el('div', undefined, 'axis');
    axis.style.height = H + 'px';
    axis.setAttribute('aria-hidden', 'true');
    var plot = el('div', undefined, 'plot');
    plot.style.height = H + 'px';
    for (var t = 0; t <= top + 1e-9; t += step) {
      var lab = el('span', num(t));
      lab.style.bottom = pct(t, top);
      axis.appendChild(lab);
      var g = el('div', undefined, t === 0 ? 'grid base' : 'grid');
      g.style.bottom = pct(t, top);
      plot.appendChild(g);
    }
    var slots = el('div', undefined, 'slots');
    slots.setAttribute('role', 'img');
    slots.setAttribute('aria-label', o.series + ' 일별 막대. ' + days[0].day + '부터 ' + days[days.length - 1].day + '까지. 왼쪽 오른쪽 화살표로 날을 옮긴다');
    slots.tabIndex = 0;
    days.forEach(function (d, i) {
      var s = el('div', undefined, 'slot');
      var b = el('div', undefined, 'bar');
      b.style.height = pct(d.value, top);
      s.appendChild(b);
      slots.appendChild(s);
      cells[i].push(s);
      bars.push(s);
    });
    plot.appendChild(slots);
    row.appendChild(axis);
    row.appendChild(plot);
    root.appendChild(row);

    var xrow = el('div', undefined, 'row');
    xrow.setAttribute('aria-hidden', 'true');
    xrow.appendChild(el('div', undefined, 'gutter'));
    var x = el('div', undefined, 'x');
    var xcells = [];
    days.forEach(function (d, i) {
      var lab = xLabel(days, i, o.compact);
      var c = el('div');
      if (lab.wd) c.appendChild(el('span', lab.wd));
      c.appendChild(el('span', lab.date, 'date'));
      x.appendChild(c);
      xcells.push(c);
    });
    xrow.appendChild(x);
    root.appendChild(xrow);

    if (o.alerts) {
      var dense = days.length > 35;
      [['app', '앱 공지'], ['game', '게임 알림']].forEach(function (lane) {
        var r = el('div', undefined, 'row');
        r.appendChild(el('span', lane[1], 'lane-name'));
        var l = el('div', undefined, 'lane');
        days.forEach(function (d, i) {
          var c = el('div');
          var count = d.alerts ? d.alerts[lane[0]] : 0;
          if (count > 0) c.appendChild(dense ? el('span', undefined, 'dot ' + lane[0]) : el('span', String(count), 'chip ' + lane[0]));
          l.appendChild(c);
          cells[i].push(c);
        });
        r.appendChild(l);
        root.appendChild(r);
      });
    }

    var deltas = days.map(function (d, i) { return i === 0 ? null : d.value - days[i - 1].value; });
    if (o.delta) {
      var dmax = 0;
      deltas.forEach(function (v) { if (v !== null && Math.abs(v) > dmax) dmax = Math.abs(v); });
      var dStep = niceStep(dmax);
      var legend = el('div', undefined, 'legend');
      legend.appendChild(el('b', '전날 대비'));
      [['var(--rise)', '늘어남'], ['var(--fall)', '줄어듦']].forEach(function (k) {
        var item = el('span');
        var sw = el('i', undefined, 'swatch');
        sw.style.background = k[0];
        item.appendChild(sw);
        item.appendChild(document.createTextNode(k[1]));
        legend.appendChild(item);
      });
      root.appendChild(legend);
      var sr = el('div', undefined, 'row');
      var sa = el('div', undefined, 'axis strip');
      sa.setAttribute('aria-hidden', 'true');
      [['+' + num(dStep), '100%'], ['0', '50%'], ['-' + num(dStep), '0%']].forEach(function (k) {
        var lab = el('span', k[0]);
        lab.style.bottom = k[1];
        sa.appendChild(lab);
      });
      var sp = el('div', undefined, 'plot strip');
      sp.appendChild(el('div', undefined, 'zero'));
      var ss = el('div', undefined, 'slots');
      deltas.forEach(function (v, i) {
        var c = el('div', undefined, 'slot');
        c.style.flexDirection = 'column';
        c.style.alignItems = 'stretch';
        var topHalf = el('div', undefined, 'half top');
        var bottomHalf = el('div', undefined, 'half bottom');
        if (v !== null && v > 0) { var u = el('div', undefined, 'rise'); u.style.height = pct(v, dStep); topHalf.appendChild(u); }
        if (v !== null && v < 0) { var dn = el('div', undefined, 'fall'); dn.style.height = pct(-v, dStep); bottomHalf.appendChild(dn); }
        c.appendChild(topHalf);
        c.appendChild(bottomHalf);
        ss.appendChild(c);
        cells[i].push(c);
      });
      sp.appendChild(ss);
      sr.appendChild(sa);
      sr.appendChild(sp);
      root.appendChild(sr);
    }

    var current = -1;
    function paint(i, hovered) {
      if (current >= 0) {
        cells[current].forEach(function (c) { c.classList.remove('on'); });
        bars[current].classList.remove('pick');
        xcells[current].classList.remove('pick');
      }
      current = i;
      if (hovered) cells[i].forEach(function (c) { c.classList.add('on'); });
      bars[i].classList.add('pick');
      xcells[i].classList.add('pick');
      var d = days[i], v = deltas[i];
      clear(ro);
      var line = el('div', undefined, 'line');
      line.appendChild(el('span', d.day.slice(5) + ' (' + WD[weekdayOf(d.day)] + ')', 'when'));
      line.appendChild(el('b', num(d.value) + unit));
      line.appendChild(el('span', o.series));
      if (v !== null) line.appendChild(el('span', v === 0 ? '전날과 같다' : '전날보다 ' + signed(v), toneOf(v)));
      if (d.extra) line.appendChild(el('span', d.extra, 'dim'));
      ro.appendChild(line);
      if (o.alerts) ro.appendChild(el('span', alertsText(d.alerts)));
    }
    cells.forEach(function (list, i) {
      list.forEach(function (c) { c.addEventListener('mouseenter', function () { paint(i, true); }); });
    });
    root.addEventListener('mouseleave', function () { paint(days.length - 1, false); });
    slots.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' && current > 0) { paint(current - 1, true); e.preventDefault(); }
      if (e.key === 'ArrowRight' && current < days.length - 1) { paint(current + 1, true); e.preventDefault(); }
    });
    paint(days.length - 1, false);
    return root;
  }

  /** 요일별 막대. 막대는 평균, 세로선은 가장 적은 날부터 가장 많은 날까지다. rows 는 월요일부터 일곱. */
  function weekdayChart(rows, unit) {
    var root = el('div', undefined, 'chart');
    var ro = el('div', undefined, 'readout');
    ro.setAttribute('aria-live', 'polite');
    root.appendChild(ro);
    var max = 0, best = -1, sum = 0, count = 0;
    rows.forEach(function (r, i) {
      if (r.max !== null && r.max > max) max = r.max;
      if (r.avg !== null) { sum += r.avg; count++; if (best < 0 || r.avg > rows[best].avg) best = i; }
    });
    var mean = count ? sum / count : 0;
    var step = niceStep(max / 4), top = Math.max(step, Math.ceil(max / step) * step), H = 180;
    var row = el('div', undefined, 'row');
    var axis = el('div', undefined, 'axis');
    axis.style.height = H + 'px';
    axis.setAttribute('aria-hidden', 'true');
    var plot = el('div', undefined, 'plot');
    plot.style.height = H + 'px';
    for (var t = 0; t <= top + 1e-9; t += step) {
      var lab = el('span', num(t));
      lab.style.bottom = pct(t, top);
      axis.appendChild(lab);
      var g = el('div', undefined, t === 0 ? 'grid base' : 'grid');
      g.style.bottom = pct(t, top);
      plot.appendChild(g);
    }
    var slots = el('div', undefined, 'slots');
    slots.setAttribute('role', 'img');
    slots.setAttribute('aria-label', '요일별 평균 막대');
    var nodes = [];
    rows.forEach(function (r, i) {
      var s = el('div', undefined, 'slot');
      if (r.avg !== null) {
        var b = el('div', undefined, 'wbar');
        b.style.height = pct(r.avg, top);
        s.appendChild(b);
        var w = el('div', undefined, 'whisker');
        w.style.bottom = pct(r.min, top);
        w.style.height = pct(r.max - r.min, top);
        s.appendChild(w);
        [r.max, r.min].forEach(function (v) {
          var cap = el('div', undefined, 'cap');
          cap.style.bottom = 'calc(' + pct(v, top) + ' - 1px)';
          s.appendChild(cap);
        });
      }
      slots.appendChild(s);
      nodes.push(s);
    });
    plot.appendChild(slots);
    row.appendChild(axis);
    row.appendChild(plot);
    root.appendChild(row);

    var table = el('div', undefined, 'wtable');
    [['head', ''], ['avg', '평균'], ['range', '범위']].forEach(function (k) {
      var r = el('div', undefined, k[0]);
      r.appendChild(el('span', k[1]));
      rows.forEach(function (x, i) {
        var text = k[0] === 'head' ? WD[i] : x.avg === null ? '-' : k[0] === 'avg' ? num(x.avg) : num(x.min) + '~' + num(x.max);
        r.appendChild(el('span', text));
      });
      table.appendChild(r);
    });
    root.appendChild(table);

    var current = -1;
    function paint(i, hovered) {
      if (current >= 0) nodes[current].classList.remove('on', 'pick');
      current = i;
      if (i < 0) { ro.textContent = '기간에 방문이 없다'; return; }
      nodes[i].classList.add('pick');
      if (hovered) nodes[i].classList.add('on');
      var r = rows[i];
      clear(ro);
      var line = el('div', undefined, 'line');
      line.appendChild(el('span', WD[i] + '요일'));
      if (r.avg === null) { line.appendChild(el('span', '이 요일은 기간에 없다', 'dim')); ro.appendChild(line); return; }
      line.appendChild(el('b', num(r.avg) + unit));
      line.appendChild(el('span', '평균'));
      var diff = mean ? Math.round((r.avg / mean - 1) * 100) : 0;
      line.appendChild(el('span', diff === 0 ? '요일 평균과 같다' : '요일 평균보다 ' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '%', toneOf(diff)));
      line.appendChild(el('span', '가장 적은 날 ' + num(r.min) + unit + ' · 가장 많은 날 ' + num(r.max) + unit, 'dim'));
      ro.appendChild(line);
    }
    nodes.forEach(function (n, i) { n.addEventListener('mouseenter', function () { paint(i, true); }); });
    root.addEventListener('mouseleave', function () { paint(best, false); });
    paint(best, false);
    return root;
  }

  /** 요일 × 시. 값은 그 요일이 기간에 든 날 수로 나눈 평균이다. */
  function heatChart(grid, caption, unit) {
    var root = el('div', undefined, 'chart');
    var ro = el('div', undefined, 'readout');
    ro.setAttribute('aria-live', 'polite');
    root.appendChild(ro);
    var max = 0, peak = [0, 0];
    grid.forEach(function (r, ri) { r.forEach(function (v, h) { if (v > max) { max = v; peak = [ri, h]; } }); });
    var box = el('div', undefined, 'heat');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', '요일과 시간대별 ' + caption + '. 가장 많은 칸은 ' + WD[peak[0]] + '요일 ' + peak[1] + '시');
    box.appendChild(el('span'));
    for (var h = 0; h < 24; h++) box.appendChild(el('span', h % 3 === 0 ? String(h) : '', 'h'));
    var nodes = [];
    grid.forEach(function (r, ri) {
      box.appendChild(el('span', WD[ri], 'd'));
      nodes.push([]);
      r.forEach(function (v, h) {
        var c = el('div', undefined, 'c');
        c.style.background = HEAT[max > 0 ? Math.min(HEAT.length - 1, Math.floor(v / max * HEAT.length)) : 0];
        c.addEventListener('mouseenter', function () { paint(ri, h); });
        box.appendChild(c);
        nodes[ri].push(c);
      });
    });
    root.appendChild(box);
    var scale = el('div', undefined, 'scale');
    scale.appendChild(el('span', '적음'));
    HEAT.forEach(function (c) { var i = el('i'); i.style.background = c; scale.appendChild(i); });
    scale.appendChild(el('span', '많음'));
    scale.appendChild(el('span', '가장 많은 칸 ' + num(max) + unit));
    root.appendChild(scale);
    var on = null;
    function paint(ri, h) {
      if (on) on.classList.remove('on');
      on = nodes[ri][h];
      on.classList.add('on');
      clear(ro);
      var line = el('div', undefined, 'line');
      line.appendChild(el('span', WD[ri] + '요일 ' + h + '시'));
      line.appendChild(el('b', num(grid[ri][h]) + unit));
      line.appendChild(el('span', caption));
      ro.appendChild(line);
    }
    root.addEventListener('mouseleave', function () { paint(peak[0], peak[1]); });
    paint(peak[0], peak[1]);
    return root;
  }

  /** 색이 순위가 아니라 항목을 따라가게 정해진 차례로 놓는다. 비율이 뒤집혀도 iOS 가 Android 의 색을 받지 않는다. */
  function inOrder(parts, order, names) {
    return order.map(function (key) {
      var found = parts.filter(function (p) { return p.name === key; })[0];
      return { name: names[key], value: found ? found.value : 0 };
    });
  }

  /** 구성 막대. 가는 막대 아래에 이름 · 수 · 비율을 줄마다 적는다. */
  function splitPart(title, parts, colors, unit) {
    var box = el('div', undefined, 'part');
    box.appendChild(el('span', title, 'title'));
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
    if (total === 0) { box.appendChild(el('span', '기간에 방문이 없다', 'dim')); return box; }
    var bar = el('div', undefined, 'bar8');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', title + ': ' + parts.map(function (p) { return p.name + ' ' + Math.round(p.value / total * 100) + '%'; }).join(', '));
    var rows = el('div', undefined, 'rows');
    parts.forEach(function (p, i) {
      if (p.value > 0) {
        var seg = el('i');
        seg.style.flex = p.value + ' 1 0';
        seg.style.background = colors[i % colors.length];
        bar.appendChild(seg);
      }
      var r = el('div');
      var sw = el('i', undefined, 'swatch');
      sw.style.background = colors[i % colors.length];
      r.appendChild(sw);
      r.appendChild(el('span', p.name, 'name'));
      r.appendChild(el('span', num(p.value) + unit, 'n'));
      r.appendChild(el('span', Math.round(p.value / total * 100) + '%', 'share'));
      rows.appendChild(r);
    });
    box.appendChild(bar);
    box.appendChild(rows);
    return box;
  }
</script>`
