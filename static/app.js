/* Shared chart helpers (Apache ECharts). */
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

  function base() {
    return {
      textStyle: { color: css('--muted'), fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
      grid: { left: 48, right: 18, top: 28, bottom: 30, containLabel: false },
      tooltip: {
        trigger: 'axis', backgroundColor: css('--panel'), borderColor: css('--border'),
        textStyle: { color: css('--text'), fontSize: 12 }, valueFormatter: (v) => (v == null ? '–' : fmt(v)),
      },
      legend: { top: 0, textStyle: { color: css('--muted'), fontSize: 12 }, icon: 'roundRect', itemWidth: 12, itemHeight: 4 },
    };
  }

  function fmt(v) {
    if (v == null || isNaN(v)) return '–';
    const a = Math.abs(v);
    return a >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  }

  function timeAxis() {
    return {
      type: 'time', axisLine: { lineStyle: { color: css('--border') } }, axisTick: { show: false },
      axisLabel: { color: css('--faint'), fontSize: 11, hideOverlap: true }, splitLine: { show: false },
    };
  }

  function valueAxis(name) {
    return {
      type: 'value', name: name || '', nameTextStyle: { color: css('--faint'), fontSize: 11, align: 'left' }, scale: true,
      axisLabel: { color: css('--faint'), fontSize: 11 }, splitLine: { lineStyle: { color: css('--border'), type: 'dashed' } },
    };
  }

  function bandColor(spi) {
    return spi == null ? css('--faint') : spi < 60 ? css('--normal') : spi < 80 ? css('--elevated') : spi < 95 ? css('--high') : css('--severe');
  }

  const SW = {
    css, palette, make, fmt, bandColor,

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

    spark(el, data, color) {
      const c = make(el);
      c.setOption({
        animation: false, grid: { left: 2, right: 2, top: 4, bottom: 2 },
        xAxis: { type: 'time', show: false }, yAxis: { type: 'value', show: false, scale: true },
        series: [{ type: 'line', data, showSymbol: false, lineStyle: { width: 1.5, color: color || css('--s1') },
          areaStyle: { color: color || css('--s1'), opacity: 0.08 } }],
      });
      return c;
    },

    /* series: [{name, data:[[date,v]], color, dashed, area, yAxisIndex}] */
    lines(el, series, opts = {}) {
      const c = make(el);
      const pal = palette();
      const o = base();
      o.xAxis = timeAxis();
      o.yAxis = opts.y2 ? [valueAxis(opts.yName), Object.assign(valueAxis(opts.y2Name), { splitLine: { show: false } })] : valueAxis(opts.yName);
      if (opts.zoom) {
        o.dataZoom = [{ type: 'inside', throttle: 50 }, { type: 'slider', height: 18, bottom: 4, borderColor: css('--border'), textStyle: { color: css('--faint') } }];
        o.grid.bottom = 52;
      }
      o.series = series.map((s, i) => ({
        type: 'line', name: s.name, data: s.data, showSymbol: s.symbols || (s.data || []).length < 20, symbolSize: 5, yAxisIndex: s.yAxisIndex || 0,
        step: s.step || false, connectNulls: false, z: s.z || 2,
        lineStyle: { width: s.width || 1.8, type: s.dashed ? 'dashed' : 'solid', color: s.color || pal[i % pal.length], opacity: s.opacity || 1 },
        itemStyle: { color: s.color || pal[i % pal.length] },
        areaStyle: s.area ? { opacity: 0.12, color: s.color || pal[i % pal.length] } : undefined,
        markLine: s.markLine, markArea: s.markArea, stack: s.stack,
      }));
      if (opts.zero) {
        o.series.push({ type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: css('--faint'), type: 'solid', width: 1 }, label: { show: false }, data: [{ yAxis: 0 }] } });
      }
      if (opts.daily) o.xAxis.minInterval = 864e5;  // one point per day: never label hours
      if (opts.legend === false) o.legend.show = false;
      if (opts.grid) Object.assign(o.grid, opts.grid);
      c.setOption(o);
      return c;
    },

    /* Horizontal stacked bars. cats: labels (top to bottom); series: [{name, data:[n per cat], color}] */
    hbars(el, cats, series, opts = {}) {
      const c = make(el);
      const o = base();
      o.tooltip = Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'shadow' } });
      o.grid = Object.assign(o.grid, { left: opts.left || 170, right: 24, top: 30, bottom: 24 });
      o.xAxis = Object.assign(valueAxis(opts.xName), { scale: false, minInterval: 1 });
      o.yAxis = { type: 'category', data: cats.slice().reverse(), inverse: false, axisTick: { show: false },
        axisLine: { lineStyle: { color: css('--border') } }, axisLabel: { color: css('--muted'), fontSize: 12, width: (opts.left || 170) - 14, overflow: 'truncate' } };
      o.series = series.map((s) => ({ type: 'bar', name: s.name, stack: 'total', data: s.data.slice().reverse(), barMaxWidth: 22,
        itemStyle: { color: s.color, borderColor: css('--panel'), borderWidth: 2, borderRadius: 4 },
        label: { show: true, position: 'inside', color: '#fff', fontSize: 11, formatter: (p) => (p.value >= (opts.minLabel || 3) ? p.value : '') } }));
      c.setOption(o);
      return c;
    },

    /* Vertical stacked bars, one per category (e.g. day). series: [{name, data:[v per cat], color}] */
    vbars(el, cats, series, opts = {}) {
      const c = make(el);
      const o = base();
      o.tooltip = Object.assign(o.tooltip, { axisPointer: { type: 'shadow' } });
      o.xAxis = { type: 'category', data: cats, axisTick: { show: false }, axisLine: { lineStyle: { color: css('--border') } },
        axisLabel: { color: css('--faint'), fontSize: 11, hideOverlap: true } };
      o.yAxis = Object.assign(valueAxis(opts.yName), { scale: false });
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
        { name, data: diff, color: color || css('--faint'), stack: 'band', area: true, width: 0, opacity: 0 },
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
