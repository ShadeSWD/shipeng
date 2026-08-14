/* Живой расчёт: подбор главного двигателя и запаса топлива.
   Используется только на странице p-engine. Все формулы продублированы в
   тексте страницы, здесь — та же арифметика в коде. */
'use strict';
(function () {
  // Учебный типоразмерный ряд малооборотных дизелей: диаметр цилиндра,
  // частота вращения, мощность цилиндра и номинальный удельный расход.
  const SERIES = [
    { bore: 350, rpm: 167, pcyl: 850, ge: 177, z: [4, 5, 6] },
    { bore: 400, rpm: 146, pcyl: 1090, ge: 174, z: [5, 6] },
    { bore: 460, rpm: 129, pcyl: 1300, ge: 172, z: [5, 6, 7] },
    { bore: 500, rpm: 117, pcyl: 1580, ge: 170, z: [6, 7, 8] },
    { bore: 600, rpm: 105, pcyl: 2260, ge: 168, z: [6] },
  ];
  const ENGINES = [];
  SERIES.forEach((s) => s.z.forEach((z) => ENGINES.push({
    name: 'МОД ' + s.bore + ', ' + z + ' цил.',
    power: s.pcyl * z, rpm: s.rpm, ge: s.ge, bore: s.bore, z: z,
  })));
  ENGINES.sort((a, b) => a.power - b.power);
  const PMAX = 14000;

  const $ = (id) => document.getElementById(id);
  const num = (id) => parseFloat(String($(id).value).replace(',', '.'));
  const fmt = (x, d) => {
    const v = Number(x).toFixed(d === undefined ? 0 : d);
    return v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };
  const row = (f, sub, res) =>
    '<div class="calc-row"><span class="f">' + f + '</span> = '
    + '<span style="color:#6b6b74">' + sub + '</span> = <b>' + res + '</b></div>';

  function compute() {
    const D = num('inD');
    const v = num('inV');
    const C = num('inC');
    const kSea = num('inSea') / 100;
    const kMcr = num('inMcr') / 100;
    const R = num('inR');
    const auto = num('inAuto');
    const dgRun = num('inDgRun');
    const dgPort = num('inDgPort');
    const bad = [D, v, C, kSea, kMcr, R, auto, dgRun, dgPort].some(
      (x) => !isFinite(x) || x <= 0);
    if (bad) {
      $('out').innerHTML = '<div class="note warn">Все поля должны быть '
        + 'положительными числами.</div>';
      return;
    }
    // 1. Потребная мощность по адмиралтейскому коэффициенту
    const Nclean = Math.pow(D, 2 / 3) * Math.pow(v, 3) / C;
    const Nserv = Nclean * (1 + kSea);
    const Nmcr = Nserv / kMcr;
    // 2. Подбор двигателя из ряда
    let eng = ENGINES.find((e) => e.power >= Nmcr);
    const over = !eng;
    if (over) eng = ENGINES[ENGINES.length - 1];
    const margin = (eng.power - Nmcr) / Nmcr * 100;
    const load = Nserv / eng.power * 100;
    // 3. Топливо
    const geOp = eng.ge - 2;                 // на 85 % нагрузки расход ниже
    const tRun = R / v;                      // ходовое время, ч
    const tPort = Math.max(auto * 24 - tRun, 0);
    const Bgd = Nserv * geOp * tRun / 1e6;   // т тяжёлого топлива
    const Bdg = (dgRun * 205 * tRun + dgPort * 205 * tPort) / 1e6;
    const Bhfo = Bgd * 1.13;                 // штормовой 10 % + остаток 3 %
    const Bmgo = Bdg * 1.15;
    const Vhfo = Bhfo / (0.98 * 0.95);
    const Vmgo = Bmgo / (0.86 * 0.95);
    const dwt = 0.68 * D;
    const share = (Bhfo + Bmgo) / dwt * 100;

    let html = '<h3>Потребная мощность</h3>';
    html += row('\\(N_{\\text{ч}} = D^{2/3}v^{3}/C\\)',
      fmt(D) + '<sup>2/3</sup>·' + fmt(v, 1) + '³/' + fmt(C),
      fmt(Nclean) + ' кВт');
    html += row('\\(N_{\\text{э}} = N_{\\text{ч}}(1+k_{\\text{м}})\\)',
      fmt(Nclean) + '·' + (1 + kSea).toFixed(2).replace('.', ','),
      fmt(Nserv) + ' кВт');
    html += row('\\(N_{\\text{MCR}} = N_{\\text{э}}/k_{\\text{MCR}}\\)',
      fmt(Nserv) + '/' + kMcr.toFixed(2).replace('.', ','),
      fmt(Nmcr) + ' кВт');

    html += '<h3>Выбранный двигатель</h3>';
    if (over) {
      html += '<div class="note warn">Потребная мощность выходит за пределы '
        + 'учебного ряда: нужен двигатель мощнее ' + fmt(ENGINES[ENGINES.length - 1].power)
        + ' кВт либо два двигателя на две валолинии. Ниже показан крайний '
        + 'типоразмер ряда.</div>';
    }
    html += '<div class="calc-row"><b>' + eng.name + '</b> — '
      + fmt(eng.power) + ' кВт при ' + eng.rpm + ' об/мин, '
      + 'номинальный удельный расход ' + eng.ge + ' г/(кВт·ч)</div>';
    html += row('\\(\\delta = (N_{\\text{дв}} - N_{\\text{MCR}})/N_{\\text{MCR}}\\)',
      '(' + fmt(eng.power) + ' − ' + fmt(Nmcr) + ')/' + fmt(Nmcr),
      fmt(margin, 1) + ' %');
    html += row('\\(k_{\\text{з}} = N_{\\text{э}}/N_{\\text{дв}}\\)',
      fmt(Nserv) + '/' + fmt(eng.power), fmt(load, 1) + ' % МСR');
    const ok = !over && load >= 65 && load <= 90;
    html += '<div>' + (ok
      ? '<span class="badge ok">загрузка в рабочем диапазоне 65…90 % МСR</span>'
      : '<span class="badge bad">загрузка вне диапазона 65…90 % МСR — проверьте '
        + 'исходные данные или возьмите соседний типоразмер</span>') + '</div>';

    html += '<h3>Топливо на рейс</h3>';
    html += row('\\(t_{\\text{х}} = R/v\\)', fmt(R) + '/' + fmt(v, 1),
      fmt(tRun, 1) + ' ч = ' + fmt(tRun / 24, 1) + ' сут');
    html += row('\\(B_ч = N_{\\text{э}} g_e\\)',
      fmt(Nserv) + '·' + geOp, fmt(Nserv * geOp / 1e6, 3) + ' т/ч');
    html += row('\\(B_{\\text{гд}} = B_ч t_{\\text{х}}\\)',
      fmt(Nserv * geOp / 1e6, 3) + '·' + fmt(tRun, 1), fmt(Bgd, 1) + ' т');
    html += row('\\(B_{\\text{дг}}\\)',
      '(' + fmt(dgRun) + '·205·' + fmt(tRun, 1) + ' + ' + fmt(dgPort) + '·205·'
      + fmt(tPort, 1) + ')/10⁶', fmt(Bdg, 1) + ' т');
    html += row('\\(B_{\\text{тт}} = 1{,}13 B_{\\text{гд}}\\)',
      '1,13·' + fmt(Bgd, 1), fmt(Bhfo, 1) + ' т');
    html += row('\\(B_{\\text{дт}} = 1{,}15 B_{\\text{дг}}\\)',
      '1,15·' + fmt(Bdg, 1), fmt(Bmgo, 1) + ' т');
    html += row('\\(V_{\\text{тт}} = B_{\\text{тт}}/(\\rho k_{\\text{зап}})\\)',
      fmt(Bhfo, 1) + '/(0,98·0,95)', fmt(Vhfo) + ' м³');
    html += row('\\(V_{\\text{дт}} = B_{\\text{дт}}/(\\rho k_{\\text{зап}})\\)',
      fmt(Bmgo, 1) + '/(0,86·0,95)', fmt(Vmgo) + ' м³');
    html += row('\\(\\Sigma B/\\text{dwt}\\)',
      '(' + fmt(Bhfo, 1) + ' + ' + fmt(Bmgo, 1) + ')/' + fmt(dwt),
      fmt(share, 1) + ' %');
    html += '<p class="small">Дедвейт оценён как 0,68 от водоизмещения; '
      + 'штормовой запас 10 %, неснижаемый остаток 3 % (для дизельного '
      + 'топлива 15 % суммарно), коэффициент заполнения цистерн 0,95, '
      + 'удельный расход дизель-генераторов 205 г/(кВт·ч).</p>';
    $('out').innerHTML = html;
    draw(Nmcr, eng);
    if (window.renderMathInElement) {
      window.renderMathInElement($('out'), {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    }
  }

  const X = (p) => 60 + Math.min(p, PMAX) / PMAX * 540;

  function draw(Nmcr, eng) {
    let s = '';
    // ось
    s += '<line x1="60" y1="150" x2="600" y2="150" stroke="#16161a" stroke-width="1.6"/>';
    for (let p = 0; p <= PMAX; p += 2000) {
      s += '<line x1="' + X(p).toFixed(1) + '" y1="150" x2="' + X(p).toFixed(1)
        + '" y2="156" stroke="#16161a" stroke-width="1.2"/>';
      s += '<text x="' + X(p).toFixed(1) + '" y="172" text-anchor="middle" '
        + 'style="font:11px system-ui;fill:#6b6b74">' + (p / 1000) + '</text>';
    }
    s += '<text x="600" y="190" text-anchor="end" style="font:11px system-ui;'
      + 'fill:#16161a">мощность двигателя, МВт</text>';
    // ряд двигателей
    ENGINES.forEach((e) => {
      const sel = e === eng;
      s += '<circle cx="' + X(e.power).toFixed(1) + '" cy="150" r="' + (sel ? 7 : 4)
        + '" fill="' + (sel ? '#1a7f37' : '#155e75') + '" fill-opacity="'
        + (sel ? '1' : '.45') + '"/>';
    });
    // требуемая мощность
    const xr = X(Nmcr);
    s += '<line x1="' + xr.toFixed(1) + '" y1="60" x2="' + xr.toFixed(1)
      + '" y2="150" stroke="#b3382e" stroke-width="2" stroke-dasharray="5 4"/>';
    const anchor = xr > 420 ? 'end' : 'start';
    const dx = xr > 420 ? -8 : 8;
    s += '<text x="' + (xr + dx).toFixed(1) + '" y="56" text-anchor="' + anchor
      + '" style="font:11px system-ui;fill:#b3382e">требуется '
      + fmt(Nmcr) + ' кВт</text>';
    // выбранный двигатель
    const xe = X(eng.power);
    const ea = xe > 420 ? 'end' : 'start';
    const edx = xe > 420 ? -10 : 10;
    s += '<line x1="' + xe.toFixed(1) + '" y1="150" x2="' + xe.toFixed(1)
      + '" y2="112" stroke="#1a7f37" stroke-width="1.4"/>';
    s += '<text x="' + (xe + edx).toFixed(1) + '" y="108" text-anchor="' + ea
      + '" style="font:600 11px system-ui;fill:#1a7f37">' + eng.name + ' — '
      + fmt(eng.power) + ' кВт</text>';
    s += '<text x="' + (xe + edx).toFixed(1) + '" y="92" text-anchor="' + ea
      + '" style="font:11px system-ui;fill:#6b6b74">' + eng.rpm + ' об/мин</text>';
    s += '<text x="60" y="34" style="font:600 12px system-ui;fill:#16161a">'
      + 'Типоразмерный ряд и точка требования</text>';
    document.getElementById('rangeSvg').innerHTML = s;
  }

  function bind() {
    ['inD', 'inV', 'inC', 'inSea', 'inMcr', 'inR', 'inAuto', 'inDgRun', 'inDgPort']
      .forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener('input', compute);
      });
    const btn = $('btnReset');
    if (btn) {
      btn.addEventListener('click', () => {
        const def = {
          inD: 21200, inV: 16.5, inC: 600, inSea: 15, inMcr: 85,
          inR: 6000, inAuto: 20, inDgRun: 450, inDgPort: 300,
        };
        Object.keys(def).forEach((k) => { $(k).value = def[k]; });
        compute();
      });
    }
    compute();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
