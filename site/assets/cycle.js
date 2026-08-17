/* Живой расчёт цикла Ренкина для страницы p-cycle.
   Значения энтальпии и энтропии взяты из таблиц водяного пара в узлах сетки,
   поэтому ползунки переключают параметры дискретно — без интерполяции.
   Все формулы продублированы в тексте страницы. */
'use strict';
(function () {
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

  var QN = 42700;          // кДж/кг
  var ETA_BOILER = 0.88;
  var ETA_PIPE = 0.98;
  var ETA_MECH = 0.98;
  var ETA_GEAR = 0.975;
  var V_WATER = 0.00101;   // м³/кг

  var $ = function (id) { return document.getElementById(id); };
  if (!$('rkP0')) return;

  function fmt(x, d) {
    var v = Number(x).toFixed(d === undefined ? 0 : d).split('.');
    v[0] = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return v.join(',');
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
    if (!isFinite(Ne) || Ne <= 0) Ne = 7800;
    var p0 = P0[i], t0 = T0[j], pk = PK[k];
    $('rkP0Out').textContent = fmt(p0) + ' МПа';
    $('rkT0Out').textContent = fmt(t0) + ' °C';
    $('rkPkOut').textContent = fmt(pk) + ' кПа';
    $('rkOiOut').textContent = fmt(oi, 2);

    var h1 = H1[i][j], s1 = S1[i][j];
    var tk = TK[k], hf = HF[k], sf = SF[k], sg = SG[k], r = R[k];
    var x2 = (s1 - sf) / (sg - sf);
    var wet = x2 <= 1;
    if (x2 > 1) x2 = 1;
    var h2 = hf + x2 * r;
    var H0 = h1 - h2;
    var ln = V_WATER * (p0 * 1000 - pk);
    var q1 = h1 - hf - ln;
    var etaT = (H0 - ln) / q1;
    var etaE = ETA_BOILER * ETA_PIPE * etaT * oi * ETA_MECH * ETA_GEAR;
    var ge = 3600 / (etaE * QN) * 1000;
    var D = Ne / (H0 * oi * ETA_MECH * ETA_GEAR);
    var B = D * q1 / (ETA_BOILER * ETA_PIPE * QN);
    var etaK = 1 - (tk + 273.15) / (t0 + 273.15);

    bar('rkBarK', 'rkValK', etaK);
    bar('rkBarT', 'rkValT', etaT);
    bar('rkBarE', 'rkValE', etaE);

    var out = '';
    out += row('\\(x_2 = \\dfrac{s_1 - s\'}{s\'\' - s\'}\\)',
      '(' + fmt(s1, 3) + ' − ' + fmt(sf, 4) + ')/(' + fmt(sg, 3) + ' − ' + fmt(sf, 4) + ')',
      fmt(x2, 3));
    out += row('\\(h_2 = h\' + x_2 r\\)',
      fmt(hf, 1) + ' + ' + fmt(x2, 3) + '·' + fmt(r, 1), fmt(h2, 0) + ' кДж/кг');
    out += row('\\(H_0 = h_1 - h_2\\)',
      fmt(h1, 1) + ' − ' + fmt(h2, 0), fmt(H0, 0) + ' кДж/кг');
    out += row('\\(l_{\\text{н}} = v\'(p_0 - p_к)\\)',
      '0,00101·(' + fmt(p0 * 1000) + ' − ' + fmt(pk) + ')', fmt(ln, 1) + ' кДж/кг');
    out += row('\\(q_1 = h_1 - h\' - l_{\\text{н}}\\)',
      fmt(h1, 1) + ' − ' + fmt(hf, 1) + ' − ' + fmt(ln, 1), fmt(q1, 0) + ' кДж/кг');
    out += row('\\(\\eta_t = (H_0 - l_{\\text{н}})/q_1\\)',
      '(' + fmt(H0, 0) + ' − ' + fmt(ln, 1) + ')/' + fmt(q1, 0), fmt(etaT, 3));
    out += row('\\(\\eta_e = \\eta_{\\text{к}}\\eta_{\\text{тр}}\\eta_t\\eta_{oi}\\eta_{\\text{м}}\\eta_{\\text{зп}}\\)',
      '0,88·0,98·' + fmt(etaT, 3) + '·' + fmt(oi, 2) + '·0,98·0,975', fmt(etaE, 3));
    out += row('\\(g_e = 3600/(\\eta_e Q_н)\\)',
      '3600/(' + fmt(etaE, 3) + '·42 700)', fmt(ge, 0) + ' г/(кВт·ч)');
    out += row('\\(D = N_e/(H_0\\eta_{oi}\\eta_{\\text{м}}\\eta_{\\text{зп}})\\)',
      fmt(Ne) + '/(' + fmt(H0, 0) + '·' + fmt(oi, 2) + '·0,98·0,975)',
      fmt(D, 2) + ' кг/с = ' + fmt(D * 3.6, 1) + ' т/ч');
    out += row('\\(B = N_e g_e\\)',
      fmt(Ne) + '·' + fmt(ge, 0) + '/10³',
      fmt(B * 3600, 0) + ' кг/ч = ' + fmt(B * 86.4, 1) + ' т/сут');
    out += row('\\(\\eta_К = 1 - T_к/T_0\\)',
      '1 − ' + fmt(tk + 273.15, 1) + '/' + fmt(t0 + 273.15, 1), fmt(etaK, 3));

    var note = 'Цикл берёт <b>' + fmt(etaT / etaK * 100, 0) + ' %</b> от своего '
      + 'предела Карно; до выходного фланца доходит ' + fmt(etaE * 100, 1)
      + ' % теплоты топлива.';
    if (!wet) {
      note += ' При таких параметрах пар за турбиной остаётся перегретым — '
        + 'расчёт по правилу отрезков к этому случаю неприменим, цифры даны '
        + 'условно.';
    } else if (x2 < 0.86) {
      note += ' Сухость ' + fmt(x2, 3) + ' ниже допустимой: в последних '
        + 'ступенях начнётся эрозия лопаток, нужен промежуточный перегрев или '
        + 'влагоудаление.';
    } else {
      note += ' Сухость ' + fmt(x2, 3) + ' приемлема для проточной части.';
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
    $('rkOi').value = 0.82; $('rkNe').value = 7800;
    compute();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();
