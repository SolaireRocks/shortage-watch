/* Shared chart helpers (Apache ECharts).
   Every time chart labels its x axis with dates and carries a caption under it giving the exact range shown, how long
   that is and how often the data comes (daily, weekly...). The y axis shows its numbers and, where given, its unit.
   Hovering shows a crosshair with the date and level on the axes and a readout of every series at that date. */
(function () {
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const palette = () => [css('--s1'), css('--s2'), css('--s3'), css('--s4'), css('--s5')];
  const charts = [];
  window.addEventListener('resize', () => charts.forEach((c) => { if (!c.isDisposed()) c.resize(); }));

  function make(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    const c = echarts.init(el, null, { renderer: 'canvas' });
    charts.push(c);
    return c;
  }

  /* ---- dates ---- */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  // 'YYYY-MM-DD' is read as local midnight, as ECharts reads it (new Date() alone would read it as UTC).
  const toDate = (v) => (v instanceof Date ? v : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v));
  const hasTime = (d) => d.getHours() !== 0 || d.getMinutes() !== 0;

  function dayText(v, dow) {
    const d = toDate(v);
    if (isNaN(d)) return String(v);
    return (dow ? DOW[d.getDay()] + ' ' : '') + MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function pointText(v) {
    const d = toDate(v);
    if (isNaN(d)) return String(v);
    return dayText(d, true) + (hasTime(d) ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '');
  }
  // Axis ticks: the year (bold) on Jan 1, the month on the 1st, otherwise month and day.
  function tickLabel(v) {
    const d = toDate(v);
    if (hasTime(d)) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.getDate() === 1 && d.getMonth() === 0) return '{y|' + d.getFullYear() + '}';
    if (d.getDate() === 1) return MON[d.getMonth()];
    return MON[d.getMonth()] + ' ' + d.getDate();
  }
  const plural = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's');
  function spanText(ms) {
    const d = ms / 864e5;
    if (d < 14) return plural(Math.max(1, Math.round(d)), 'day');
    if (d < 90) return plural(Math.round(d / 7), 'week');
    if (d < 690) return plural(Math.round(d / 30.44), 'month');
    const y = Math.round((d / 365.25) * 10) / 10;
    return (y % 1 ? y.toFixed(1) : y.toFixed(0)) + ' years';
  }
  // How often the longest series has a point: its median gap.
  function stepText(series) {
    const s = series.filter((x) => !x.legendHide && x.data && x.data.length > 2).sort((a, b) => b.data.length - a.data.length)[0];
    if (!s) return '';
    const t = s.data.map((p) => +toDate(p[0])).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    const gaps = t.slice(1).map((x, i) => (x - t[i]) / 864e5).filter((g) => g > 0).sort((a, b) => a - b);
    if (!gaps.length) return '';
    const g = gaps[Math.floor(gaps.length / 2)];
    return g < 0.9 ? 'hourly' : g <= 1.5 ? 'daily' : g <= 8 ? 'weekly' : g <= 16 ? 'every 2 weeks' : g <= 35 ? 'monthly' : g <= 100 ? 'quarterly' : 'yearly';
  }
  function extent(series) {
    let lo = Infinity, hi = -Infinity;
    series.forEach((s) => (s.data || []).forEach((p) => {
      if (p[1] == null) return;
      const t = +toDate(p[0]);
      if (!isNaN(t)) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
    }));
    return lo <= hi ? [lo, hi] : null;
  }
  const rangeText = (a, b, step) => dayText(a) + '  –  ' + dayText(b) + '   ·   ' + spanText(b - a) + (step ? ', ' + step + ' data' : '');

  /* ---- numbers ---- */
  function fmt(v) {
    if (v == null || isNaN(v)) return '–';
    const a = Math.abs(v);
    return a >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  }
  // Axis numbers stay short: 12k, 1.5M.
  function axisNum(v) {
    const a = Math.abs(v);
    const t = (x) => String(parseFloat(x.toFixed(1)));
    if (a >= 1e9) return t(v / 1e9) + 'B';
    if (a >= 1e6) return t(v / 1e6) + 'M';
    if (a >= 1e4) return t(v / 1e3) + 'k';
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  const withUnit = (txt, unit) => (!unit ? txt : unit === '%' ? txt + '%' : unit[0] === '$' ? '$' + txt + unit.slice(1) : txt + ' ' + unit);

  /* ---- tooltip pieces ---- */
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tipHead = (t) => '<div style="font-weight:600;margin-bottom:4px;color:' + css('--text') + '">' + escHtml(t) + '</div>';
  function tipRow(color, name, value, opt = {}) {
    const key = opt.box
      ? '<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + color + '"></span>'
      : '<span style="display:inline-block;width:14px;border-top:2px ' + (opt.dashed ? 'dashed' : 'solid') + ' ' + color + '"></span>';
    return '<div style="display:flex;align-items:center;gap:8px;line-height:1.7">' + key +
      '<span style="flex:1;color:' + css('--muted') + '">' + escHtml(name) + '</span>' +
      '<strong style="margin-left:12px;font-variant-numeric:tabular-nums;color:' + css('--text') + '">' + escHtml(value) + '</strong></div>';
  }
  const pill = () => ({ backgroundColor: css('--text'), color: css('--panel'), padding: [3, 6], borderRadius: 4, fontSize: 11 });

  /* The readout sits on one side of the cursor and stays there as the cursor moves. It starts on the right, or on the
     left when the right has no room, and only crosses over when it would run past the edge of the browser window.
     Positions are worked out against the window, not the chart, so it is drawn on the page body and never clipped. */
  function stickySide(c) {
    let side = null;
    c.getZr().on('globalout', () => { side = null; });  // each new hover picks afresh
    return (point, params, dom, rect, size) => {
      const [w, h] = size.contentSize;
      const box = c.getDom().getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const gap = 16, edge = 8;
      const cx = box.left + point[0], cy = box.top + point[1];
      const fitsRight = cx + gap + w <= vw - edge, fitsLeft = cx - gap - w >= edge;
      if (!side) side = fitsRight ? 'right' : fitsLeft ? 'left' : vw - cx >= cx ? 'right' : 'left';
      else if (side === 'right' && !fitsRight && fitsLeft) side = 'left';
      else if (side === 'left' && !fitsLeft && fitsRight) side = 'right';
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const x = clamp(side === 'right' ? cx + gap : cx - gap - w, edge, Math.max(edge, vw - w - edge));
      const y = clamp(cy - h / 2, edge, Math.max(edge, vh - h - edge));
      return [x - box.left, y - box.top];
    };
  }

  function tooltipBase(c) {
    return {
      trigger: 'axis', confine: false, appendTo: 'body', position: stickySide(c), backgroundColor: css('--panel'), borderColor: css('--border'), padding: [8, 10],
      textStyle: { color: css('--text'), fontSize: 12 }, extraCssText: 'box-shadow:0 4px 14px rgba(0,0,0,.12);border-radius:8px;',
      axisPointer: { type: 'cross', lineStyle: { color: css('--faint'), width: 1 }, crossStyle: { color: css('--faint'), width: 1, type: 'dashed' }, label: pill() },
    };
  }

  function base(c) {
    return {
      textStyle: { color: css('--muted'), fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
      grid: { left: 10, right: 18, top: 28, bottom: 22, containLabel: true },
      tooltip: tooltipBase(c),
      legend: { type: 'scroll', top: 0, textStyle: { color: css('--muted'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4,
        pageTextStyle: { color: css('--muted') }, pageIconColor: css('--muted'), pageIconInactiveColor: css('--border') },
    };
  }

  function timeAxis() {
    return {
      type: 'time', axisLine: { show: true, lineStyle: { color: css('--border') } }, axisTick: { show: true, lineStyle: { color: css('--border') } },
      axisLabel: { color: css('--muted'), fontSize: 11, hideOverlap: true, formatter: tickLabel, rich: { y: { fontWeight: 700, fontSize: 11, color: css('--text') } } },
      splitLine: { show: false },
      nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: css('--faint'), fontSize: 11 },
      axisPointer: { label: Object.assign(pill(), { formatter: (p) => pointText(p.value) }) },
    };
  }

  function valueAxis(name, right) {
    return {
      type: 'value', name: name || '', nameGap: 10, scale: true,
      nameTextStyle: { color: css('--muted'), fontSize: 11, align: right ? 'right' : 'left' },
      axisLabel: { color: css('--muted'), fontSize: 11, formatter: axisNum },
      splitLine: { lineStyle: { color: css('--border'), type: 'dashed' } },
      axisPointer: { label: Object.assign(pill(), { formatter: (p) => axisNum(Math.round(p.value * 1000) / 1000) }) },
    };
  }

  // The unit a value gets in the tooltip: opts.unit if given, else the axis name when it is a unit.
  const unitOf = (explicit, axisName) => (explicit !== undefined ? explicit : ['%', 'σ'].includes(axisName) ? axisName : '');

  function bandColor(spi) {
    return spi == null ? css('--faint') : spi < 60 ? css('--normal') : spi < 80 ? css('--elevated') : spi < 95 ? css('--high') : css('--severe');
  }

  const SW = {
    css, palette, make, fmt, bandColor, dayText,

    /* opts.bands: [[upper fraction, css var], ...]; opts.ticks: labelled values. Defaults are the SPI bands.
       opts.compact: smaller ring and number, for the Today page cards. */
    gauge(el, value, opts = {}) {
      const c = make(el);
      const k = opts.compact;
      // Compact gauges use a fixed pixel radius so every card's ring is the same size; their tick labels sit inside
      // the ring so nothing pokes out past the top (the "50") and two gauges fit side by side in one card.
      const r = k ? Math.max(40, Math.min(64, c.getWidth() / 2 - 6)) : null;
      const bands = (opts.bands || [[0.6, '--normal'], [0.8, '--elevated'], [0.95, '--high'], [1, '--severe']]).map(([f, v]) => [f, css(v)]);
      const ticks = opts.ticks || (opts.compact ? [0, 25, 50, 80, 100] : [0, 50, 60, 80, 95, 100]);
      c.setOption({
        series: [{
          type: 'gauge', min: 0, max: 100, splitNumber: 20, startAngle: 210, endAngle: -30, radius: k ? r : '96%', center: k ? ['50%', r + 10] : ['50%', '58%'],
          axisLine: { lineStyle: { width: k ? 11 : 16, color: bands } },
          pointer: { width: k ? 4 : 5, length: k ? '48%' : '62%', itemStyle: { color: css('--text') } },
          anchor: { show: true, size: k ? 8 : 10, itemStyle: { color: css('--text') } },
          axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: css('--faint'), distance: k ? 6 : -38, fontSize: k ? 9 : 10, formatter: (v) => (ticks.includes(v) ? v : '') },
          detail: { valueAnimation: true, offsetCenter: [0, k ? '52%' : '42%'], fontSize: k ? 28 : 34, fontWeight: 700, color: css('--text'), formatter: (v) => (v == null ? '–' : v.toFixed(0)) },
          title: { show: false },
          data: [{ value: value == null ? null : Math.round(value * 10) / 10 }],
        }],
      });
      return c;
    },

    /* Small card chart: dates along the bottom, a few numbers up the side, the value and date on hover.
       opts: {unit, color} (a bare colour string is still accepted). */
    spark(el, data, opts = {}) {
      if (typeof opts === 'string') opts = { color: opts };
      const c = make(el);
      const color = opts.color || css('--s1');
      const tip = tooltipBase(c);
      tip.axisPointer = { type: 'line', lineStyle: { color: css('--faint'), width: 1 } };
      tip.formatter = (ps) => {
        const p = (Array.isArray(ps) ? ps : [ps])[0];
        return p ? tipHead(pointText(p.value[0])) + tipRow(color, 'Value', withUnit(fmt(p.value[1]), opts.unit)) : '';
      };
      c.setOption({
        animation: false, grid: { left: 0, right: 6, top: 8, bottom: 0, containLabel: true }, tooltip: tip,
        textStyle: { fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
        xAxis: { type: 'time', min: 'dataMin', max: 'dataMax', splitNumber: 3, axisTick: { show: false },
          axisLine: { lineStyle: { color: css('--border') } }, splitLine: { show: false },
          axisLabel: { color: css('--faint'), fontSize: 10, hideOverlap: true, formatter: tickLabel, rich: { y: { fontWeight: 700, fontSize: 10, color: css('--muted') } } } },
        yAxis: { type: 'value', scale: true, splitNumber: 2,
          axisLabel: { color: css('--faint'), fontSize: 10, formatter: axisNum },
          splitLine: { lineStyle: { color: css('--border'), type: 'dashed' } } },
        series: [{ type: 'line', data, showSymbol: false, symbolSize: 6, lineStyle: { width: 1.5, color },
          itemStyle: { color }, areaStyle: { color, opacity: 0.08 } }],
      });
      return c;
    },

    /* series: [{name, data:[[date,v]], color, dashed, area, yAxisIndex}]
       opts: {yName, unit, y2, y2Name, y2Unit, zoom, zero, daily, legend, grid} */
    lines(el, series, opts = {}) {
      const c = make(el);
      const pal = palette();
      const o = base(c);
      const legendOn = opts.legend !== false;
      o.xAxis = timeAxis();
      o.yAxis = opts.y2 ? [valueAxis(opts.yName), Object.assign(valueAxis(opts.y2Name, true), { splitLine: { show: false } })] : valueAxis(opts.yName);
      // The legend gets the top row; the axis unit sits on its own row beneath it so they never overlap.
      o.grid.top = (legendOn ? 26 : 8) + (opts.yName || opts.y2Name ? 20 : 6);
      if (opts.y2) o.grid.right = 10;
      if (opts.zoom) {
        o.dataZoom = [{ type: 'inside', throttle: 50 }, { type: 'slider', height: 18, bottom: 4, borderColor: css('--border'), textStyle: { color: css('--faint') },
          labelFormatter: (v) => dayText(v) }];
        o.grid.bottom = 44;
      }

      const ext = extent(series);
      const step = stepText(series);
      o.xAxis.name = ext ? rangeText(ext[0], ext[1], step) : '';

      const units = [unitOf(opts.unit, opts.yName), unitOf(opts.y2Unit, opts.y2Name)];
      o.tooltip.formatter = (ps) => {
        ps = Array.isArray(ps) ? ps : [ps];
        if (!ps.length) return '';
        const byIdx = new Map(ps.map((p) => [p.seriesIndex, p]));
        const rows = ps.map((p) => {
          const s = series[p.seriesIndex];
          if (!s || s.legendHide) return '';
          const v = Array.isArray(p.value) ? p.value[1] : p.value;
          if (v == null || isNaN(v)) return '';
          const unit = units[s.yAxisIndex || 0];
          let txt;
          if (s.band) {  // a band is drawn as base + height; show it as its low – high range
            const b = byIdx.get(p.seriesIndex - 1);
            if (!b || b.value[1] == null) return '';
            txt = withUnit(fmt(b.value[1]), unit) + ' – ' + withUnit(fmt(b.value[1] + v), unit);
          } else txt = withUnit(fmt(v), unit);
          const color = s.color && s.color !== 'transparent' ? s.color : p.color;
          return tipRow(color, s.name, txt, { dashed: s.dashed, box: s.band });
        }).join('');
        return rows ? tipHead(pointText(ps[0].axisValue != null ? ps[0].axisValue : ps[0].value[0])) + rows : '';
      };

      o.series = series.map((s, i) => ({
        type: 'line', name: s.name, data: s.data, showSymbol: s.symbols || (s.data || []).length < 20, symbolSize: 5, yAxisIndex: s.yAxisIndex || 0,
        step: s.step || false, connectNulls: false, z: s.z || 2,
        // width 0 means no line: markers only, or a band's fill
        lineStyle: { width: s.width != null ? s.width : 1.8, type: s.dashed ? 'dashed' : 'solid', color: s.color || pal[i % pal.length], opacity: s.opacity || 1 },
        itemStyle: { color: s.color || pal[i % pal.length] },
        areaStyle: s.area ? { opacity: 0.12, color: s.color || pal[i % pal.length] } : undefined,
        markLine: s.markLine, markArea: s.markArea, stack: s.stack,
      }));
      if (series.some((s) => s.legendHide)) o.legend.data = series.filter((s) => !s.legendHide && s.name).map((s) => s.name);
      if (opts.zero) {
        o.series.push({ type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: css('--faint'), type: 'solid', width: 1 }, label: { show: false }, data: [{ yAxis: 0 }] } });
      }
      if (opts.daily) o.xAxis.minInterval = 864e5;  // one point per day: never label hours
      if (!legendOn) o.legend.show = false;
      if (opts.grid) Object.assign(o.grid, opts.grid);
      c.setOption(o);

      // Zooming re-captions the axis with the range now in view.
      if (opts.zoom && ext) {
        c.on('datazoom', () => {
          const z = (c.getOption().dataZoom || [])[0];
          if (!z) return;
          const span = ext[1] - ext[0];
          const a = Math.max(ext[0], z.startValue != null ? +z.startValue : ext[0] + (span * z.start) / 100);
          const b = Math.min(ext[1], z.endValue != null ? +z.endValue : ext[0] + (span * z.end) / 100);
          c.setOption({ xAxis: { name: rangeText(a, b, step) } });
        });
      }
      return c;
    },

    /* Horizontal stacked bars. cats: labels (top to bottom); series: [{name, data:[n per cat], color}]; opts: {left, xName, minLabel} */
    hbars(el, cats, series, opts = {}) {
      const c = make(el);
      const o = base(c);
      o.tooltip = Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: css('--border'), opacity: 0.4 } } });
      o.tooltip.formatter = (ps) => {
        ps = Array.isArray(ps) ? ps : [ps];
        if (!ps.length) return '';
        const total = ps.reduce((t, p) => t + (+p.value || 0), 0);
        return tipHead(ps[0].axisValue) + ps.map((p) => tipRow(series[p.seriesIndex].color, p.seriesName, fmt(p.value), { box: true })).join('') +
          (ps.length > 1 ? tipRow('transparent', 'Total', fmt(total)) : '');
      };
      // Category names are truncated to a fixed width, so the grid leaves exactly that much room rather than measuring them.
      o.grid = Object.assign(o.grid, { left: opts.left || 170, right: 24, top: 30, bottom: opts.xName ? 44 : 24, containLabel: false });
      o.xAxis = Object.assign(valueAxis(), { scale: false, minInterval: 1, name: opts.xName || '', nameLocation: 'middle', nameGap: 28,
        nameTextStyle: { color: css('--faint'), fontSize: 11 } });
      o.yAxis = { type: 'category', data: cats.slice().reverse(), inverse: false, axisTick: { show: false },
        axisLine: { lineStyle: { color: css('--border') } }, axisLabel: { color: css('--muted'), fontSize: 12, width: (opts.left || 170) - 14, overflow: 'truncate' } };
      o.series = series.map((s) => ({ type: 'bar', name: s.name, stack: 'total', data: s.data.slice().reverse(), barMaxWidth: 22,
        itemStyle: { color: s.color, borderColor: css('--panel'), borderWidth: 2, borderRadius: 4 },
        label: { show: true, position: 'inside', color: '#fff', fontSize: 11, formatter: (p) => (p.value >= (opts.minLabel || 3) ? p.value : '') } }));
      c.setOption(o);
      return c;
    },

    /* Vertical stacked bars, one per category. series: [{name, data:[v per cat], color}]
       opts: {yName, unit, xName, dates} — dates: the categories are 'YYYY-MM-DD' days, labelled as dates and captioned with their range. */
    vbars(el, cats, series, opts = {}) {
      const c = make(el);
      const o = base(c);
      o.tooltip = Object.assign(o.tooltip, { axisPointer: { type: 'shadow', shadowStyle: { color: css('--border'), opacity: 0.4 } } });
      o.tooltip.formatter = (ps) => {
        ps = Array.isArray(ps) ? ps : [ps];
        if (!ps.length) return '';
        const head = opts.dates ? pointText(ps[0].axisValue) : ps[0].axisValue;
        const total = ps.reduce((t, p) => t + (+p.value || 0), 0);
        return tipHead(head) + ps.map((p) => tipRow(series[p.seriesIndex].color, p.seriesName, withUnit(fmt(p.value), opts.unit), { box: true })).join('') +
          (ps.length > 1 ? tipRow('transparent', 'Total', withUnit(fmt(total), opts.unit)) : '');
      };
      const caption = opts.xName != null ? opts.xName
        : opts.dates && cats.length ? dayText(cats[0]) + '  –  ' + dayText(cats[cats.length - 1]) + '   ·   ' + plural(cats.length, 'day') + ' shown' : '';
      o.xAxis = { type: 'category', data: cats, axisTick: { show: false }, axisLine: { lineStyle: { color: css('--border') } },
        axisLabel: { color: css('--muted'), fontSize: 11, hideOverlap: true, formatter: opts.dates ? (v) => { const d = toDate(v); return MON[d.getMonth()] + ' ' + d.getDate(); } : undefined },
        name: caption, nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: css('--faint'), fontSize: 11 } };
      o.yAxis = Object.assign(valueAxis(opts.yName), { scale: false });
      o.grid.top = 26 + (opts.yName ? 20 : 6);
      o.series = series.map((s) => ({ type: 'bar', name: s.name, stack: 'total', data: s.data, barMaxWidth: 26,
        itemStyle: { color: s.color, borderColor: css('--panel'), borderWidth: 1 } }));
      c.setOption(o);
      return c;
    },

    /* band between lo and hi drawn as a stacked transparent base + filled range */
    band(lo, hi, name, color) {
      const hiMap = new Map(hi.map((p) => [p[0], p[1]]));
      const diff = lo.filter((p) => hiMap.has(p[0])).map((p) => [p[0], hiMap.get(p[0]) - p[1]]);
      return [
        { name: name + ' base', data: lo.filter((p) => hiMap.has(p[0])), color: 'transparent', stack: 'band', width: 0, legendHide: true },
        { name, data: diff, color: color || css('--faint'), stack: 'band', area: true, width: 0, opacity: 0, band: true },
      ];
    },

    sinceFilter(data, days) {
      if (!days) return data;
      const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      return data.filter((p) => p[0] >= cut);
    },

    async json(url) {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(url + ': ' + r.status);
      return r.json();
    },
  };
  window.SW = SW;

  /* Status bar on every page: what the program is doing right now. Stays hidden if there is no local server. */
  const SHOW_LONE_JOB_AFTER = 3; // seconds; a quick website rebuild shouldn't flash the bar
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const took = (s) => (s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm');
  const STEP_MARK = { done: '✓', partial: '!', failed: '✗', running: '▸', skipped: '–', pending: '·' };
  let wasBusy = false;

  function statusLine(s) {
    const p = s.pipeline;
    const job = s.jobs.find((j) => j.in_pipeline) || s.jobs[0];
    const parts = [];
    if (p) parts.push('<strong>' + esc(p.name) + '</strong>');
    if (p && p.waiting) parts.push(esc(p.waiting));
    if (job) {
      parts.push((p && p.step ? 'Step ' + p.step + ' of ' + p.steps.length + ': ' : '') + esc(job.label));
      if (job.total) parts.push(job.done + ' of ' + job.total + ': ' + esc(job.item));
    }
    if (job) parts.push(took(job.seconds));
    return parts.join(' · ');
  }

  function renderBar(s) {
    const bar = document.getElementById('sw-status');
    if (!bar) return;
    const show = s && (s.pipeline || s.jobs.some((j) => j.seconds >= SHOW_LONE_JOB_AFTER));
    bar.hidden = !show;
    if (show) bar.innerHTML = '<span class="pulse" aria-hidden="true"></span><span>' + statusLine(s) + '</span>';
  }

  function renderNoBriefing(s) {
    const box = document.getElementById('no-briefing');
    if (!box) return;
    const steps = document.getElementById('nb-steps');
    if (s.pipeline) {
      document.getElementById('nb-title').textContent = s.pipeline.name + ' is running';
      document.getElementById('nb-text').textContent = s.pipeline.note || 'The first briefing will appear here when it finishes.';
      steps.hidden = false;
      steps.innerHTML = s.pipeline.steps.map((st) => '<li class="' + st.state + '"><span class="mark">' + STEP_MARK[st.state] + '</span>' + esc(st.label) + '</li>').join('');
    } else if (s.last && s.last.failed.length) {
      document.getElementById('nb-title').textContent = 'No briefing yet';
      document.getElementById('nb-text').innerHTML = esc(s.last.name) + ' finished, but these steps failed: ' + esc(s.last.failed.join(', ')) + '. The <a href="logs.html">Logs page</a> shows why.';
      steps.hidden = true;
    }
  }

  async function pollStatus() {
    let s = null;
    try {
      const r = await fetch((document.body.dataset.root || '') + 'api/status', { cache: 'no-store' });
      if (r.ok) s = await r.json();
    } catch (e) { /* no local server: this copy of the site is static */ }
    renderBar(s);
    if (s) {
      renderNoBriefing(s);
      if (wasBusy && !s.busy && document.getElementById('no-briefing') && !(s.last && s.last.failed.length)) { location.reload(); return; }
      wasBusy = s.busy;
    }
    setTimeout(pollStatus, s && s.busy ? 2500 : 20000);
  }
  // The public copy has no server behind it, so it never asks.
  document.addEventListener('DOMContentLoaded', () => { if (!document.body.dataset.public) pollStatus(); });
})();
