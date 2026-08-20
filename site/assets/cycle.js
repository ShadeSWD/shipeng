/* Живой расчёт цикла Ренкина для страницы p-cycle.
 *
 * Файл — тонкий слой: он читает поля, зовёт SECALC.rankine и SECALC.carnot,
 * печатает результат и двигает столбики. Ни одной формулы термодинамики
 * здесь нет — они живут в assets/secalc.js.
 *
 * Таблицы водяного пара оставлены здесь как ДАННЫЕ: это справочные величины
 * (энтальпия, энтропия, теплота парообразования, температура насыщения),
 * измеренные, а не выведенные. Значения взяты в узлах сетки, поэтому
 * ползунки переключают параметры дискретно — без интерполяции.
 */
'use strict';
(function () {
  var S = (typeof SECALC !== 'undefined') ? SECALC
        : (typeof window !== 'undefined' ? window.SECALC : null);

  var P0 = [3, 4, 6, 8, 10];                 // МПа
  var T0 = [400, 450, 500, 540];             // °C
  /* h1, кДж/кг — по строкам давления, по столбцам температуры */
  var H1 = [
    [3231.7, 3344.6, 3457.2, 3547.0],
    [3214.5, 3331.2, 3445.3, 3536.0],
    [3177.2, 3301.8, 3422.2, 3517.0],
    [3139.4, 3272.0, 3399.5, 3498.0],
    [3096.5, 3240.9, 3373.7, 3478.0]];
  /* s1, кДж/(кг·К) */
  var S1 = [
    [6.921, 7.083, 7.234, 7.345],
    [6.771, 6.937, 7.090, 7.203],
    [6.541, 6.720, 6.880, 6.996],
    [6.364, 6.556, 6.727, 6.848],
    [6.212, 6.419, 6.597, 6.723]];
  /* конденсатор: давление, кПа */
  var PK = [3, 4, 5, 6, 8, 10, 15, 20];
  var TK = [24.08, 28.96, 32.88, 36.16, 41.51, 45.81, 53.97, 60.06];
  var HF = [101.0, 121.4, 137.8, 151.5, 173.9, 191.8, 225.9, 251.4];
  var SF = [0.3543, 0.4224, 0.4762, 0.5209, 0.5926, 0.6493, 0.7549, 0.8320];
  var SG = [8.576, 8.473, 8.394, 8.329, 8.227, 8.149, 8.007, 7.907];
  var R = [2444.5, 2432.9, 2423.7, 2415.9, 2403.1, 2392.8, 2373.1, 2358.3];

  /* КПД элементов установки — учебные, те же, что в разборе на странице. */
  var ETA = { boiler: 0.88, pipe: 0.98, mech: 0.98, gear: 0.975 };
  var NE_DEFAULT = 10000;                    // кВт, отвлечённый пример

  var $ = function (id) { return document.getElementById(id); };
  if (!$('rkP0') || !S) return;

  function fmt(x, d) {
    return Number(x).toLocaleString('ru-RU', {
      minimumFractionDigits: d === undefined ? 0 : d,
      maximumFractionDigits: d === undefined ? 0 : d });
  }
  function row(f, sub, res) {
    return '<div class="calc-row"><span class="f">' + f + '</span> = '
      + '<span style="color:#6b6b74">' + sub + '</span> = <b>' + res + '</b></div>';
  }

  function bar(rectId, valId, eta) {
    var top = 170 - eta * 200;
    if (top < 36) top = 36;
    $(rectId).setAttribute('y', top.toFixed(1));
    $(rectId).setAttribute('height', (170 - top).toFixed(1));
    $(valId).setAttribute('y', (top - 6).toFixed(1));
    $(valId).textContent = fmt(eta, 3);
  }

  function compute() {
    var i = +$('rkP0').value, j = +$('rkT0').value, k = +$('rkPk').value;
    var oi = parseFloat($('rkOi').value);
    var Ne = parseFloat(String($('rkNe').value).replace(',', '.'));
    if (!isFinite(Ne) || Ne <= 0) Ne = NE_DEFAULT;
    var p0 = P0[i], t0 = T0[j], pk = PK[k];
    $('rkP0Out').textContent = fmt(p0) + ' МПа';
    $('rkT0Out').textContent = fmt(t0) + ' °C';
    $('rkPkOut').textContent = fmt(pk) + ' кПа';
    $('rkOiOut').textContent = fmt(oi, 2);

    var h1 = H1[i][j], s1 = S1[i][j];
    var tk = TK[k], hf = HF[k], sf = SF[k], sg = SG[k], r = R[k];

    var c = S.rankine({ h1: h1, s1: s1, hf: hf, sf: sf, sg: sg, r: r,
      etaOi: oi, etaBoiler: ETA.boiler, etaPipe: ETA.pipe,
      etaMech: ETA.mech, etaGear: ETA.gear });
    var etaK = S.carnot(t0 + 273.15, tk + 273.15);
    var Bh = S.fuelRate(Ne, c.ge);             // т/ч
    var wet = c.x <= 1;
    var x = wet ? c.x : 1;

    bar('rkBarK', 'rkValK', etaK);
    bar('rkBarT', 'rkValT', c.etaT);
    bar('rkBarE', 'rkValE', c.etaE);

    var out = '';
    out += row('\\(x = \\dfrac{s_1 - s\'}{s\'\' - s\'}\\)',
      '(' + fmt(s1, 3) + ' − ' + fmt(sf, 4) + ')/(' + fmt(sg, 3) + ' − ' + fmt(sf, 4) + ')',
      fmt(x, 4));
    out += row('\\(h_2 = h\' + x\\,r\\)',
      fmt(hf, 1) + ' + ' + fmt(x, 4) + '·' + fmt(r, 1), fmt(c.h2, 1) + ' кДж/кг');
    out += row('\\(H_0 = h_1 - h_2\\)',
      fmt(h1, 1) + ' − ' + fmt(c.h2, 1), fmt(c.H0, 1) + ' кДж/кг');
    out += row('\\(q_1 = h_1 - h\'\\)',
      fmt(h1, 1) + ' − ' + fmt(hf, 1), fmt(c.q1, 1) + ' кДж/кг');
    out += row('\\(\\eta_t = H_0/q_1\\)',
      fmt(c.H0, 1) + '/' + fmt(c.q1, 1), fmt(c.etaT, 4));
    out += row('\\(\\eta_e = \\eta_t\\eta_{oi}\\eta_{\\text{к}}\\eta_{\\text{тр}}\\eta_{\\text{м}}\\eta_{\\text{зп}}\\)',
      fmt(c.etaT, 4) + '·' + fmt(oi, 2) + '·0,88·0,98·0,98·0,975', fmt(c.etaE, 4));
    out += row('\\(g_e = 3{,}6\\cdot10^{6}/(\\eta_e Q_н)\\)',
      '3,6·10⁶/(' + fmt(c.etaE, 4) + '·42 700)', fmt(c.ge, 0) + ' г/(кВт·ч)');
    out += row('\\(B = N_e g_e\\)',
      fmt(Ne) + '·' + fmt(c.ge, 0) + '/10⁶',
      fmt(Bh, 2) + ' т/ч = ' + fmt(Bh * 24, 1) + ' т/сут');
    out += row('\\(\\eta_К = 1 - T_к/T_0\\)',
      '1 − ' + fmt(tk + 273.15, 2) + '/' + fmt(t0 + 273.15, 2), fmt(etaK, 4));

    var note = 'Цикл берёт <b>' + fmt(c.etaT / etaK * 100, 0) + ' %</b> от своего '
      + 'предела Карно; до выходного фланца доходит ' + fmt(c.etaE * 100, 1)
      + ' % теплоты топлива.';
    if (!wet) {
      note += ' При таких параметрах пар за турбиной остаётся перегретым — '
        + 'правило отрезков к этому случаю неприменимо, цифры даны условно.';
    } else if (c.x < 0.86) {
      note += ' Сухость ' + fmt(c.x, 4) + ' ниже допустимой: в последних '
        + 'ступенях начнётся эрозия лопаток, нужен промежуточный перегрев или '
        + 'влагоудаление.';
    } else {
      note += ' Сухость ' + fmt(c.x, 4) + ' приемлема для проточной части.';
    }
    out += '<div class="note">' + note + '</div>';
    $('rkOut').innerHTML = out;
    if (window.renderMathInElement) {
      window.renderMathInElement($('rkOut'), {
        delimiters: [{ left: '$$', right: '$$', display: true },
                     { left: '\\(', right: '\\)', display: false }],
        throwOnError: false,
      });
    }
  }

  ['rkP0', 'rkT0', 'rkPk', 'rkOi', 'rkNe'].forEach(function (id) {
    $(id).addEventListener('input', compute);
  });
  $('rkReset').addEventListener('click', function () {
    $('rkP0').value = 2; $('rkT0').value = 2; $('rkPk').value = 2;
    $('rkOi').value = 0.82; $('rkNe').value = NE_DEFAULT;
    compute();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();
