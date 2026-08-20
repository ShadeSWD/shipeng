/* cable.js — живой подбор сечения судового кабеля (p-cable).
 *
 * Тонкий слой: читает поля формы, зовёт SECALC.cableSection и печатает
 * результат. Своих формул и своей таблицы допустимых токов здесь нет — ряд
 * сечений берётся из SECALC.CABLE_TAB (раздел 11 модуля assets/secalc.js).
 */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('cbOut')) return;
  var S = window.SECALC;
  if (!S) return;

  function n(v, d) {
    return isFinite(v)
      ? Number(v).toLocaleString('ru-RU',
          { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';
  }
  function sec(v) {
    /* сечения ряда печатаются с одним знаком только там, где он есть */
    return isFinite(v) ? n(v, v % 1 ? 1 : 0) + ' мм²' : 'нет в ряду';
  }
  function cell(k, v, note) {
    return '<div class="cell"><span class="k">' + k + '</span><span class="v">' + v
      + (note ? ' <span style="color:#6b6b74;font-weight:400">' + note + '</span>' : '')
      + '</span></div>';
  }

  /* таблица длительно допустимых токов — прямо из модуля */
  function printTable() {
    var box = $('cbTab');
    if (!box) return;
    var half = Math.ceil(S.CABLE_TAB.length / 2);
    var html = '<table class="el">';
    for (var part = 0; part < 2; part++) {
      var rows = S.CABLE_TAB.slice(part * half, part * half + half);
      var r1 = '<tr><th class="num">S, мм²</th>', r2 = '<tr><th class="num">I<sub>доп</sub>, А</th>';
      rows.forEach(function (t) {
        r1 += '<td class="num">' + n(t[0], t[0] % 1 ? 1 : 0) + '</td>';
        r2 += '<td class="num">' + n(t[1], 0) + '</td>';
      });
      html += r1 + '</tr>' + r2 + '</tr>';
    }
    box.innerHTML = html + '</table>'
      + '<div class="caption">Ряд сечений и длительно допустимых токов —'
      + ' <code>SECALC.CABLE_TAB</code>, тот же, по которому считает разбор.</div>';
  }

  function calc() {
    var o = {
      P: parseFloat(String($('cbP').value).replace(',', '.')),
      phases: parseInt($('cbPh').value, 10),
      cos: parseFloat($('cbCos').value),
      eta: parseFloat($('cbEta').value),
      L: parseFloat($('cbL').value),
      k2: parseFloat($('cbCores').value),
      k1: parseFloat($('cbK1').value),
      duPct: parseFloat(String($('cbDu').value).replace(',', '.')),
      Ik: parseFloat(String($('cbIk').value).replace(',', '.')),
      tk: parseFloat(String($('cbTk').value).replace(',', '.'))
    };
    o.U = o.phases === 1 ? 220 : 400;
    if (!isFinite(o.P) || o.P <= 0) o.P = 150;
    if (!isFinite(o.duPct) || o.duPct <= 0) o.duPct = 6;
    if (!isFinite(o.Ik) || o.Ik <= 0) o.Ik = 6000;
    if (!isFinite(o.tk) || o.tk <= 0) o.tk = 0.1;

    $('cbCosOut').textContent = n(o.cos, 2);
    $('cbEtaOut').textContent = n(o.eta, 2);
    $('cbLOut').textContent = n(o.L, 0) + ' м';

    var r = S.cableSection(o);

    var out = cell('расчётный ток I', n(r.I, 1) + ' А',
        o.phases === 1 ? 'однофазная цепь ' + n(o.U, 0) + ' В'
                       : 'трёхфазная цепь ' + n(o.U, 0) + ' В')
      + cell('по нагреву', r.heat ? sec(r.heat) : 'нет в ряду',
        r.heat ? 'k₁k₂I<sub>доп</sub> = ' + n(r.heatI, 1) + ' А'
               : 'нужен параллельный кабель')
      + cell('по потере напряжения', r.sDropTab ? sec(r.sDropTab) : 'нет в ряду',
        'расчёт ' + n(r.sDrop, 2) + ' мм² при ΔU<sub>доп</sub> = ' + n(r.dUallow, 1) + ' В')
      + cell('по термической стойкости', r.sThermTab ? sec(r.sThermTab) : 'нет в ряду',
        'расчёт ' + n(r.sTherm, 2) + ' мм² при I<sub>к</sub> = ' + n(o.Ik, 0)
        + ' А, t<sub>к</sub> = ' + n(o.tk, 2) + ' с')
      + cell('принятое сечение', r.pick ? '<b>' + sec(r.pick.s) + '</b>' : '—',
        r.pick ? 'решает <b>' + r.pick.why + '</b>' : '')
      + cell('фактическая потеря напряжения', n(r.dU, 2) + ' В',
        '= ' + n(r.dUpct, 2) + ' % при допуске ' + n(o.duPct, 0) + ' %');

    if (r.pick) {
      var br = S.breakerSettings({ I: r.I, section: r.pick.s, k1: o.k1,
        k2: o.k2, Istart: r.I * 6 });
      out += cell('уставка теплового расцепителя',
        br.rated ? n(br.rated, 0) + ' А' : 'ряд не подходит',
        'между расчётным током ' + n(r.I, 1) + ' А и допустимым для сечения '
        + n(br.allowCorrected, 1) + ' А')
        + cell('уставка отсечки', n(br.trip, 0) + ' А',
          'выше пускового тока 6 I<sub>н</sub> с запасом 25 %');
    }

    var b = [];
    if (!r.pick) {
      b.push(['bad', 'ни одно сечение ряда не подходит — нужны параллельные кабели']);
    } else {
      b.push(['ok', 'решающее условие — ' + r.pick.why]);
      b.push(r.dUpct <= o.duPct
        ? ['ok', 'потеря напряжения ' + n(r.dUpct, 2) + ' % в допуске']
        : ['bad', 'потеря напряжения ' + n(r.dUpct, 2) + ' % больше допустимой']);
    }
    out += '<p>' + b.map(function (x) {
      return '<span class="badge ' + x[0] + '">' + x[1] + '</span>';
    }).join(' ') + '</p>';

    $('cbOut').innerHTML = out;
  }

  ['cbP', 'cbPh', 'cbCos', 'cbEta', 'cbL', 'cbCores', 'cbK1', 'cbDu',
   'cbIk', 'cbTk'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', calc);
    el.addEventListener('change', calc);
  });

  var reset = $('cbReset');
  if (reset) {
    reset.addEventListener('click', function () {
      /* исходные данные фидера подруливающего устройства из разбора */
      $('cbP').value = 150;
      $('cbPh').value = '3';
      $('cbCos').value = 0.85;
      $('cbEta').value = 0.92;
      $('cbL').value = 60;
      $('cbCores').value = '0.70';
      $('cbK1').value = '1.00';
      $('cbDu').value = 6;
      $('cbIk').value = 6000;
      $('cbTk').value = 0.1;
      calc();
    });
  }

  printTable();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', calc);
  } else { calc(); }
})();
