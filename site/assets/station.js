/* Живой расчёт нагрузки судовой электростанции для страницы p-station.
   Таблица потребителей и коэффициенты те же, что в статическом разборе;
   меняются режим, доля включённых рефрижераторных розеток и состав станции. */
'use strict';
(function () {
  /* имя, P_уст (кВт), КПД, cos φ, [kз·kо по режимам: ход, манёвры, стоянка, груз] */
  var LOADS = [
    ['Рулевая машина', 44, 0.85, 0.80, [0.175, 0.600, 0, 0]],
    ['Брашпиль и швартовные лебёдки', 55, 0.84, 0.75, [0, 0, 0, 0.360]],
    ['Компрессоры пускового воздуха', 37, 0.88, 0.82, [0.350, 0.700, 0.250, 0.420]],
    ['Насосы охлаждения ГД', 60, 0.86, 0.84, [0.600, 0.800, 0, 0]],
    ['Топливные и масляные насосы, сепараторы', 30, 0.82, 0.80, [0.560, 0.560, 0.300, 0.360]],
    ['Вентиляторы машинного отделения', 44, 0.88, 0.83, [0.800, 0.800, 0.175, 0.350]],
    ['Розетки рефрижераторных контейнеров', 400, 0.90, 0.90, [0.8, 0.8, 0.8, 0.8]],
    ['Грузовые и балластные насосы', 150, 0.88, 0.85, [0, 0, 0, 0.850]],
    ['Вентиляция и кондиционирование жилых помещений', 60, 0.87, 0.82, [0.560, 0.490, 0.560, 0.560]],
    ['Камбуз и бытовое оборудование', 45, 1.00, 1.00, [0.300, 0.300, 0.320, 0.420]],
    ['Освещение и слаботочные потребители', 35, 1.00, 0.95, [0.810, 0.900, 0.900, 0.950]],
    ['Навигация, связь, автоматика', 15, 0.90, 0.85, [0.800, 1.000, 0.800, 0.800]],
  ];
  var REEFER = 6;              // индекс строки рефрижераторных розеток
  var MODES = ['ходовой', 'маневровый', 'стояночный', 'грузовые операции'];
  var U = 400;                 // напряжение сети, В
  var COSN = 0.8;              // номинальный cos φ генератора
  var XD = 0.15;               // сверхпереходное сопротивление генератора
  var PMOT = 75, ETAM = 0.88, COSM = 0.85, KP = 6;   // наибольший двигатель

  var $ = function (id) { return document.getElementById(id); };
  if (!$('stMode')) return;

  function fmt(x, d) {
    var v = Number(x).toFixed(d === undefined ? 0 : d).split('.');
    v[0] = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return v.join(',');
  }
  function row(f, sub, res) {
    return '<div class="calc-row"><span class="f">' + f + '</span> = '
      + '<span style="color:#6b6b74">' + sub + '</span> = <b>' + res + '</b></div>';
  }

  function compute() {
    var m = +$('stMode').value;
    var reef = parseFloat($('stReef').value);
    var Pdg = parseFloat(String($('stPdg').value).replace(',', '.'));
    var n = parseInt($('stN').value, 10);
    var delta = parseFloat(String($('stDelta').value).replace(',', '.'));
    if (!isFinite(Pdg) || Pdg <= 0) Pdg = 800;
    if (!isFinite(n) || n < 2) n = 2;
    if (!isFinite(delta) || delta < 0) delta = 0;
    $('stReefOut').textContent = fmt(reef, 2);

    var sumP = 0, sumQ = 0, rows = '';
    LOADS.forEach(function (L, idx) {
      var k = L[4][m];
      if (idx === REEFER) k = 0.8 * reef;
      var p = L[1] * k / L[2];
      var tg = Math.sqrt(1 / (L[3] * L[3]) - 1);
      var q = p * tg;
      sumP += p; sumQ += q;
      rows += '<tr><td>' + L[0] + '</td><td class="num">' + fmt(L[1])
        + '</td><td class="num">' + fmt(k, 3) + '</td><td class="num">'
        + fmt(p, 1) + '</td><td class="num">' + fmt(q, 1) + '</td></tr>';
    });
    var kd = 1 + delta / 100;
    var P = sumP * kd, Q = sumQ * kd;
    var S = Math.sqrt(P * P + Q * Q);
    var cosf = P / S;
    var I = S * 1000 / (Math.sqrt(3) * U);
    var Sdg = Pdg / COSN;

    /* сколько машин нужно ввести: загрузка не выше 90 % ни по P, ни по S */
    var run = 1;
    while (run < n && (P / (run * Pdg) > 0.90 || S / (run * Sdg) > 0.90)) run++;
    var loadP = P / (run * Pdg) * 100, loadS = S / (run * Sdg) * 100;
    var reserve = P / ((n - 1) * Pdg) * 100;

    /* пуск наибольшего двигателя от работающих машин */
    var Inom = PMOT * 1000 / (Math.sqrt(3) * U * ETAM * COSM);
    var Sp = Math.sqrt(3) * U * KP * Inom / 1000;
    var dU = Sp * XD / (run * Sdg + Sp * XD) * 100;

    var out = '<div class="panel"><table class="el">'
      + '<tr><th>Потребитель</th><th class="num">P<sub>уст</sub>, кВт</th>'
      + '<th class="num">k<sub>з</sub>k<sub>о</sub></th><th class="num">P, кВт</th>'
      + '<th class="num">Q, квар</th></tr>' + rows
      + '<tfoot><tr><td>Сумма (режим «' + MODES[m] + '»)</td><td class="num">975</td>'
      + '<td class="num">—</td><td class="num">' + fmt(sumP, 1) + '</td>'
      + '<td class="num">' + fmt(sumQ, 1) + '</td></tr></tfoot></table></div>';

    out += row('\\(P_{\\text{р}} = (1+\\Delta)\\sum P_i\\)',
      fmt(kd, 2) + '·' + fmt(sumP, 1), fmt(P, 0) + ' кВт');
    out += row('\\(Q_{\\text{р}} = (1+\\Delta)\\sum Q_i\\)',
      fmt(kd, 2) + '·' + fmt(sumQ, 1), fmt(Q, 0) + ' квар');
    out += row('\\(S_{\\text{р}} = \\sqrt{P_{\\text{р}}^2+Q_{\\text{р}}^2}\\)',
      '√(' + fmt(P, 0) + '² + ' + fmt(Q, 0) + '²)', fmt(S, 0) + ' кВ·А');
    out += row('\\(\\cos\\varphi = P_{\\text{р}}/S_{\\text{р}}\\)',
      fmt(P, 0) + '/' + fmt(S, 0), fmt(cosf, 3));
    out += row('\\(I_{\\text{р}} = S_{\\text{р}}/(\\sqrt{3}\\,U)\\)',
      fmt(S * 1000, 0) + '/(1,732·' + fmt(U) + ')', fmt(I, 0) + ' А');
    out += row('число работающих ДГ', 'загрузка не выше 90 %', fmt(run) + ' из ' + fmt(n));
    out += row('загрузка по активной мощности',
      fmt(P, 0) + '/(' + fmt(run) + '·' + fmt(Pdg) + ')', fmt(loadP, 0) + ' %');
    out += row('загрузка по полной мощности',
      fmt(S, 0) + '/(' + fmt(run) + '·' + fmt(Sdg, 0) + ')', fmt(loadS, 0) + ' %');
    out += row('резерв: нагрузка на (n − 1) машинах',
      fmt(P, 0) + '/(' + fmt(n - 1) + '·' + fmt(Pdg) + ')', fmt(reserve, 0) + ' %');
    out += row('\\(\\Delta U/U\\) при пуске насоса 75 кВт',
      fmt(Sp, 0) + '·0,15/(' + fmt(run * Sdg, 0) + ' + ' + fmt(Sp * XD, 0) + ')',
      fmt(dU, 1) + ' %');

    var b = [];
    if (loadP < 40) {
      b.push(['bad', 'загрузка ниже 40 % — дизель работает неэкономично']);
    } else if (loadP > 90) {
      b.push(['bad', 'перегрузка: не хватает машин в составе станции']);
    } else {
      b.push(['ok', 'загрузка ' + fmt(loadP, 0) + ' % в допустимых пределах']);
    }
    b.push(reserve <= 100
      ? ['ok', 'резерв обеспечен: при отказе одной машины загрузка ' + fmt(reserve, 0) + ' %']
      : ['bad', 'резерва нет: при отказе одной машины не хватит мощности']);
    b.push(dU <= 15
      ? ['ok', 'пуск наибольшего двигателя: провал ' + fmt(dU, 1) + ' %']
      : ['bad', 'провал ' + fmt(dU, 1) + ' % больше допустимых 15 %']);
    out += '<p>' + b.map(function (x) {
      return '<span class="badge ' + x[0] + '">' + x[1] + '</span>';
    }).join(' ') + '</p>';

    $('stOut').innerHTML = out;
    if (window.renderMathInElement) {
      window.renderMathInElement($('stOut'), {
        delimiters: [{ left: '$$', right: '$$', display: true },
                     { left: '\\(', right: '\\)', display: false }],
        throwOnError: false,
      });
    }
  }

  ['stMode', 'stReef', 'stPdg', 'stN', 'stDelta'].forEach(function (id) {
    $(id).addEventListener('input', compute);
    $(id).addEventListener('change', compute);
  });
  $('stReset').addEventListener('click', function () {
    $('stMode').value = '3'; $('stReef').value = 0.9;
    $('stPdg').value = 800; $('stN').value = 3; $('stDelta').value = 4;
    compute();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compute);
  } else { compute(); }
})();
