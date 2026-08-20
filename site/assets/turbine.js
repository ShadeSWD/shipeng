/* Живой расчёт газотурбинного цикла (цикл Брайтона) для страницы t-turbine.
 *
 * Файл — тонкий слой: читает поля, зовёт SECALC.brayton и печатает результат.
 * Ни одной формулы термодинамики здесь нет — модель цикла (воздушная, с
 * изоэнтропными КПД компрессора и турбины) живёт в assets/secalc.js.
 */
'use strict';
(function () {
  var S = (typeof SECALC !== 'undefined') ? SECALC
        : (typeof window !== 'undefined' ? window.SECALC : null);

  var K = 1.4;                 // показатель адиабаты (воздушная модель)
  var CP = 1.005;              // кДж/(кг·К)
  var ETA_MECH = 0.98;         // механический КПД (учебн.)
  var ETA_GEAR = 0.975;        // КПД зубчатой передачи (учебн.)

  var $ = function (id) { return document.getElementById(id); };
  if (!$('gtPi') || !S) return;

  var DEF = { gtPi: 18, gtT3: 1200, gtEk: 0.86, gtEt: 0.89, gtT1: 15 };

  function fmt(x, d) {
    return Number(x).toLocaleString('ru-RU', {
      minimumFractionDigits: d === undefined ? 0 : d,
      maximumFractionDigits: d === undefined ? 0 : d });
  }
  function row(f, sub, res) {
    return '<div class="calc-row"><span class="f">' + f + '</span> = '
      + '<span style="color:#6b6b74">' + sub + '</span> = <b>' + res + '</b></div>';
  }
  function num(id) { return parseFloat($(id).value); }

  /* Один вызов модуля: все температуры, работы и КПД цикла. */
  function cycle(pi, t1, t3, ek, et) {
    return S.brayton({ pi: pi, t1: t1, t3: t3, k: K, cp: CP,
      etaComp: ek, etaTurb: et });
  }

  function px(pi) { return 70 + pi * 13.5; }
  function py(eta) { return 200 - eta * 275; }

  function compute() {
    var pi = num('gtPi'), t3 = num('gtT3'), ek = num('gtEk'),
        et = num('gtEt'), t1 = num('gtT1');
    $('gtPiOut').textContent = fmt(pi);
    $('gtT3Out').textContent = fmt(t3);
    $('gtEkOut').textContent = fmt(ek, 2);
    $('gtEtOut').textContent = fmt(et, 2);
    $('gtT1Out').textContent = fmt(t1);

    var c = cycle(pi, t1, t3, ek, et);
    var pr = c.T2s / c.T1;           // отношение температур в изоэнтропе

    /* кривая КПД по π и её максимум */
    var pts = [], best = { pi: 0, eta: -1 };
    for (var p = 4; p <= 40; p += 0.5) {
      var e = cycle(p, t1, t3, ek, et).etaT;
      if (!isFinite(e) || e < 0) e = 0;
      pts.push(px(p).toFixed(1) + ',' + py(e).toFixed(1));
      if (e > best.eta) { best.eta = e; best.pi = p; }
    }
    $('gtCurve').setAttribute('points', pts.join(' '));
    var dotY = py(Math.max(c.etaT, 0));
    $('gtDot').setAttribute('cx', px(pi).toFixed(1));
    $('gtDot').setAttribute('cy', dotY.toFixed(1));
    var lab = $('gtDotLabel');
    var right = pi <= 26;
    lab.setAttribute('x', (px(pi) + (right ? 9 : -9)).toFixed(1));
    lab.setAttribute('y', (dotY - 8).toFixed(1));
    lab.setAttribute('text-anchor', right ? 'start' : 'end');
    lab.textContent = 'π = ' + fmt(pi) + ', ηᵢ = ' + fmt(Math.max(c.etaT, 0), 3);

    var out = '';
    if (c.q <= 0 || c.etaT <= 0) {
      out = '<div class="note warn">При таком сочетании температура за '
        + 'компрессором достигла температуры газа перед турбиной: подводить '
        + 'теплоту негде, цикл не работает. Уменьшите π или поднимите t₃.</div>';
      $('gtOut').innerHTML = out;
      return;
    }
    var etaE = c.etaT * ETA_MECH * ETA_GEAR;
    var ge = S.sfocFromEfficiency(etaE, S.FUEL.Qn);
    out += row('\\(\\pi^{(k-1)/k}\\)', fmt(pi) + '^0,2857', fmt(pr, 3));
    out += row('\\(T_2 = T_1 + \\dfrac{T_{2\\text{ид}} - T_1}{\\eta_{\\text{к}}}\\)',
      fmt(c.T1, 1) + ' + (' + fmt(c.T2s, 1) + ' − ' + fmt(c.T1, 1) + ')/' + fmt(ek, 2),
      fmt(c.T2, 0) + ' К = ' + fmt(c.T2 - 273.15, 0) + ' °C');
    out += row('\\(T_4 = T_3 - \\eta_{\\text{т}}(T_3 - T_{4\\text{ид}})\\)',
      fmt(c.T3, 1) + ' − ' + fmt(et, 2) + '·(' + fmt(c.T3, 1) + ' − ' + fmt(c.T4s, 1) + ')',
      fmt(c.T4, 0) + ' К = ' + fmt(c.T4 - 273.15, 0) + ' °C');
    out += row('\\(l_{\\text{т}} = c_p (T_3 - T_4)\\)',
      '1,005·(' + fmt(c.T3, 0) + ' − ' + fmt(c.T4, 0) + ')', fmt(c.lTurb, 0) + ' кДж/кг');
    out += row('\\(l_{\\text{к}} = c_p (T_2 - T_1)\\)',
      '1,005·(' + fmt(c.T2, 0) + ' − ' + fmt(c.T1, 0) + ')', fmt(c.lComp, 0) + ' кДж/кг');
    out += row('\\(l = l_{\\text{т}} - l_{\\text{к}}\\)',
      fmt(c.lTurb, 0) + ' − ' + fmt(c.lComp, 0), fmt(c.l, 0) + ' кДж/кг');
    out += row('\\(q_1 = c_p (T_3 - T_2)\\)',
      '1,005·(' + fmt(c.T3, 0) + ' − ' + fmt(c.T2, 0) + ')', fmt(c.q, 0) + ' кДж/кг');
    out += row('\\(\\eta_i = l/q_1\\)',
      fmt(c.l, 0) + '/' + fmt(c.q, 0), fmt(c.etaT, 3));
    out += row('\\(g_e = \\dfrac{3{,}6\\cdot10^{6}}{\\eta_i \\eta_{\\text{м}} \\eta_{\\text{зп}} Q_н}\\)',
      '3,6·10⁶/(' + fmt(c.etaT, 3) + '·0,98·0,975·42 700)', fmt(ge, 0) + ' г/(кВт·ч)');

    out += '<div class="note">Идеальный цикл при той же \\(\\pi\\) дал бы '
      + '\\(\\eta_t = ' + fmt(c.etaIdeal, 3) + '\\); потери в компрессоре и турбине '
      + 'снижают КПД до ' + fmt(c.etaT, 3) + '. На привод компрессора уходит <b>'
      + fmt(c.work * 100, 0) + ' %</b> мощности турбины. Максимум КПД при заданных '
      + 't₃ и КПД агрегатов достигается при <b>π ≈ ' + fmt(best.pi, 0)
      + '</b> и равен ' + fmt(best.eta, 3) + '.</div>';
    if (c.T4 - 273.15 > 380) {
      out += '<div class="note tip">Температура газов за турбиной '
        + fmt(c.T4 - 273.15, 0) + ' °C: такой выхлоп имеет смысл направить в '
        + 'котёл-утилизатор — это путь к комбинированной установке.</div>';
    }
    $('gtOut').innerHTML = out;
    if (window.renderMathInElement) {
      window.renderMathInElement($('gtOut'), {
        delimiters: [{ left: '\\(', right: '\\)', display: false },
                     { left: '$$', right: '$$', display: true }],
      });
    }
  }

  ['gtPi', 'gtT3', 'gtEk', 'gtEt', 'gtT1'].forEach(function (id) {
    $(id).addEventListener('input', compute);
  });
  $('gtReset').addEventListener('click', function () {
    Object.keys(DEF).forEach(function (id) { $(id).value = DEF[id]; });
    compute();
  });
  /* Первый расчёт выполняется до загрузки KaTeX: формулы стартового вывода
     разберёт общий проход mathfmt.js по документу, последующие — вызов выше. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();
