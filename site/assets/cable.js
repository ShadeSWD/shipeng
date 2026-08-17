/* cable.js — живой подбор сечения судового кабеля.
 * Считает по той же цепочке, что и разобранные примеры страницы:
 * ток потребителя → сечение по нагреву с поправками k1·k2 → проверка потери
 * напряжения → проверка термической стойкости при коротком замыкании.
 * Решающим показывается то условие, которое дало наибольшее сечение. */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('cbOut')) return;

  /* учебная таблица длительно допустимых токов (та же, что напечатана выше) */
  var TAB = [
    [1.5, 23], [2.5, 30], [4, 40], [6, 52], [10, 72], [16, 94], [25, 125],
    [35, 155], [50, 190], [70, 240], [95, 290], [120, 335], [150, 385],
    [185, 435], [240, 510],
  ];
  var RHO = 0.0175;      // Ом·мм²/м, медь при расчётной температуре
  var C_CU = 141;        // А·с^0,5/мм², термическая стойкость медной жилы
  var IK = 20000;        // А, ток короткого замыкания на шинах ГРЩ (учебный)
  var TK = 0.1;          // с, время отключения

  var fmt = function (v, d) {
    return isFinite(v)
      ? v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';
  };
  var row = function (k, v, note) {
    return '<div class="cell"><span class="k">' + k + '</span><span class="v">' + v
      + (note ? ' <span style="color:#6b6b74;font-weight:400">' + note + '</span>' : '')
      + '</span></div>';
  };

  function calc() {
    var P = +$('cbP').value || 0;
    var ph = +$('cbPh').value;                  // 3 — трёхфазная, 1 — однофазная
    var cos = +$('cbCos').value, eta = +$('cbEta').value;
    var L = +$('cbL').value, k2 = +$('cbCores').value, k1 = +$('cbK1').value;
    var duPct = +$('cbDu').value;
    var U = ph === 3 ? 400 : 220;

    $('cbCosOut').textContent = fmt(cos, 2);
    $('cbEtaOut').textContent = fmt(eta, 2);
    $('cbLOut').textContent = fmt(L, 0) + ' м';

    var I = P * 1000 / ((ph === 3 ? Math.sqrt(3) * U : U) * cos * eta);

    /* 1) по нагреву: I_доп·k1·k2 ≥ I */
    var sHeat = null, iHeat = 0;
    for (var i = 0; i < TAB.length; i++) {
      if (TAB[i][1] * k1 * k2 >= I) { sHeat = TAB[i][0]; iHeat = TAB[i][1] * k1 * k2; break; }
    }
    /* 2) по потере напряжения: трёхфазная — √3·ρ·L·I·cos φ / S,
          однофазная — 2·ρ·L·I / S (в оба провода) */
    var dUdop = duPct / 100 * U;
    var sDrop = ph === 3
      ? Math.sqrt(3) * RHO * L * I * cos / dUdop
      : 2 * RHO * L * I / dUdop;
    var sDropTab = null;
    for (var j = 0; j < TAB.length; j++) if (TAB[j][0] >= sDrop) { sDropTab = TAB[j][0]; break; }
    /* 3) по термической стойкости при коротком замыкании */
    var sTherm = IK * Math.sqrt(TK) / C_CU;
    var sThermTab = null;
    for (var m = 0; m < TAB.length; m++) if (TAB[m][0] >= sTherm) { sThermTab = TAB[m][0]; break; }

    var cands = [
      { s: sHeat, why: 'нагрев' },
      { s: sDropTab, why: 'потеря напряжения' },
      { s: sThermTab, why: 'термическая стойкость' },
    ].filter(function (c) { return c.s; });
    var pick = cands.length ? cands.reduce(function (a, b) { return b.s > a.s ? b : a; }) : null;

    /* фактическая потеря на принятом сечении */
    var dU = pick ? (ph === 3
      ? Math.sqrt(3) * RHO * L * I * cos / pick.s
      : 2 * RHO * L * I / pick.s) : NaN;

    var out = row('расчётный ток I', fmt(I, 1) + ' А',
      ph === 3 ? '= P/(√3·U·cos φ·η)' : '= P/(U·cos φ·η)')
      + row('сечение по нагреву', sHeat ? fmt(sHeat, 0) + ' мм²' : 'нет в таблице',
        sHeat ? 'I_доп·k₁·k₂ = ' + fmt(iHeat, 0) + ' А' : 'нужен параллельный кабель')
      + row('по потере напряжения', sDropTab ? fmt(sDropTab, 0) + ' мм²' : 'нет в таблице',
        'расчёт ' + fmt(sDrop, 1) + ' мм² при ΔU_доп = ' + fmt(dUdop, 1) + ' В')
      + row('по термической стойкости', sThermTab ? fmt(sThermTab, 0) + ' мм²' : 'нет в таблице',
        'расчёт ' + fmt(sTherm, 1) + ' мм² при I_к = 20 кА, t = 0,1 с')
      + row('принятое сечение',
        pick ? '<b>' + fmt(pick.s, 0) + ' мм²</b>' : '—',
        pick ? 'решает ' + pick.why : '')
      + row('фактическая потеря', fmt(dU, 2) + ' В',
        '= ' + fmt(dU / U * 100, 2) + ' % при допуске ' + fmt(duPct, 0) + ' %');
    $('cbOut').innerHTML = out;
  }

  ['cbP', 'cbPh', 'cbCos', 'cbEta', 'cbL', 'cbCores', 'cbK1', 'cbDu'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', calc);
    if (el) el.addEventListener('change', calc);
  });
  var reset = $('cbReset');
  if (reset) {
    reset.addEventListener('click', function () {
      /* исходные данные грузового насоса из разобранного примера */
      $('cbP').value = 75; $('cbPh').value = '3'; $('cbCos').value = 0.85;
      $('cbEta').value = 0.88; $('cbL').value = 45; $('cbCores').value = '0.70';
      $('cbK1').value = '1.00'; $('cbDu').value = 6;
      calc();
    });
  }
  calc();
})();
