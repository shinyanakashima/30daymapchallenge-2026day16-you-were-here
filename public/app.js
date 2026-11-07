(() => {
  'use strict';

  const START = '2026-11-07';
  const ADMIN1_ZOOM = 3;
  const params = new URLSearchParams(location.search);
  const EXPORT = params.has('export');

  const I18N = {
    en: {
      title: 'You were here.',
      lead: 'Opening this page added you to this map. You are now one of its co-authors.',
      you: 'You were counted in: <b>{place}</b> <small>Estimated from your IP address.</small>',
      youRepeat: 'You were counted in: <b>{place}</b> <small>Estimated from your IP address. Already counted today.</small>',
      youUnknown: 'You were counted, but your location could not be estimated.',
      youBot: 'This browser identifies itself as a machine, so it was not counted as a co-author.',
      sPeople: 'Co-authors', sCountries: 'Countries', sBots: 'Machines', sAi: 'AI',
      lBots: 'Machines', lAi: 'AI',
      legend: 'People per country / region',
      about: 'About this map', back: 'World',
      aiH: 'AI visitors', aiNote: "AI doesn't count as a friend :)",
      howH: 'How it is counted',
      how1: 'Opening this page counts once (once a day per browser), by country and region.',
      how2: "The location is Cloudflare's estimate from your IP address. It can be off with a VPN or a mobile network.",
      how3: 'No IP addresses or browser details are stored. Only the date, country, region and visitor type.',
      how4: 'Machines are counted when they request this page and are shown as rings. AI crawlers are not counted as co-authors.',
      src: 'Map data',
      fine: 'Counted once per visit by country/region, as estimated by Cloudflare from your IP address (VPNs and mobile networks can shift it). No IP addresses or browser details are stored. Map data: Natural Earth.',
      cSum: '{p} co-authors · {m} machines · {a} AI',
      unmatched: 'Region not identified',
      none: 'None yet.',
      unknown: 'Unknown',
      tipP: '{n} co-authors', tipM: '{n} machines', tipA: '{n} AI',
      play: 'Play', pause: 'Pause',
    },
    ja: {
      title: 'You were here.',
      lead: 'このページを開いたことで、あなたはこの地図に加わり、共同制作者のひとりになりました。',
      you: 'あなたが加わった場所：<b>{place}</b> <small>IP アドレスからの推定です。</small>',
      youRepeat: 'あなたが加わった場所：<b>{place}</b> <small>IP アドレスからの推定です。今日はすでに数えられています。</small>',
      youUnknown: '数えられましたが、場所は推定できませんでした。',
      youBot: 'このブラウザは機械として名乗っているため、共同制作者には数えていません。',
      sPeople: '共同制作者', sCountries: '国・地域', sBots: '機械', sAi: 'AI',
      lBots: '機械', lAi: 'AI',
      legend: '国・地域ごとの人数',
      about: 'この地図について', back: '世界',
      aiH: 'AI の訪問', aiNote: "AI doesn't count as a friend :)　AI は友だちに数えません",
      howH: '数え方',
      how1: 'このページを開くと、国・地域の単位で1件数えます（同じブラウザは1日1回）。',
      how2: '国・地域は Cloudflare が IP アドレスから推定した値です。VPN やスマートフォンの回線では、ずれることがあります。',
      how3: 'IP アドレスやブラウザの詳しい情報は保存しません。保存するのは日付、国、地域、訪問の種類だけです。',
      how4: '機械（巡回プログラム）はページを要求したときに数え、輪で表示します。AI の巡回プログラムは共同制作者に数えません。',
      src: '出典',
      fine: '開くと国・地域の単位で1件数えます。国・地域は Cloudflare が IP アドレスから推定した値で、VPN やスマートフォンの回線ではずれることがあります。IP アドレスやブラウザの詳しい情報は保存しません。出典：Natural Earth',
      cSum: '共同制作者 {p} · 機械 {m} · AI {a}',
      unmatched: '地域を特定できなかったもの',
      none: 'まだありません。',
      unknown: '不明',
      tipP: '共同制作者 {n}', tipM: '機械 {n}', tipA: 'AI {n}',
      play: '再生', pause: '一時停止',
    },
  };

  // ---------- storage helpers (may be unavailable) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  let lang = EXPORT ? 'en' : (params.get('lang') || store.get('ywh-lang') || 'en');
  if (!I18N[lang]) lang = 'en';
  const t = (k, vars = {}) => (I18N[lang][k] || I18N.en[k] || k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
  const fmt = (n) => new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US').format(n);
  let regionNames = null;
  const countryName = (cc) => {
    if (!cc || cc === 'XX') return t('unknown');
    try { return regionNames.of(cc) || cc; } catch { return byId.get(cc)?.properties.name || cc; }
  };

  // ---------- state ----------
  const $ = (id) => document.getElementById(id);
  const todayUTC = () => new Date().toISOString().slice(0, 10);
  const byId = new Map();
  const admin1 = new Map(); // cc -> {features, byCode}
  let admin1Index = new Set();
  let rows = [];
  let dates = [];
  let dayIdx = 0;
  let agg = null;
  let mine = null; // {country, region, regionName, repeat, kind}
  let selected = null;
  let k = 1;

  if (EXPORT) document.body.classList.add('export');

  // ---------- map ----------
  const container = $('map');
  const svg = d3.select(container).append('svg');
  const root = svg.append('g');
  const gSphere = root.append('path').attr('class', 'sphere');
  const gGrat = root.append('path').attr('class', 'graticule');
  const gCountries = root.append('g');
  const gAdm1 = root.append('g').attr('class', 'adm1');
  const gYou = root.append('g');
  const gRingM = root.append('g');
  const gRingA = root.append('g');
  const tip = d3.select('#app').append('div').attr('class', 'tip').attr('hidden', '');

  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);
  let width = 0, height = 0, features = [], fitBox = [[0, 0], [1, 1]];

  const zoom = d3.zoom().scaleExtent([1, 60]).on('zoom', (e) => {
    k = e.transform.k;
    root.attr('transform', e.transform);
    sizeMarks();
  }).on('end', () => updateAdmin1Visibility());
  if (!EXPORT) svg.call(zoom).on('dblclick.zoom', null);

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let colors = {};
  const readColors = () => { colors = { land: css('--land'), h0: css('--h0'), h1: css('--h1') }; };

  function fill(n, max) {
    if (!n) return colors.land;
    const s = max > 1 ? Math.log(n) / Math.log(max) : 1;
    return d3.interpolateLab(colors.h0, colors.h1)(0.12 + 0.88 * s);
  }

  function layout() {
    width = container.clientWidth;
    height = container.clientHeight;
    svg.attr('viewBox', [0, 0, width, height]);
    let ext;
    if (EXPORT) {
      ext = [[16, 8], [width - 16, 640]];
    } else {
      const box = container.getBoundingClientRect();
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const mobile = width <= 760;
      let top = (mobile ? r('.head').bottom : Math.max(r('.head').bottom, r('.stats').bottom)) - box.top + 8;
      let bottom = (mobile ? r('.dock').top : r('.fine').top) - box.top - 8;
      if (mobile) {
        const side = r('.side');
        if (!$('side').classList.contains('open') && !$('side').classList.contains('has-country')) bottom = Math.min(bottom, side.top - box.top - 8);
      }
      if (bottom - top < height * 0.35) { top = 16; bottom = height - 16; }
      const pad = Math.min(24, width * 0.03);
      ext = [[pad, top], [width - pad, bottom]];
    }
    fitBox = ext;
    projection.fitExtent(ext, { type: 'Sphere' });
    gSphere.datum({ type: 'Sphere' }).attr('d', path);
    gGrat.datum(d3.geoGraticule10()).attr('d', path);
    gCountries.selectAll('path').attr('d', path);
    gAdm1.selectAll('path').attr('d', path);
    zoom.extent([[0, 0], [width, height]]).translateExtent([[-width * 0.2, -height * 0.2], [width * 1.2, height * 1.2]]);
    drawYou();
    drawRings();
  }

  // ---------- aggregation ----------
  function aggregate(until) {
    const a = { human: new Map(), region: new Map(), bot: new Map(), ai: new Map(), aiAgents: new Map(), people: 0, bots: 0, ais: 0 };
    const add = (m, key, n) => m.set(key, (m.get(key) || 0) + n);
    for (const [date, cc, region, kind, agent, n] of rows) {
      if (date > until) continue;
      if (kind === 'human') {
        a.people += n;
        add(a.human, cc, n);
        add(a.region, cc + '|' + region, n);
      } else if (kind === 'ai_bot') {
        a.ais += n;
        add(a.ai, cc, n);
        add(a.aiAgents, agent || '?', n);
      } else {
        a.bots += n;
        add(a.bot, cc, n);
      }
    }
    a.countries = [...a.human.keys()].filter((c) => c !== 'XX').length;
    a.max = Math.max(1, ...a.human.values());
    return a;
  }

  function render() {
    agg = aggregate(dates[dayIdx] || todayUTC());
    $('sPeople').textContent = fmt(agg.people);
    $('sCountries').textContent = fmt(agg.countries);
    $('sBots').textContent = fmt(agg.bots);
    $('sAi').textContent = fmt(agg.ais);
    $('rampMax').textContent = fmt(agg.max);
    gCountries.selectAll('path').attr('fill', (d) => countryFill(d.id));
    drawAdmin1();
    drawRings();
    renderAiList();
    if (selected) renderCountryPanel(selected);
  }

  function countryHasRegions(cc) {
    const a = admin1.get(cc);
    if (!a || !agg) return false;
    for (const [key, n] of agg.region) {
      if (n && key.startsWith(cc + '|') && a.byCode.has(cc + '-' + key.slice(3))) return true;
    }
    return false;
  }

  function admin1Shown(cc) {
    return selected === cc || (k >= ADMIN1_ZOOM && admin1.has(cc));
  }

  function countryFill(cc) {
    if (admin1Shown(cc) && countryHasRegions(cc)) return colors.land;
    return fill(agg?.human.get(cc) || 0, agg?.max || 1);
  }

  // ---------- admin-1 ----------
  async function loadAdmin1(cc) {
    if (admin1.has(cc)) return admin1.get(cc);
    if (!admin1Index.has(cc)) return null;
    const res = await fetch(`/data/admin1/${cc}.json`);
    if (!res.ok) return null;
    const gj = await res.json();
    for (const f of gj.features) rewind(f);
    const entry = { features: gj.features, byCode: new Map() };
    for (const f of gj.features) if (f.properties.code) entry.byCode.set(f.properties.code, f);
    admin1.set(cc, entry);
    return entry;
  }

  // d3 expects clockwise exterior rings; flip any feature that would cover most of the globe.
  function rewind(f) {
    const fix = (poly) => (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((ring) => ring.slice().reverse()) : poly);
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Polygon') g.coordinates = fix(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(fix);
  }

  function drawAdmin1() {
    if (!agg) return;
    const shown = [...admin1.keys()].filter((cc) => admin1Shown(cc) && (countryHasRegions(cc) || selected === cc));
    const groups = gAdm1.selectAll('g').data(shown, (d) => d);
    groups.exit().remove();
    const all = groups.enter().append('g').merge(groups);
    all.each(function (cc) {
      const has = countryHasRegions(cc);
      d3.select(this).selectAll('path')
        .data(admin1.get(cc).features, (f) => f.properties.code + f.properties.name)
        .join((en) => en.append('path').attr('d', path)
          .on('pointermove', (e, f) => showTip(e, regionName(f), agg.region.get(cc + '|' + regionCodeOf(f)) || 0))
          .on('pointerleave', hideTip)
          .on('click', (e) => { e.stopPropagation(); select(cc); }))
        .attr('fill', (f) => {
          if (!has) return 'none';
          return fill(agg.region.get(cc + '|' + regionCodeOf(f)) || 0, agg.max);
        })
        .attr('pointer-events', has ? null : 'none');
    });
    gCountries.selectAll('path').attr('fill', (d) => countryFill(d.id));
  }

  const regionCodeOf = (f) => (f.properties.code || '').split('-').slice(1).join('-');
  const regionName = (f) => (lang === 'ja' && f.properties.ja) || f.properties.name;

  let admin1Timer = 0;
  function updateAdmin1Visibility() {
    clearTimeout(admin1Timer);
    admin1Timer = setTimeout(async () => {
      if (k >= ADMIN1_ZOOM && agg) {
        const tr = d3.zoomTransform(svg.node());
        const view = [tr.invert([0, 0]), tr.invert([width, height])];
        const want = [];
        for (const f of features) {
          if (!agg.human.get(f.id)) continue;
          const [[x0, y0], [x1, y1]] = path.bounds(f);
          if (x1 < view[0][0] || x0 > view[1][0] || y1 < view[0][1] || y0 > view[1][1]) continue;
          want.push(f.id);
        }
        await Promise.all(want.slice(0, 12).map(loadAdmin1));
      }
      drawAdmin1();
    }, 120);
  }

  // ---------- rings ----------
  const ringR = (n) => 6 + Math.sqrt(n) * 3.2;
  function anchor(cc) {
    const f = byId.get(cc);
    if (!f) return null;
    const { lx, ly } = f.properties;
    return projection(lx != null ? [lx, ly] : d3.geoCentroid(f));
  }
  function drawRings() {
    if (!agg || !width) return;
    const ring = (g, m, cls, on) => {
      const data = on ? [...m].filter(([cc, n]) => n && byId.has(cc)) : [];
      g.selectAll('circle').data(data, (d) => d[0]).join('circle')
        .attr('class', 'ring ' + cls)
        .attr('cx', (d) => anchor(d[0])[0])
        .attr('cy', (d) => anchor(d[0])[1])
        .attr('data-n', (d) => d[1]);
    };
    ring(gRingM, agg.bot, 'm', $('lBots').checked);
    ring(gRingA, agg.ai, 'a', $('lAi').checked);
    sizeMarks();
  }
  function sizeMarks() {
    gRingM.selectAll('circle').attr('r', function () { return ringR(+this.dataset.n) / k; });
    // AI rings sit just outside the machine rings so both stay visible.
    gRingA.selectAll('circle').attr('r', function () { return (ringR(+this.dataset.n) + 4) / k; });
    gYou.selectAll('.youdot').attr('r', 4 / k);
    gYou.selectAll('.youpulse').attr('r', 9 / k);
  }

  // ---------- you ----------
  function youFeature() {
    if (!mine || mine.country === 'XX') return null;
    const a = admin1.get(mine.country);
    const rf = a && mine.region ? a.byCode.get(mine.country + '-' + mine.region) : null;
    return { country: byId.get(mine.country), region: rf };
  }
  function drawYou() {
    gYou.selectAll('*').remove();
    const y = youFeature();
    if (!y || EXPORT) return;
    const shape = y.region || y.country;
    if (!shape) return;
    gYou.append('path').attr('class', 'youshape').attr('d', path(shape));
    const c = y.region ? path.centroid(y.region) : anchor(mine.country);
    if (!c || isNaN(c[0])) return;
    gYou.append('circle').attr('class', 'youpulse').attr('cx', c[0]).attr('cy', c[1]);
    gYou.append('circle').attr('class', 'youdot').attr('cx', c[0]).attr('cy', c[1]);
    sizeMarks();
  }
  function renderYou() {
    const el = $('you');
    if (!mine) { el.hidden = true; return; }
    el.hidden = false;
    if (mine.kind !== 'human') { el.textContent = t('youBot'); return; }
    if (mine.country === 'XX') { el.textContent = t('youUnknown'); return; }
    const y = youFeature();
    let region = '';
    if (y?.region) region = lang === 'ja' ? (y.region.properties.ja || mine.regionName) : (mine.regionName || y.region.properties.name);
    else region = mine.regionName || '';
    const place = [countryName(mine.country), region].filter(Boolean).map(escapeHtml).join(' / ');
    el.innerHTML = t(mine.repeat ? 'youRepeat' : 'you', { place });
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- panels ----------
  function renderAiList() {
    const list = [...agg.aiAgents].sort((a, b) => b[1] - a[1]);
    const ol = $('aiList');
    ol.innerHTML = list.length
      ? list.map(([name, n]) => `<li><span>${escapeHtml(name)}</span><span>${fmt(n)}</span></li>`).join('')
      : `<li class="empty">${t('none')}</li>`;
  }

  function renderCountryPanel(cc) {
    $('country').hidden = false;
    $('cName').textContent = countryName(cc);
    $('cSum').textContent = t('cSum', { p: fmt(agg.human.get(cc) || 0), m: fmt(agg.bot.get(cc) || 0), a: fmt(agg.ai.get(cc) || 0) });
    const a = admin1.get(cc);
    const items = [];
    let unmatched = 0;
    for (const [key, n] of agg.region) {
      if (!key.startsWith(cc + '|') || !n) continue;
      const code = key.slice(3);
      const f = a && code ? a.byCode.get(cc + '-' + code) : null;
      if (f) items.push([regionName(f), n]); else unmatched += n;
    }
    items.sort((x, y) => y[1] - x[1]);
    if (unmatched) items.push([t('unmatched'), unmatched]);
    $('cList').innerHTML = items.length
      ? items.map(([name, n]) => `<li><span>${escapeHtml(name)}</span><span>${fmt(n)}</span></li>`).join('')
      : `<li class="empty">${t('none')}</li>`;
  }

  async function select(cc) {
    if (EXPORT) return;
    selected = cc;
    gCountries.selectAll('path').classed('sel', (d) => d.id === cc);
    $('side').classList.add('has-country');
    await loadAdmin1(cc);
    renderCountryPanel(cc);
    drawAdmin1();
    const f = byId.get(cc);
    if (f) {
      const [[x0, y0], [x1, y1]] = boundsOf(f);
      // Fit into the part of the map not covered by panels.
      let [[bx0, by0], [bx1, by1]] = fitBox;
      if (width > 760) bx0 = Math.max(bx0, $('side').getBoundingClientRect().right - container.getBoundingClientRect().left + 8);
      const s = Math.min(40, 0.85 / Math.max((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0)));
      const tr = d3.zoomIdentity.translate((bx0 + bx1) / 2, (by0 + by1) / 2).scale(Math.max(1, s)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      svg.transition().duration(750).call(zoom.transform, tr);
    }
  }

  // Bounds of the main polygons, so small overseas territories don't flatten the zoom.
  function boundsOf(f) {
    if (f.geometry.type !== 'MultiPolygon') return path.bounds(f);
    const polys = f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }));
    const areas = polys.map((g) => path.area(g));
    const max = Math.max(...areas);
    const main = polys.filter((_, i) => areas[i] >= max * 0.2);
    return path.bounds({ type: 'MultiPolygon', coordinates: main.map((g) => g.coordinates) });
  }

  function deselect() {
    selected = null;
    gCountries.selectAll('path').classed('sel', false);
    $('country').hidden = true;
    $('side').classList.remove('has-country');
    drawAdmin1();
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
  }

  // ---------- tooltip ----------
  function showTip(e, name, n, cc) {
    const [x, y] = d3.pointer(e, document.getElementById('app'));
    let html = `<b>${escapeHtml(name)}</b> · ${t('tipP', { n: fmt(n) })}`;
    if (cc && $('lBots').checked && agg.bot.get(cc)) html += ` · ${t('tipM', { n: fmt(agg.bot.get(cc)) })}`;
    if (cc && $('lAi').checked && agg.ai.get(cc)) html += ` · ${t('tipA', { n: fmt(agg.ai.get(cc)) })}`;
    tip.html(html).attr('hidden', null).style('left', x + 'px').style('top', y + 'px');
  }
  function hideTip() { tip.attr('hidden', ''); }

  // ---------- time ----------
  function buildDates() {
    const first = rows.length && rows[0][0] < START ? rows[0][0] : START;
    let last = todayUTC();
    if (rows.length && rows[rows.length - 1][0] > last) last = rows[rows.length - 1][0];
    const out = [];
    for (let d = new Date(first + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    const atEnd = !dates.length || dayIdx === dates.length - 1;
    dates = out;
    const want = params.get('date');
    if (want && dates.includes(want) && !buildDates.done) dayIdx = dates.indexOf(want);
    else if (atEnd) dayIdx = dates.length - 1;
    buildDates.done = true;
    const r = $('day');
    r.max = String(dates.length - 1);
    r.value = String(dayIdx);
    labelDay();
  }
  function labelDay() {
    const d = dates[dayIdx];
    if (!d) return;
    $('dayLabel').textContent = new Date(d + 'T00:00:00Z').toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  let playTimer = 0;
  function setPlaying(on) {
    clearInterval(playTimer);
    playTimer = 0;
    $('playIcon').setAttribute('d', on ? 'M4 2.5h3v11H4zM9 2.5h3v11H9z' : 'M4 2.5v11l9-5.5z');
    $('play').setAttribute('aria-label', t(on ? 'pause' : 'play'));
    if (!on) return;
    if (dayIdx >= dates.length - 1) { dayIdx = 0; $('day').value = '0'; labelDay(); render(); }
    playTimer = setInterval(() => {
      if (dayIdx >= dates.length - 1) return setPlaying(false);
      dayIdx += 1;
      $('day').value = String(dayIdx);
      labelDay();
      render();
    }, 700);
  }

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = lang;
    regionNames = new Intl.DisplayNames([lang], { type: 'region' });
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $('play').setAttribute('aria-label', t(playTimer ? 'pause' : 'play'));
    labelDay();
    renderYou();
    if (width) layout();
    if (agg) { renderAiList(); if (selected) renderCountryPanel(selected); }
  }

  // ---------- data ----------
  async function loadStats(fresh) {
    const res = await fetch('/api/stats', fresh ? { cache: 'no-cache' } : {});
    if (!res.ok) throw new Error('stats ' + res.status);
    const data = await res.json();
    rows = data.rows || [];
    buildDates();
    render();
  }

  async function hello() {
    const key = 'ywh-counted';
    const today = todayUTC();
    const repeat = store.get(key) === today;
    const res = await fetch('/api/hello', repeat
      ? { cache: 'no-store' }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.counted) store.set(key, today);
    mine = { ...data, repeat: repeat && data.kind === 'human' };
    if (mine.country !== 'XX') await loadAdmin1(mine.country);
    renderYou();
    layout();
  }

  async function init() {
    readColors();
    applyLang();
    const [world, idx] = await Promise.all([
      fetch('/data/world.json').then((r) => r.json()),
      fetch('/data/admin1-index.json').then((r) => r.json()),
    ]);
    admin1Index = new Set(idx);
    features = topojson.feature(world, world.objects.countries).features;
    for (const f of features) byId.set(f.id, f);
    gCountries.selectAll('path').data(features, (d) => d.id).join('path')
      .attr('class', 'country')
      .attr('fill', colors.land)
      .on('pointermove', (e, d) => showTip(e, countryName(d.id), agg?.human.get(d.id) || 0, d.id))
      .on('pointerleave', hideTip)
      .on('click', (e, d) => { e.stopPropagation(); select(d.id); });
    layout();

    if (EXPORT) {
      $('lBots').checked = params.get('bots') !== '0';
      $('lAi').checked = params.get('ai') !== '0';
      $('exUrl').textContent = location.host;
      await loadStats(true);
      $('exDate').textContent = 'As of ' + $('dayLabel').textContent + ' (UTC), counted since ' + new Date(dates[0] + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      document.body.dataset.ready = '1';
      return;
    }

    $('lBots').checked = store.get('ywh-bots') !== '0';
    $('lAi').checked = store.get('ywh-ai') !== '0';
    await hello().catch(() => {});
    await loadStats(true).catch(() => {});
    document.body.dataset.ready = '1';
    setInterval(() => { if (!playTimer) loadStats(false).catch(() => {}); }, 60000);
  }

  // ---------- events ----------
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    store.set('ywh-lang', lang);
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    history.replaceState(null, '', u);
    applyLang();
  }));
  $('lBots').addEventListener('change', (e) => { store.set('ywh-bots', e.target.checked ? '1' : '0'); drawRings(); });
  $('lAi').addEventListener('change', (e) => { store.set('ywh-ai', e.target.checked ? '1' : '0'); drawRings(); });
  $('day').addEventListener('input', (e) => { setPlaying(false); dayIdx = +e.target.value; labelDay(); render(); });
  $('play').addEventListener('click', () => setPlaying(!playTimer));
  $('cBack').addEventListener('click', deselect);
  $('sideToggle').addEventListener('click', () => {
    const open = $('side').classList.toggle('open');
    $('sideToggle').setAttribute('aria-expanded', String(open));
  });
  window.addEventListener('resize', () => {
    const tr = d3.zoomTransform(svg.node());
    layout();
    if (tr.k !== 1) svg.call(zoom.transform, tr);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readColors(); if (agg) render(); });

  init().catch((err) => console.error(err));
})();
