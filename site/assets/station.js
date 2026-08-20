/* station.js — живой расчёт нагрузки судовой электростанции (p-station).
 *
 * Тонкий слой: читает поля формы, зовёт SECALC и печатает результат.
 * Своих формул и своей таблицы потребителей здесь нет — перечень берётся из
 * SECALC.LOADS, режимы из SECALC.MODES, расчёты из modeLoad / apparentPower /
 * pickGenerators / startingDip (раздел 10 модуля assets/secalc.js).
 */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('stOut')) return;
  var S = window.SECALC;
  if (!S) return;

  var U = 400;        // В, напряжение сети
  var XD = 0.15;      // сверхпереходное сопротивление генератора (учебн.)
  var KMAX = 0.90;    // предельная загрузка генератора при подборе числа машин

  /* проверяемые на пуск двигатели — паспортные данные, а не расчёт */
  var MOTORS = {
    pump:     { title: 'насос забортной воды 22 кВт', P: 22,  cos: 0.85, eta: 0.88 },
    thruster: { title: 'подруливающее устройство 150 кВт', P: 150, cos: 0.85, eta: 0.92 }
  };

  /* ползунки, которыми можно подвинуть коэффициент загрузки строки */
  var TUNED = [
    { id: 'stKthr',   name: 'Подруливающее устройство' },
    { id: 'stKvent',  name: 'Вентиляторы машинного отделения' },
    { id: 'stKlight', name: 'Освещение и бытовые потребители' }
  ];

  var MODENAME = {};
  S.MODES.forEach(function (m) { MODENAME[m.key] = m.name; });

  var prevMode = null;

  function n(v, d) {
    return isFinite(v)
      ? Number(v).toLocaleString('ru-RU',
          { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';
  }
  function cell(k, v, note) {
    return '<div class="cell"><span class="k">' + k + '</span><span class="v">' + v
      + (note ? ' <span style="color:#6b6b74;font-weight:400">' + note + '</span>' : '')
      + '</span></div>';
  }

  /* коэффициент строки из модуля — он же значение ползунка по умолчанию */
  function moduleK(name, mode) {
    var row = null;
    S.LOADS.forEach(function (r) { if (r.n === name) row = r; });
    return row ? (row.k[mode] || 0) : 0;
  }

  /* копия SECALC.LOADS с подменёнными коэффициентами выбранных строк */
  function loadsForMode(mode) {
    var over = {};
    TUNED.forEach(function (t) {
      var el = $(t.id);
      if (el) over[t.name] = parseFloat(el.value);
    });
    return S.LOADS.map(function (r) {
      if (!(r.n in over) || !isFinite(over[r.n])) return r;
      var k = {};
      Object.keys(r.k).forEach(function (m) { k[m] = r.k[m]; });
      k[mode] = over[r.n];
      return { n: r.n, P: r.P, k: k };
    });
  }

  function syncSliders(mode) {
    TUNED.forEach(function (t) {
      var el = $(t.id);
      if (el) el.value = moduleK(t.name, mode);
    });
  }

  function compute() {
    var mode = $('stMode').value;
    if (mode !== prevMode) { syncSliders(mode); prevMode = mode; }

    var cos = parseFloat($('stCos').value);
    var Pdg = parseFloat(String($('stPdg').value).replace(',', '.'));
    var cnt = parseInt($('stN').value, 10);
    if (!isFinite(Pdg) || Pdg <= 0) Pdg = 160;
    if (!isFinite(cnt) || cnt < 1) cnt = 1;
    if (!isFinite(cos) || cos <= 0) cos = 0.80;

    $('stCosOut').textContent = n(cos, 2);
    TUNED.forEach(function (t) {
      var el = $(t.id), out = $(t.id + 'Out');
      if (el && out) out.textContent = n(parseFloat(el.value), 2);
    });

    var ml = S.modeLoad(loadsForMode(mode), mode);
    var ap = S.apparentPower(ml.P, cos, U);
    var gen = S.pickGenerators(ml.P, Pdg, cnt, KMAX);
    var sgen = S.apparentPower(gen.running * Pdg, cos, U);

    var mot = MOTORS[$('stMotor').value];
    var kStart = parseFloat($('stStart').value);
    var dip = S.startingDip({ P: mot.P, U: U, cos: mot.cos, eta: mot.eta,
                              kStart: kStart, xd: XD, Sgen: sgen.S });

    var rows = '';
    ml.rows.forEach(function (r) {
      rows += '<tr><td>' + r.n + '</td><td class="num">' + n(r.P, 1)
        + '</td><td class="num">' + n(r.k, 2)
        + '</td><td class="num">' + n(r.load, 2) + '</td></tr>';
    });

    var out = '<div class="panel"><table class="el">'
      + '<tr><th>Потребитель режима «' + MODENAME[mode] + '»</th>'
      + '<th class="num">P<sub>уст</sub>, кВт</th><th class="num">k<sub>з</sub></th>'
      + '<th class="num">P<sub>уст</sub>k<sub>з</sub>, кВт</th></tr>' + rows
      + '<tfoot><tr><td>Расчётная нагрузка режима</td><td class="num">—</td>'
      + '<td class="num">—</td><td class="num">' + n(ml.P, 2)
      + '</td></tr></tfoot></table></div>';

    out += cell('расчётная нагрузка P<sub>р</sub>', n(ml.P, 2) + ' кВт',
                'работает потребителей: ' + n(ml.rows.length, 0));
    out += cell('полная мощность S', n(ap.S, 1) + ' кВ·А', 'при cos φ = ' + n(cos, 2));
    out += cell('реактивная мощность Q', n(ap.Q, 1) + ' квар');
    out += cell('ток сети I', n(ap.I, 1) + ' А');
    out += cell('работает генераторов', n(gen.running, 0) + ' из ' + n(cnt, 0),
                'предел загрузки ' + n(KMAX * 100, 0) + ' %');
    out += cell('загрузка работающих', '<b>' + n(gen.load * 100, 1) + ' %</b>',
                'по ' + n(Pdg, 0) + ' кВт');
    out += cell('резерв остановленных машин', n(gen.reserve, 0) + ' кВт');
    out += cell('пуск: ' + mot.title, n(dip.Istart, 0) + ' А',
                'пусковой ток при ' + n(kStart, 0) + ' I<sub>н</sub>');
    out += cell('ток работающих генераторов', n(dip.Igen, 0) + ' А',
                n(sgen.S, 0) + ' кВ·А');
    out += cell('провал напряжения', '<b>' + n(dip.dip * 100, 1) + ' %</b>',
                'остаётся ' + n(dip.residual * 100, 1) + ' %');

    var b = [];
    if (!gen.enough) {
      b.push(['bad', 'мощности не хватает: нужно больше машин или мощнее агрегат']);
    } else if (gen.load < 0.40) {
      b.push(['bad', 'загрузка ' + n(gen.load * 100, 1) + ' % — дизель работает неэкономично']);
    } else {
      b.push(['ok', 'загрузка ' + n(gen.load * 100, 1) + ' % в допустимых пределах']);
    }
    b.push(gen.reserve > 0
      ? ['ok', 'резерв ' + n(gen.reserve, 0) + ' кВт: есть остановленная машина']
      : ['bad', 'резерва нет: работают все машины состава']);
    b.push(dip.dip <= 0.15
      ? ['ok', 'пуск проходит: провал ' + n(dip.dip * 100, 1) + ' % не больше 15 %']
      : ['bad', 'пуск не проходит: провал ' + n(dip.dip * 100, 1) + ' % больше 15 %']);
    out += '<p>' + b.map(function (x) {
      return '<span class="badge ' + x[0] + '">' + x[1] + '</span>';
    }).join(' ') + '</p>';

    $('stOut').innerHTML = out;
    if (window.renderMathInElement) {
      window.renderMathInElement($('stOut'), {
        delimiters: [{ left: '$$', right: '$$', display: true },
                     { left: '\\(', right: '\\)', display: false }],
        throwOnError: false
      });
    }
  }

  ['stMode', 'stPdg', 'stN', 'stCos', 'stKthr', 'stKvent', 'stKlight',
   'stMotor', 'stStart'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', compute);
    el.addEventListener('change', compute);
  });

  var reset = $('stReset');
  if (reset) {
    reset.addEventListener('click', function () {
      $('stMode').value = 'hod';
      $('stPdg').value = 160;
      $('stN').value = 2;
      $('stCos').value = 0.80;
      $('stMotor').value = 'pump';
      $('stStart').value = '6';
      prevMode = null;                 /* заставит вернуть коэффициенты модуля */
      compute();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();
