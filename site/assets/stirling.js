/* Двигатель Стирлинга (страница t-stirling): два независимых блока.

   1. Живой расчёт цикла: предел Карно, термический КПД с регенератором и без
      него, масса заправки, работа за цикл, мощность, КПД установки и удельный
      расход в сравнении с дизелем. Все формулы продублированы в тексте главы.
   2. Анимация бета-двигателя по анализу Шмидта: синусоидальная кинематика
      вытеснителя и рабочего поршня со сдвигом 90°, изотермические полости,
      мёртвые объёмы; справа — петля Шмидта и идеальный цикл Стирлинга. */
'use strict';

/* ===================================================================
   1. ЖИВОЙ РАСЧЁТ
   =================================================================== */
(function () {
  var QN = 42700;          // низшая теплота сгорания топлива, кДж/кг
  var ETA_REL = 0.65;      // относительный КПД (мёртвые объёмы, гидравлика)
  var ETA_MECH = 0.88;     // механический КПД
  var ETA_HEAT = 0.88;     // КПД горелки и нагревателя
  var ETA_DIES = 0.45;     // эффективный КПД дизеля для сравнения
  var HOURS = 100;         // база сравнения по топливу, ч

  var GAS = {
    he:  { n: 'гелий',   R: 2077, k: 1.667 },
    h2:  { n: 'водород', R: 4124, k: 1.405 },
    air: { n: 'воздух',  R: 287,  k: 1.4 }
  };

  var $ = function (id) { return document.getElementById(id); };
  if (!$('stTg')) return;

  var DEF = { stTg: 750, stTx: 60, stEps: 2.0, stPmax: 15, stEreg: 0.95,
              stVh: 275, stRpm: 1200, stZ: 4 };

  function fmt(x, d) {
    if (!isFinite(x)) return '—';
    var v = Number(x).toFixed(d === undefined ? 0 : d).split('.');
    v[0] = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return v.join(',');
  }
  function row(f, sub, res) {
    return '<div class="calc-row"><span class="f">' + f + '</span> = '
      + '<span style="color:#6b6b74">' + sub + '</span> = <b>' + res + '</b></div>';
  }
  function num(id) { return parseFloat($(id).value); }

  /* Термический КПД цикла Стирлинга при заданном КПД регенератора. */
  function etaT(R, cv, Tg, Tx, eps, ereg) {
    var le = Math.log(eps);
    var den = R * Tg * le + (1 - ereg) * cv * (Tg - Tx);
    if (!(den > 0)) return 0;
    return R * (Tg - Tx) * le / den;
  }

  function compute() {
    var tg = num('stTg'), tx = num('stTx'), eps = num('stEps'),
        pmax = num('stPmax'), ereg = num('stEreg'),
        vh = num('stVh'), rpm = num('stRpm'), z = num('stZ');
    var g = GAS[$('stGas').value] || GAS.he;

    $('stTgOut').textContent = fmt(tg);
    $('stTxOut').textContent = fmt(tx);
    $('stEpsOut').textContent = fmt(eps, 1);
    $('stPmaxOut').textContent = fmt(pmax);
    $('stEregOut').textContent = fmt(ereg, 2);
    $('stVhOut').textContent = fmt(vh);
    $('stRpmOut').textContent = fmt(rpm);
    $('stZOut').textContent = fmt(z);

    var Tg = tg + 273.15, Tx = tx + 273.15;
    if (Tx >= Tg) {
      $('stOut').innerHTML = '<div class="note warn">Холодильник горячее '
        + 'нагревателя — цикл не работает: теплоте некуда течь, и работа за '
        + 'цикл обращается в нуль или становится отрицательной. Поднимите '
        + 't<sub>г</sub> или опустите t<sub>х</sub>.</div>';
      return;
    }

    var R = g.R, cv = R / (g.k - 1), le = Math.log(eps);
    var Vmin = vh / (eps - 1), Vmax = eps * Vmin;      // см³
    var eCar = 1 - Tx / Tg;
    var et = etaT(R, cv, Tg, Tx, eps, ereg);
    var et0 = etaT(R, cv, Tg, Tx, eps, 0);
    var m = pmax * 1e6 * Vmin * 1e-6 / (R * Tg);       // кг
    var L = m * R * (Tg - Tx) * le;                    // Дж за цикл на цилиндр
    var n = rpm / 60;                                  // с⁻¹
    var Ni = L * n * z;                                // Вт
    var Ne = Ni * ETA_REL * ETA_MECH;                  // Вт
    var eu = et * ETA_REL * ETA_MECH * ETA_HEAT;
    var ge = eu > 0 ? 3600 / (eu * QN) * 1000 : Infinity;
    var gd = 3600 / (ETA_DIES * QN) * 1000;
    var B1 = ge * (Ne / 1000) * HOURS / 1e6;           // т за 100 ч
    var B2 = gd * (Ne / 1000) * HOURS / 1e6;

    var out = '';
    out += row('\\(V_{\\min} = V_h/(\\varepsilon - 1)\\)',
      fmt(vh) + '/(' + fmt(eps, 1) + ' − 1)', fmt(Vmin, 0) + ' см³');
    out += row('\\(V_{\\max} = \\varepsilon V_{\\min}\\)',
      fmt(eps, 1) + '·' + fmt(Vmin, 0), fmt(Vmax, 0) + ' см³');
    out += row('\\(\\eta_{\\text{Карно}} = 1 - T_х/T_г\\)',
      '1 − ' + fmt(Tx, 0) + '/' + fmt(Tg, 0), fmt(eCar, 3));
    out += row('\\(c_v = R/(k-1)\\)',
      fmt(R) + '/(' + fmt(g.k, 3) + ' − 1)', fmt(cv, 0) + ' Дж/(кг·К)');
    out += row('\\(\\eta_t = \\dfrac{R(T_г - T_х)\\ln\\varepsilon}'
      + '{R T_г \\ln\\varepsilon + (1-\\eta_{\\text{рег}})c_v (T_г - T_х)}\\)',
      fmt(R) + '·' + fmt(Tg - Tx, 0) + '·' + fmt(le, 3) + ' / ('
      + fmt(R) + '·' + fmt(Tg, 0) + '·' + fmt(le, 3) + ' + '
      + fmt(1 - ereg, 2) + '·' + fmt(cv, 0) + '·' + fmt(Tg - Tx, 0) + ')',
      fmt(et, 3));
    out += row('\\(\\eta_t\\) при \\(\\eta_{\\text{рег}} = 0\\)',
      'без регенератора, ' + g.n, fmt(et0, 3));
    out += row('\\(m = \\dfrac{p_{\\max} V_{\\min}}{R T_г}\\)',
      fmt(pmax) + '·10⁶ · ' + fmt(Vmin, 0) + '·10⁻⁶ / (' + fmt(R) + '·'
      + fmt(Tg, 0) + ')', fmt(m * 1000, 2) + ' г');
    out += row('\\(L = m R (T_г - T_х)\\ln\\varepsilon\\)',
      fmt(m * 1000, 2) + '·10⁻³ · ' + fmt(R) + ' · ' + fmt(Tg - Tx, 0)
      + ' · ' + fmt(le, 3), fmt(L, 0) + ' Дж/цикл');
    out += row('\\(N_i = L n z\\)',
      fmt(L, 0) + ' · ' + fmt(n, 1) + ' · ' + fmt(z), fmt(Ni / 1000, 1) + ' кВт');
    out += row('\\(N_e = N_i \\eta_{\\text{отн}} \\eta_{\\text{м}}\\)',
      fmt(Ni / 1000, 1) + ' · 0,65 · 0,88', fmt(Ne / 1000, 1) + ' кВт');
    out += row('\\(\\eta_{\\text{уст}} = \\eta_t \\eta_{\\text{отн}} '
      + '\\eta_{\\text{м}} \\eta_{\\text{нагр}}\\)',
      fmt(et, 3) + ' · 0,65 · 0,88 · 0,88', fmt(eu, 3));
    out += row('\\(g_e = \\dfrac{3600}{\\eta_{\\text{уст}} Q_н}\\cdot 1000\\)',
      '3600/(' + fmt(eu, 3) + '·42 700)·1000', fmt(ge, 0) + ' г/(кВт·ч)');
    out += row('\\(g_e/g_e^{\\text{диз}}\\)',
      fmt(ge, 0) + '/' + fmt(gd, 0) + ' (дизель при \\(\\eta_e = 0{,}45\\))',
      fmt(ge / gd, 2) + ' раза');

    var share = eCar > 0 ? et / eCar * 100 : 0;
    var gain = et0 > 0 ? et / et0 : 0;
    out += '<div class="note">Цикл берёт <b>' + fmt(share, 0) + ' %</b> от '
      + 'предела Карно (' + fmt(eCar, 3) + '): остаток съедает недовозврат '
      + 'теплоты в регенераторе. Без регенератора термический КПД был бы '
      + 'всего ' + fmt(et0, 3) + ', то есть регенератор поднимает его в <b>'
      + fmt(gain, 2) + ' раза</b>. Рабочее тело — ' + g.n + ', \\(R = '
      + fmt(R) + '\\) Дж/(кг·К), \\(c_v/R = 1/(k-1) = ' + fmt(1 / (g.k - 1), 2)
      + '\\): чем эта величина меньше, тем слабее двигатель реагирует на '
      + 'ухудшение регенерации.</div>';
    out += '<div class="note tip">За 100 ч работы на посчитанной мощности '
      + fmt(Ne / 1000, 1) + ' кВт двигатель Стирлинга сожжёт <b>'
      + fmt(B1, 2) + ' т</b> топлива, дизель той же мощности — '
      + fmt(B2, 2) + ' т; разница <b>' + fmt(B1 - B2, 2) + ' т</b>. Для '
      + 'транспортного судна это приговор, для подводной лодки — приемлемая '
      + 'плата за возможность идти под водой без доступа воздуха.</div>';

    $('stOut').innerHTML = out;
    if (window.renderMathInElement) {
      window.renderMathInElement($('stOut'), {
        delimiters: [{ left: '\\(', right: '\\)', display: false },
                     { left: '$$', right: '$$', display: true }],
      });
    }
  }

  ['stTg', 'stTx', 'stEps', 'stPmax', 'stEreg', 'stVh', 'stRpm', 'stZ']
    .forEach(function (id) { $(id).addEventListener('input', compute); });
  $('stGas').addEventListener('change', compute);
  $('stReset').addEventListener('click', function () {
    Object.keys(DEF).forEach(function (id) { $(id).value = DEF[id]; });
    $('stGas').value = 'he';
    compute();
  });
  /* Первый расчёт идёт до загрузки KaTeX: стартовые формулы разберёт общий
     проход mathfmt.js по документу, последующие — вызов выше. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();

/* ===================================================================
   2. АНИМАЦИЯ БЕТА-ДВИГАТЕЛЯ (анализ Шмидта)
   =================================================================== */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('stLoop')) return;

  /* --- термодинамика --- */
  var VD = 1.0, VP = 1.0;                 // рабочие объёмы вытеснителя и поршня
  var DH = 0.25 * VD, DR = 0.30 * VD, DC = 0.25 * VD;   // мёртвые объёмы
  var TG = 1023.15, TX = 333.15;
  var TR = (TG - TX) / Math.log(TG / TX); // логарифмическое среднее, ≈615 К
  var MR = 1.0;                           // mR = 1: давление в условных единицах

  function state(th) {
    var c = Math.cos(th), s = Math.sin(th);
    var Vh = VD / 2 * (1 + c) + DH;
    var Vc = VD / 2 * (1 - c) + VP / 2 * (1 + s) + DC;
    var p = MR / (Vh / TG + DR / TR + Vc / TX);
    return { Vh: Vh, Vc: Vc, V: Vh + DR + Vc, p: p };
  }

  /* --- геометрия картинки --- */
  var Y_TOP = 48, H_MIN = 8, S_D = 23, HD = 70;   // цилиндр и вытеснитель
  var Y_P0 = 166, S_P = 23, HP = 22;              // рабочий поршень
  var Y_REG = 143;                                // середина регенератора
  var X0 = 330, X1 = 612, YB = 272, YT = 76;      // поле диаграммы p–V

  /* границы диаграммы: реальная петля и идеальный цикл при том же p_max */
  var N = 360, pts = [], i, st;
  for (i = 0; i <= N; i++) pts.push(state(2 * Math.PI * i / N));
  var Vlo = Infinity, Vhi = -Infinity, pLo = Infinity, pHi = -Infinity;
  for (i = 0; i <= N; i++) {
    if (pts[i].V < Vlo) Vlo = pts[i].V;
    if (pts[i].V > Vhi) Vhi = pts[i].V;
    if (pts[i].p < pLo) pLo = pts[i].p;
    if (pts[i].p > pHi) pHi = pts[i].p;
  }
  var Vmn = Vlo, Vmx = Vhi, pIdMax = pHi;
  var pIdColdMin = pIdMax * Vmn / Vmx * (TX / TG);
  var PLO = pIdColdMin * 0.92, PHI = pIdMax * 1.04;
  var VLO = Vmn - 0.06 * (Vmx - Vmn), VHI = Vmx + 0.06 * (Vmx - Vmn);

  function xV(v) { return X0 + (v - VLO) / (VHI - VLO) * (X1 - X0); }
  function yP(p) { return YB - (p - PLO) / (PHI - PLO) * (YB - YT); }

  /* петля Шмидта */
  var loop = [];
  for (i = 0; i <= N; i++) loop.push(xV(pts[i].V).toFixed(1) + ',' + yP(pts[i].p).toFixed(1));
  $('stLoop').setAttribute('points', loop.join(' '));

  /* идеальный цикл Стирлинга при том же максимальном давлении:
     p = p_max·V_min/V на горячей изотерме и в (T_х/T_г) раз ниже на холодной */
  var ideal = [], v, K = 24;
  for (i = 0; i <= K; i++) {                       // горячая изотерма V_min→V_max
    v = Vmn + (Vmx - Vmn) * i / K;
    ideal.push(xV(v).toFixed(1) + ',' + yP(pIdMax * Vmn / v).toFixed(1));
  }
  for (i = 0; i <= K; i++) {                       // холодная изотерма V_max→V_min
    v = Vmx - (Vmx - Vmn) * i / K;
    ideal.push(xV(v).toFixed(1) + ',' + yP(pIdMax * Vmn / v * (TX / TG)).toFixed(1));
  }
  ideal.push(ideal[0]);
  $('stIdeal').setAttribute('points', ideal.join(' '));

  /* подписи объёмов под осью */
  $('stTickMin').setAttribute('x1', xV(Vmn).toFixed(1));
  $('stTickMin').setAttribute('x2', xV(Vmn).toFixed(1));
  $('stTickMinLab').setAttribute('x', xV(Vmn).toFixed(1));
  $('stTickMax').setAttribute('x1', xV(Vmx).toFixed(1));
  $('stTickMax').setAttribute('x2', xV(Vmx).toFixed(1));
  $('stTickMaxLab').setAttribute('x', xV(Vmx).toFixed(1));

  /* --- фазы цикла --- */
  function phase(deg) {
    if (deg >= 315 || deg < 45)
      return ['расширение при T<sub>г</sub> — рабочий ход',
        'вытеснитель внизу, почти весь газ у нагревателя; рабочий поршень идёт '
        + 'вниз, объём растёт, теплота подводится через стенку нагревателя'];
    if (deg < 135)
      return ['газ вытесняется в холодную полость, регенератор забирает теплоту (V ≈ const)',
        'полный объём проходит максимум и меняется мало; вытеснитель идёт '
        + 'вверх и гонит газ вниз через насадку, оставляя в ней теплоту'];
    if (deg < 225)
      return ['сжатие при T<sub>х</sub> — теплота уходит в холодильник',
        'вытеснитель вверху, газ в холодной полости; рабочий поршень идёт '
        + 'вверх, работа сжатия отводится забортной водой'];
    return ['газ вытесняется в горячую полость, регенератор возвращает теплоту (V ≈ const)',
      'полный объём около минимума; вытеснитель идёт вниз и гонит газ вверх '
      + 'через насадку, забирая накопленную в ней теплоту'];
  }

  /* --- отрисовка --- */
  function set(id, a, v) { $(id).setAttribute(a, v); }
  function rect(id, y, h) {
    set(id, 'y', y.toFixed(1));
    set(id, 'height', Math.max(0, h).toFixed(1));
  }

  function draw(deg) {
    var th = deg * Math.PI / 180;
    var c = Math.cos(th), s = Math.sin(th);
    var hHot = H_MIN + S_D * (1 + c);
    var yd = Y_TOP + hHot;                 // верх вытеснителя
    var ydb = yd + HD;                     // низ вытеснителя
    var yp = Y_P0 + S_P * (1 + s);         // верх рабочего поршня

    rect('stHot', Y_TOP, yd - Y_TOP);
    rect('stCold', ydb, yp - ydb);
    var yMid = Math.min(Math.max(Y_REG, yd), ydb);
    rect('stGapHotL', yd, yMid - yd);
    rect('stGapHotR', yd, yMid - yd);
    rect('stGapColdL', yMid, ydb - yMid);
    rect('stGapColdR', yMid, ydb - yMid);

    set('stDisp', 'y', yd.toFixed(1));
    set('stDispLab', 'y', (yd + HD / 2 + 3.5).toFixed(1));
    set('stPist', 'y', yp.toFixed(1));
    set('stPistLab', 'y', (yp + HP / 2 + 3.5).toFixed(1));
    set('stRodD', 'y1', ydb.toFixed(1));
    set('stRodP1', 'y1', (yp + HP).toFixed(1));
    set('stRodP2', 'y1', (yp + HP).toFixed(1));

    /* кривошипы: вытеснитель по cos θ, поршень отстаёт на 90° */
    set('stPinD', 'cx', (118 + 13 * s).toFixed(1));
    set('stPinD', 'cy', (300 + 13 * c).toFixed(1));
    set('stPinP', 'cx', (118 - 13 * c).toFixed(1));
    set('stPinP', 'cy', (300 + 13 * s).toFixed(1));

    /* стрелка перетекания: вниз при 45°…135°, вверх при 225°…315° */
    var down = deg >= 45 && deg < 135, up = deg >= 225 && deg < 315;
    set('stFlowDown', 'opacity', down ? '0.85' : '0');
    set('stFlowUp', 'opacity', up ? '0.85' : '0');

    st = state(th);
    set('stDot', 'cx', xV(st.V).toFixed(1));
    set('stDot', 'cy', yP(st.p).toFixed(1));

    var ph = phase(deg);
    var hot = st.Vh / st.V * 100;
    $('stPhase').innerHTML =
      '<div class="calc-row"><b>θ = ' + deg.toFixed(0) + '°</b> — ' + ph[0] + '</div>'
      + '<div class="calc-row" style="color:#6b6b74">' + ph[1] + '</div>'
      + '<div class="calc-row" style="color:#6b6b74">доля газа в горячей полости '
      + hot.toFixed(0) + ' %, полный объём '
      + ((st.V - Vmn) / (Vmx - Vmn) * 100).toFixed(0)
      + ' % хода, давление ' + (st.p / pHi * 100).toFixed(0) + ' % от максимума</div>';
  }

  /* --- управление --- */
  var theta = 0, playing = true, last = 0;
  var speed = function () { return parseFloat($('stSpeed').value) || 1; };

  function setAngle(deg) {
    theta = ((deg % 360) + 360) % 360;
    $('stAngle').value = theta.toFixed(0);
    $('stAngleOut').textContent = theta.toFixed(0) + '°';
    draw(theta);
  }

  function frame(ts) {
    if (!last) last = ts;
    var dt = Math.min(ts - last, 100);
    last = ts;
    if (playing) setAngle(theta + dt / 1000 * 45 * speed());
    requestAnimationFrame(frame);
  }

  $('stPlay').addEventListener('click', function () { playing = true; last = 0; });
  $('stPauseBtn').addEventListener('click', function () { playing = false; });
  $('stSpeed').addEventListener('input', function () {
    $('stSpeedOut').textContent = speed().toFixed(1).replace('.', ',') + '×';
  });
  $('stAngle').addEventListener('input', function () {
    playing = false;
    setAngle(parseFloat($('stAngle').value));
  });

  setAngle(0);
  requestAnimationFrame(frame);
})();
