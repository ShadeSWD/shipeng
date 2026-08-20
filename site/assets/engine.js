/* engine.js — тонкий слой интерфейса разбора 4 «Подбор главного двигателя».
 *
 * Здесь нет ни одной формулы: страница читает поля ввода, зовёт функции
 * расчётного ядра assets/secalc.js и печатает результат. Поэтому числа
 * калькулятора, числа разобранного примера и числа соседних разборов не
 * могут разойтись — они получены одним и тем же кодом.
 *
 * Используются: SECALC.admiraltyPower, SECALC.resistanceChain,
 * SECALC.propellerDesign, SECALC.pickEngine, SECALC.voyageFuel,
 * SECALC.tankVolume, SECALC.ENGINES.
 */
'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('enOut') || typeof SECALC === 'undefined') return;
  var S = SECALC;

  var N = function (x, d) {
    return isFinite(x)
      ? x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })
      : '—';
  };
  var row = function (k, v, note) {
    return '<div class="cell"><span class="k">' + k + '</span><span class="v">' + v
      + (note ? ' <span style="color:#6b6b74;font-weight:400">' + note + '</span>' : '')
      + '</span></div>';
  };

  var FIELDS = ['enD', 'enV', 'enC', 'enSea', 'enMcr', 'enR', 'enNdg', 'enGe'];
  var DEFAULTS = { enD: 7659.3, enV: 12.5, enC: 430, enSea: 15, enMcr: 85,
                   enR: 4000, enNdg: 120, enGe: 195 };

  /* Опорная точка: мощность на валу на тихой воде, посчитанная по
     сопротивлению для судна сквозного примера при уточнённом КПД винта. */
  function calmWaterShaftPower() {
    var base = S.resistanceChain(S.EDU.eta0design);
    var pr = S.propellerDesign({
      Th: base.thrust * 1000, v: base.v, va: base.va,
      Dp: S.PLANT.Dp, ns: S.PLANT.nEng / S.PLANT.iGear / 60, Z: S.PLANT.Z
    });
    return { eta0: pr.eta0, chain: S.resistanceChain(pr.eta0) };
  }

  /* Типоразмерный ряд на оси мощности. Соседние исполнения стоят близко
     (1760 и 1980 кВт), поэтому подписи разводятся по высоте через одну —
     иначе они налезают друг на друга. */
  function drawRange(need, picked) {
    var g = $('enRange');
    if (!g) return;
    var cat = S.ENGINES;
    var maxP = cat[cat.length - 1].Ne * 1.06;
    var x = function (p) { return 70 + p / maxP * 500; };
    var AX = 96;
    var h = '';
    h += '<line x1="70" y1="' + AX + '" x2="590" y2="' + AX + '" stroke="#16161a" stroke-width="1.6"/>';
    h += '<text x="588" y="' + (AX + 46) + '" text-anchor="end" style="font:11px system-ui;fill:#6b6b74">мощность двигателя, кВт</text>';
    [0, 1000, 2000, 3000].forEach(function (p) {
      h += '<line x1="' + x(p).toFixed(1) + '" y1="' + AX + '" x2="' + x(p).toFixed(1)
        + '" y2="' + (AX + 5) + '" stroke="#16161a"/>';
      h += '<text x="' + x(p).toFixed(1) + '" y="' + (AX + 18)
        + '" text-anchor="middle" style="font:11px system-ui;fill:#6b6b74">' + p + '</text>';
    });
    cat.forEach(function (e, k) {
      var on = picked && e.Ne === picked.Ne;
      var yPow = (k % 2) ? AX - 40 : AX - 16;
      var cx = x(e.Ne);
      h += '<line x1="' + cx.toFixed(1) + '" y1="' + (yPow + 5) + '" x2="' + cx.toFixed(1)
        + '" y2="' + (AX - 6) + '" stroke="#c8c8d0" stroke-width="1"/>';
      h += '<circle cx="' + cx.toFixed(1) + '" cy="' + AX + '" r="' + (on ? 7 : 4.5)
        + '" fill="' + (on ? '#1a7f37' : '#155e75') + '"/>';
      h += '<text x="' + cx.toFixed(1) + '" y="' + yPow + '" text-anchor="middle" style="font:'
        + (on ? '600 ' : '') + '11px system-ui;fill:' + (on ? '#1a7f37' : '#6b6b74')
        + '">' + e.cyl + ' цил., ' + e.Ne + '</text>';
    });
    if (isFinite(need)) {
      h += '<line x1="' + x(need).toFixed(1) + '" y1="' + (AX + 6) + '" x2="'
        + x(need).toFixed(1) + '" y2="' + (AX + 38)
        + '" stroke="#b3382e" stroke-width="1.8" stroke-dasharray="6 4"/>';
      var anchor = x(need) > 380 ? 'end' : 'start';
      var dx = anchor === 'end' ? -6 : 6;
      h += '<text x="' + (x(need) + dx).toFixed(1) + '" y="' + (AX + 36)
        + '" text-anchor="' + anchor + '" style="font:600 11px system-ui;fill:#b3382e">потребная '
        + N(need, 0) + ' кВт</text>';
    }
    g.innerHTML = h;
  }

  function calc() {
    var D = +$('enD').value || 0, v = +$('enV').value || 0, C = +$('enC').value || 1;
    var sea = (+$('enSea').value || 0) / 100, kMcr = (+$('enMcr').value || 85) / 100;
    var R = +$('enR').value || 0, Ndg = +$('enNdg').value || 0, ge = +$('enGe').value || 195;

    var adm = S.admiraltyPower(D, v, C);
    var ref = calmWaterShaftPower();
    /* Метод сопротивления посчитан для судна сквозного примера; при других
       водоизмещении и скорости он масштабируется по тому же подобию, что и
       адмиралтейская формула, — это честно обозначено на странице. */
    var calm = ref.chain.P.PS * S.similarityScale(D, v);
    var byResist = calm * (1 + sea);
    var need = Math.max(adm, byResist);

    var pick = S.pickEngine(need);
    var eng = pick.engine;
    var vf = eng ? S.voyageFuel({ range: R, v: v, kMCR: kMcr, Ne: eng.Ne,
      ge: ge, Ndg: Ndg, gdg: S.PLANT.gdg, kres: S.EDU.kres }) : null;

    drawRange(need, eng);

    var out = row('адмиралтейская оценка', N(adm, 0) + ' кВт',
        '= Δ^{2/3}·v³/C при C = ' + N(C, 0))
      + row('мощность на валу на тихой воде', N(calm, 0) + ' кВт',
        'по сопротивлению, η₀ = ' + N(ref.eta0, 4))
      + row('то же с морским запасом', N(byResist, 0) + ' кВт',
        'запас ' + N(sea * 100, 0) + ' %')
      + row('расхождение методов', N(Math.abs(adm - byResist) / byResist * 100, 1) + ' %',
        Math.abs(adm - byResist) / byResist < 0.10 ? 'методы согласуются' : 'разошлись — проверьте C')
      + row('принято потребной', '<b>' + N(need, 0) + ' кВт</b>', 'большая из двух');
    if (eng) {
      out += row('выбранный двигатель',
          '<b>' + eng.cyl + ' цил., ' + N(eng.Ne, 0) + ' кВт при ' + N(eng.n, 0) + ' об/мин</b>',
          'запас ' + N(pick.spare * 100, 1) + ' % при минимуме 5 %')
        + row('эксплуатационная мощность', N(kMcr * eng.Ne, 0) + ' кВт',
          N(kMcr * 100, 0) + ' % номинала')
        + row('часовой расход', N(S.fuelRate(kMcr * eng.Ne, ge) * 1000, 1) + ' кг/ч', '')
        + row('ходовое время рейса', N(vf.hours, 0) + ' ч', N(R, 0) + ' миль на ' + N(v, 1) + ' уз')
        + row('топливо на рейс', N(vf.net, 2) + ' т',
          'ГД ' + N(vf.main, 2) + ' + ДГ ' + N(vf.aux, 2))
        + row('с нормативным запасом', '<b>' + N(vf.total, 2) + ' т</b>',
          'коэффициент ' + N(S.EDU.kres, 2))
        + row('объём топливных цистерн',
          N(S.tankVolume(vf.total, S.FUEL.rho, S.EDU.kFill), 1) + ' м³',
          'ρ = ' + N(S.FUEL.rho, 2) + ' т/м³, заполнение ' + N(S.EDU.kFill, 2));
    } else {
      out += row('выбранный двигатель', 'в ряду нет подходящего',
        'нужен двигатель другой размерности');
    }
    $('enOut').innerHTML = out;
  }

  FIELDS.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', calc);
    el.addEventListener('change', calc);
  });
  var reset = $('enReset');
  if (reset) {
    reset.addEventListener('click', function () {
      Object.keys(DEFAULTS).forEach(function (id) {
        if ($(id)) $(id).value = DEFAULTS[id];
      });
      calc();
    });
  }
  calc();
})();
