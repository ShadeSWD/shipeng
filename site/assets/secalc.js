/* secalc.js — расчётное ядро сайта «Судовые энергетические установки».
 *
 * Здесь живут ВСЕ формулы разборов задач (p-*.html) и живых калькуляторов.
 * Страницы только подставляют числа и печатают результат: ни одна формула не
 * повторяется в разметке и не дублируется между страницами.
 *
 * Модуль чистый: не трогает DOM, не читает глобальные переменные, не имеет
 * состояния. В браузере доступен как window.SECALC, в node — как
 * module.exports, поэтому один и тот же код проверяется тестами
 * (tests/test_secalc.py) и работает на странице.
 *
 * СКВОЗНОЙ ПРИМЕР КЛАСТЕРА. Судно — тот же сухогруз 100,0 × 15,3 × 8,3 м,
 * T = 6,60 м, δ = 0,74, что на сайтах «Проектирование судов» (/design/,
 * разборы 1 «Уравнение масс» и 4 «Мощность и ходкость»), «Технология
 * судостроения» (/shiptech/p-launch, спуск) и «Конструкция корпуса судов»
 * (/hullstruct/p-girder, эквивалентный брус). Четыре курса считают одно
 * судно с разных сторон.
 *
 * ГРАНИЦА С САЙТОМ ПРОЕКТИРОВАНИЯ. /design/ доводит расчёт до потребной
 * мощности 1836,7 кВт и выбирает двигатель 1980 кВт при 900 об/мин, приняв
 * КПД винта в свободной воде η₀ = 0,50 «по порядку величины» — винта на той
 * стадии ещё нет. Здесь винт проектируется (раздел 3), η₀ получается 0,534,
 * и вся цепочка пересчитывается: потребная мощность падает до 1719,9 кВт.
 * Обе величины хранятся в модуле рядом (REQUIRED_DESIGN и требуемая по
 * уточнённому расчёту), а страницы обязаны показывать обе и объяснять
 * расхождение. Двигатель от уточнения не меняется — это и есть проверка.
 *
 * ОБ УЧЕБНЫХ КОЭФФИЦИЕНТАХ. Правила РС — документ, действующее издание
 * которого обязательно к применению; числовые коэффициенты в нём меняются от
 * издания к изданию. В модуле помечено, что взято из документа с указанием
 * части (структура формулы диаметра вала — часть VII; состав аварийных
 * потребителей и число пусков — части VII и XI; формулы EEDI/CII и пределы
 * Tier — МАРПОЛ VI и резолюции ИМО), а что является УЧЕБНЫМ ориентиром
 * правильной структуры расчёта. Учебные величины собраны в EDU и в каждой
 * функции помечены комментарием «учебн.».
 *
 * Самопроверка: SECALC.selftest() возвращает массив расхождений (пустой
 * массив — все контрольные точки сошлись). Контрольные точки посчитаны
 * независимо от кода: аналитически, обращением формулы либо сверкой с
 * числом, опубликованным соседним сайтом кластера.
 */
'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SECALC = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ==================================================================
   *  0. ПОСТОЯННЫЕ
   * ================================================================== */

  var G = 9.81;             // м/с²
  var RHO_SW = 1025.0;      // кг/м³, забортная вода
  var RHO_AIR = 1.226;      // кг/м³, воздух
  var NU_SW = 1.1892e-6;    // м²/с, кинематическая вязкость при 15 °C (ITTC)
  var KN = 0.5144444;       // м/с в одном узле
  var PATM = 101325.0;      // Па
  var PV_WATER = 1700.0;    // Па, давление насыщенных паров воды при 15 °C

  /* ==================================================================
   *  1. СУДНО, УСТАНОВКА, УЧЕБНЫЕ КОЭФФИЦИЕНТЫ
   * ================================================================== */

  /* Судно сквозного примера кластера — сухогруз, /design/p-dims и p-mass. */
  var SHIP = {
    L: 100.0,       // м, длина между перпендикулярами
    B: 15.3,        // м, ширина
    H: 8.3,         // м, высота борта
    T: 6.60,        // м, осадка в полном грузу
    delta: 0.74,    // коэффициент общей полноты
    disp: 7659.3,   // т, водоизмещение массовое (/design/p-mass)
    dwt: 4157.0,    // т, дедвейт (/design/p-mass)
    v: 12.5,        // уз, скорость на тихой воде
    range: 4000,    // миль, дальность плавания
    auto: 20,       // сут, автономность
    crew: 14        // чел
  };

  /* Главная энергетическая установка. Двигатель выбран на /design/p-power,
     остальное (редуктор, винт, валопровод) проектируется здесь. */
  var PLANT = {
    Ne: 1980.0,     // кВт, номинальная мощность (MCR) главного двигателя
    nEng: 900.0,    // об/мин, номинальная частота вращения двигателя
    cyl: 9,         // число цилиндров
    bore: 0.240,    // м, диаметр цилиндра
    stroke: 0.300,  // м, ход поршня
    tact: 4,        // тактность
    ge: 195.0,      // г/(кВт·ч), удельный расход на номинале (/design/p-mass)
    gdg: 210.0,     // г/(кВт·ч), удельный расход дизель-генератора
    iGear: 5.0,     // передаточное отношение редуктора
    Dp: 4.2,        // м, диаметр гребного винта
    Z: 4,           // число лопастей
    AeA0: 0.45,     // дисковое отношение
    etaShaft: 0.98, // КПД валопровода
    kMCR: 0.85,     // эксплуатационная доля номинальной мощности
    Ndg: 120.0      // кВт, нагрузка электростанции на ходу (/design/p-mass)
  };

  /* Топливо: дизельное (DMA) с содержанием серы 0,10 % — судно работает и в
     районах контроля выбросов SECA. */
  var FUEL = {
    Qn: 42700.0,    // кДж/кг, низшая теплота сгорания
    rho: 0.86,      // т/м³, плотность
    S: 0.10,        // %, массовая доля серы
    CF: 3.206,      // т CO₂ на т топлива (МАРПОЛ VI, для DM-сортов)
    L0: 14.3        // кг воздуха на кг топлива, теоретически необходимо
  };

  /* УЧЕБНЫЕ величины: назначены по порядкам величин для судов этого класса,
     первоисточником не подтверждены. Каждая помечена там, где применяется. */
  var EDU = {
    k1form: 1.25,   // коэффициент формы (1+k) для полного судна (учебн.)
    CA: 0.4e-3,     // надбавка на шероховатость и корреляцию (учебн.)
    CW: 0.45e-3,    // коэффициент волнового сопротивления при Fr = 0,205 (учебн.)
    Cair: 0.8,      // коэффициент воздушного сопротивления (учебн.)
    Aair: 153.0,    // м², площадь парусности (учебн.)
    kApp: 0.03,     // доля выступающих частей от вязкостного (учебн.)
    t: 0.20,        // коэффициент засасывания (учебн.)
    etaR: 1.02,     // коэффициент влияния неравномерности потока (учебн.)
    eta0design: 0.50, // η₀, принятый на /design/p-power «по порядку» (учебн.)
    seaMargin: 0.15,  // морской запас (учебн.)
    etaM: 0.90,     // механический КПД среднеоборотного дизеля (учебн.)
    epsBlade: 0.030,  // обратное качество профиля лопасти c_x/c_y (учебн.)
    kZblade: 0.80,  // поправка на конечное число лопастей и концевые потери (учебн.)
    slipDesign: 0.20, // кажущееся скольжение расчётного режима (учебн.)
    tauAllow: 40.0, // МПа, допускаемое касательное напряжение вала (учебн.)
    Rm: 600.0,      // МПа, временное сопротивление стали вала
    Gsteel: 8.1e10, // Па, модуль сдвига стали
    lShaft: 18.0,   // м, длина гребной ветви валопровода
    kres: 1.10,     // коэффициент нормативного запаса топлива (учебн.)
    kFill: 0.95,    // коэффициент заполнения топливных цистерн (учебн.)
    lambda: 2.2,    // коэффициент избытка воздуха (учебн.)
    cpGas: 1.10,    // кДж/(кг·К), теплоёмкость выпускных газов (учебн.)
    t0: 15.0,       // °C, температура наружного воздуха
    tStack: 180.0,  // °C, температура за утилькотлом по точке росы (учебн.)
    startsRequired: 6, // число пусков без пополнения баллонов, нереверсивный ГД
    qStart: 10.0,   // м³ воздуха при н. у. на 1 м³ рабочего объёма за пуск (учебн.)
    pBottle: 3.0e6, // Па, рабочее давление баллонов пускового воздуха
    pStartMin: 0.9e6, // Па, наименьшее давление, при котором двигатель пускается
    /* Учебная индикаторная диаграмма, снятая с цилиндра на номинальном
       режиме: площадь мм², длина мм, масштаб пружины МПа/мм. */
    card: { area: 1280.0, length: 80.0, scale: 0.15 },
    /* Крутильные колебания: масса винта и радиус инерции (учебн.). */
    propMass: 7500.0, propGyr: 1.05, kWater: 0.25
  };

  /* Параметры обслуживающих систем и электрооборудования судна. Собраны
     здесь, чтобы страницы разборов не заводили собственных чисел. */
  var SERVICE = {
    U: 400.0,          // В, напряжение силовой сети
    Ulight: 220.0,     // В, напряжение сети освещения
    cosPhi: 0.80,      // расчётный коэффициент мощности станции (учебн.)
    dgUnit: 160.0,     // кВт, мощность одного дизель-генератора
    dgCount: 2,        // число основных дизель-генераторов
    dgEmergency: 64.0, // кВт, аварийный дизель-генератор
    kGenMax: 0.90,     // предельная длительная загрузка генератора (учебн.)
    xd: 0.15,          // сверхпереходное сопротивление генератора (учебн.)
    dipLimit: 0.15,    // допустимый провал напряжения при пуске (Правила, ч. XI)
    steamDemand: 400.0,// кг/ч, потребность в паре на ходу (учебн.)
    iSteam: 2763.0,    // кДж/кг, энтальпия насыщенного пара 0,7 МПа
    iFeed: 251.0,      // кДж/кг, энтальпия питательной воды 60 °C
    etaBoilerWH: 0.98, // КПД утилизационного котла (учебн.)
    etaBoilerAux: 0.85,// КПД вспомогательного котла (учебн.)
    etaGen: 0.95,      // КПД генератора валогенераторной установки (учебн.)
    etaPTO: 0.98,      // КПД отбора мощности от редуктора (учебн.)
    gdgPart: 220.0,    // г/(кВт·ч), расход ДГ на частичной нагрузке (учебн.)
    dtWater: 8.0,      // К, нагрев пресной воды в контуре ЦПГ (учебн.)
    dtOil: 10.0,       // К, нагрев масла в маслоохладителе (учебн.)
    dtSea: 10.0,       // К, нагрев забортной воды в центральном охладителе
    cWater: 4.19,      // кДж/(кг·К), пресная вода
    cSea: 3.98,        // кДж/(кг·К), забортная вода солёностью 35 ‰
    cOil: 2.0,         // кДж/(кг·К), циркуляционное масло
    rhoFresh: 1000.0,  // кг/м³
    rhoOil: 900.0,     // кг/м³
    hShaft: 3.0        // м, заглубление оси гребного вала
  };

  /* Статьи теплового баланса среднеоборотного дизеля с наддувом.
     Доли — учебные, назначены по данным испытаний двигателей этого класса;
     полезная работа и «остаточные» вычисляются, а не задаются. */
  var HEAT_SHARE = { gas: 0.280, water: 0.170, oil: 0.040, air: 0.060 };

  /* ==================================================================
   *  2. ХОДКОСТЬ И ПРОПУЛЬСИВНЫЙ КОМПЛЕКС
   *
   *  Раздел воспроизводит цепочку /design/p-power (упрощённая схема
   *  Холтропа, C_F по ITTC-57) — не для того, чтобы её пересказать, а
   *  чтобы разборы этого сайта считались от тех же чисел и расхождение
   *  с соседним курсом было видно, а не спрятано.
   * ================================================================== */

  function knots(v) { return v * KN; }              // уз → м/с
  function volume(s) { return s.delta * s.L * s.B * s.T; }  // м³

  /** Смоченная поверхность по Мамфорду, м². */
  function wettedSurface(L, T, V) { return 1.7 * L * T + V / T; }

  /** Число Рейнольдса по длине. */
  function reynolds(v, L, nu) { return v * L / (nu || NU_SW); }

  /** Коэффициент трения эквивалентной пластины, ITTC-57. */
  function cFriction(Re) {
    var d = Math.log(Re) / Math.LN10 - 2;
    return 0.075 / (d * d);
  }

  /** Сопротивление по составляющим. Всё в кН, мощность в кВт. */
  function resistance(o) {
    var rho = o.rho || RHO_SW;
    var v = o.v, S = o.S;
    var qS = 0.5 * rho * v * v * S / 1000;          // кН
    var Rvisc = (o.k1 * o.CF + o.CA) * qS;
    var Rw = o.CW * qS;
    var Rapp = o.kApp * Rvisc;
    var Rair = 0.5 * (o.rhoAir || RHO_AIR) * o.Cair * o.Aair * v * v / 1000;
    var RT = Rvisc + Rw + Rapp + Rair;
    return { qS: qS, Rvisc: Rvisc, Rw: Rw, Rapp: Rapp, Rair: Rair,
             RT: RT, PE: RT * v };
  }

  /** Коэффициент попутного потока по Тейлору для одновинтовых судов. */
  function wakeTaylor(delta) { return 0.5 * delta - 0.05; }

  /** Пропульсивный комплекс: от буксировочной мощности к фланцу двигателя. */
  function propulsion(PE, o) {
    var w = (o.w === undefined) ? wakeTaylor(o.delta) : o.w;
    var t = o.t;
    var etaH = (1 - t) / (1 - w);
    var etaD = etaH * o.eta0 * o.etaR;
    var PD = PE / etaD;
    var PS = PD / o.etaShaft;
    return { w: w, t: t, etaH: etaH, etaD: etaD, PD: PD, PS: PS,
             required: PS * (1 + o.seaMargin) };
  }

  /** Полная цепочка ходкости судна сквозного примера при заданном η₀. */
  function resistanceChain(eta0, ship) {
    var s = ship || SHIP;
    var v = knots(s.v);
    var V = volume(s);
    var S = wettedSurface(s.L, s.T, V);
    var Re = reynolds(v, s.L);
    var CF = cFriction(Re);
    var r = resistance({ v: v, S: S, k1: EDU.k1form, CF: CF, CA: EDU.CA,
      CW: EDU.CW, Cair: EDU.Cair, Aair: EDU.Aair, kApp: EDU.kApp });
    var p = propulsion(r.PE, { delta: s.delta, t: EDU.t, eta0: eta0,
      etaR: EDU.etaR, etaShaft: PLANT.etaShaft, seaMargin: EDU.seaMargin });
    return { v: v, V: V, S: S, Re: Re, CF: CF, R: r, P: p,
             thrust: r.RT / (1 - EDU.t), va: v * (1 - p.w) };
  }

  /* Мощность по адмиралтейскому коэффициенту — второй, независимый способ
     оценки на стадии первого приближения (/design/p-mass). */
  function admiraltyPower(D, v, C) { return Math.pow(D, 2 / 3) * v * v * v / C; }
  function admiraltyCoef(D, v, P) { return Math.pow(D, 2 / 3) * v * v * v / P; }

  /** Пересчёт мощности с судна сквозного примера на близкое судно по тому же
   *  подобию, что заложено в адмиралтейскую формулу: N ∝ Δ^{2/3}·v³.
   *  Годится только для судов того же типа и близкой относительной скорости. */
  function similarityScale(D, v, ship) {
    var s = ship || SHIP;
    return Math.pow(D / s.disp, 2 / 3) * Math.pow(v / s.v, 3);
  }

  /* ==================================================================
   *  3. ГРЕБНОЙ ВИНТ
   *
   *  Схема расчёта: диаметр ограничен осадкой, частота вращения —
   *  передаточным отношением редуктора, дисковое отношение — кавитацией
   *  (критерий Келлера). КПД в свободной воде оценивается импульсной
   *  теорией с поправкой на профильные потери — это независимая от
   *  диаграмм серии B оценка, которой можно проверить снятое с диаграммы
   *  значение.
   * ================================================================== */

  /** Коэффициент нагрузки винта по упору. */
  function thrustLoading(Th, va, Dp, rho) {
    var A0 = Math.PI * Dp * Dp / 4;
    return Th / (0.5 * (rho || RHO_SW) * va * va * A0);
  }

  /** Идеальный (по импульсной теории) КПД винта и осевое поджатие. */
  function idealEfficiency(CT) {
    var a = (Math.sqrt(1 + CT) - 1) / 2;
    return { a: a, eta: 1 / (1 + a) };
  }

  /** Наименьшее дисковое отношение по критерию Келлера (кавитация).
   *  A_E/A_0 = (1,3 + 0,3 Z)·P / ((p₀ − p_v)·D²) + k,
   *  k = 0,20 для одновинтовых судов; p₀ — давление на оси винта. */
  function kellerArea(Th, Z, Dp, hShaft, rho) {
    var p0 = PATM + (rho || RHO_SW) * G * hShaft;
    return { p0: p0, dp: p0 - PV_WATER,
             AeA0: (1.3 + 0.3 * Z) * Th / ((p0 - PV_WATER) * Dp * Dp) + 0.20 };
  }

  /** Проектировочный расчёт винта.
   *  Вход: упор Th (Н), скорость судна v и скорость натекания va (м/с),
   *  диаметр Dp (м), частота ns (с⁻¹), число лопастей Z.
   *
   *  Шаг винта назначается через кажущееся скольжение расчётного режима
   *  (для транспортных судов 0,15…0,25) — это обычный приём предварительного
   *  проектирования: H = v/((1 − s)·n). Полученное шаговое отношение
   *  проверяется по гидродинамическому углу натекания: разность
   *  «геометрический угол лопасти минус β_i» — это угол атаки сечения, и он
   *  обязан оказаться в разумных 3…6°. */
  function propellerDesign(o) {
    var rho = o.rho || RHO_SW;
    var Dp = o.Dp, ns = o.ns, Th = o.Th, va = o.va;
    var A0 = Math.PI * Dp * Dp / 4;
    var CT = thrustLoading(Th, va, Dp, rho);
    var ideal = idealEfficiency(CT);
    var J = va / (ns * Dp);
    /* Профильные потери по элементу лопасти на радиусе 0,7R:
       tg β = J/(0,7π); индуктивное поджатие поворачивает поток на β_i. */
    var tanB = J / (0.7 * Math.PI);
    var tanBi = tanB * (1 + ideal.a);
    var eps = (o.eps === undefined) ? EDU.epsBlade : o.eps;
    var kZ = (o.kZ === undefined) ? EDU.kZblade : o.kZ;
    var etaProf = (1 - eps / tanBi) / (1 + eps * tanBi);
    var eta0 = ideal.eta * etaProf * kZ;
    var KT = Th / (rho * ns * ns * Math.pow(Dp, 4));
    var KQ = J * KT / (2 * Math.PI * eta0);
    var Q0 = KQ * rho * ns * ns * Math.pow(Dp, 5);   // Н·м, в свободной воде
    var betaI = Math.atan(tanBi);
    var slip = (o.slip === undefined) ? EDU.slipDesign : o.slip;
    var pitch = o.v / ((1 - slip) * ns);
    var PoD = pitch / Dp;
    /* обратная проверка: какой угол атаки сечения 0,7R этому соответствует */
    var phi = Math.atan(PoD / (0.7 * Math.PI));
    return {
      A0: A0, CT: CT, a: ideal.a, etaIdeal: ideal.eta, J: J,
      tanB: tanB, tanBi: tanBi, betaIdeg: betaI * 180 / Math.PI,
      etaProf: etaProf, eta0: eta0, KT: KT, KQ: KQ, KTJ2: KT / (J * J),
      Q0: Q0, PD0: 2 * Math.PI * ns * Q0,
      PoD: PoD, pitch: pitch, phiDeg: phi * 180 / Math.PI,
      alphaDeg: (phi - betaI) * 180 / Math.PI,
      slipApparent: slip, slipTrue: 1 - va / (pitch * ns),
      tipSpeed: Math.PI * Dp * ns
    };
  }

  /** Кажущееся скольжение — по скорости судна, а не по скорости натекания. */
  function slipApparent(v, pitch, ns) { return 1 - v / (pitch * ns); }

  /* ==================================================================
   *  4. ВАЛОПРОВОД
   * ================================================================== */

  /** Крутящий момент, Н·м, при N в кВт и n в об/мин. M = 30000·N/(π·n). */
  function torque(N, n) { return 30000 * N / (Math.PI * n); }

  /** Полярный момент сопротивления сплошного/полого вала, м³. */
  function polarModulus(d, alpha) {
    var a = alpha || 0;
    return Math.PI * d * d * d / 16 * (1 - Math.pow(a, 4));
  }
  /** Полярный момент инерции сечения, м⁴. */
  function polarInertia(d, alpha) {
    var a = alpha || 0;
    return Math.PI * Math.pow(d, 4) / 32 * (1 - Math.pow(a, 4));
  }

  /** Диаметр вала из условия прочности при кручении, м ([τ] в МПа).
   *  При заданном alpha = d_вн/d возвращается наружный диаметр полого вала
   *  равной прочности. */
  function shaftDiameter(M, tauAllow, alpha) {
    var a = alpha || 0;
    return Math.pow(16 * M / (Math.PI * tauAllow * 1e6 * (1 - Math.pow(a, 4))), 1 / 3);
  }

  /** Момент инерции сосредоточенной массы: J = m·ρ², кг·м². */
  function inertiaOfMass(m, gyr) { return m * gyr * gyr; }

  /** Частота вращения за передачей, об/мин. */
  function gearedSpeed(n, i) { return n / i; }

  /** Диаметр вала по структуре формулы Правил РС, часть VII, мм.
   *  d = F·k·∛( N/n · 560/(R_m + 160) ); N в кВт, n в об/мин, R_m в МПа.
   *  Коэффициенты F и k берут по действующей редакции Правил; здесь
   *  F = 95 (промежуточный вал), F = 100 и k = 1,22 (гребной вал). */
  function shaftDiameterRules(N, n, Rm, F, k) {
    return F * k * Math.pow(N / n * 560 / (Rm + 160), 1 / 3);
  }

  /** Напряжение кручения, МПа. */
  function shear(M, Wp) { return M / Wp / 1e6; }

  /** Угол закручивания, рад, и погонный угол, °/м. */
  function twist(M, l, Gs, Ip) {
    var phi = M * l / (Gs * Ip);
    return { rad: phi, deg: phi * 180 / Math.PI, perMetre: phi * 180 / Math.PI / l };
  }

  /** Крутильная жёсткость участка вала, Н·м/рад. */
  function torsionalStiffness(Gs, Ip, l) { return Gs * Ip / l; }

  /** Двухмассовая модель гребной ветви: первая собственная частота.
   *  Масса редуктора считается неподвижной (её момент инерции на порядок
   *  больше винтового), поэтому ω = √(c/J). Присоединённая масса воды
   *  учитывается коэффициентом kw к моменту инерции винта. */
  function torsionalMode(c, Jprop, kw) {
    var J = Jprop * (1 + (kw === undefined ? 0.25 : kw));
    var om = Math.sqrt(c / J);
    var f = om / (2 * Math.PI);
    return { J: J, omega: om, fHz: f, fCpm: f * 60 };
  }

  /** Частота вращения, при которой возбуждение порядка k попадает в резонанс. */
  function criticalSpeed(fCpm, order) { return fCpm / order; }

  /* ==================================================================
   *  5. ДВИГАТЕЛЬ: МОЩНОСТЬ, ДАВЛЕНИЯ, КПД
   * ================================================================== */

  /** Рабочий объём одного цилиндра, м³. */
  function cylinderVolume(bore, stroke) {
    return Math.PI * bore * bore / 4 * stroke;
  }

  /** Мощность по среднему давлению, кВт.
   *  N = p·V_h·i·n / (30·τ);  p в Па, V_h в м³, n в об/мин. */
  function powerByMep(p, Vh, i, n, tact) {
    return p * Vh * i * n / (30 * tact) / 1000;
  }

  /** Обратная задача: среднее давление по мощности, Па. */
  function mepByPower(N, Vh, i, n, tact) {
    return N * 1000 * 30 * tact / (Vh * i * n);
  }

  /** Среднее индикаторное давление по площади индикаторной диаграммы, Па.
   *  p_i = m·F/l, где m — масштаб пружины (Па/мм), F — площадь (мм²),
   *  l — длина диаграммы (мм). */
  function mepFromCard(area, length, scale) { return scale * area / length; }

  /** Эффективная мощность из индикаторной и обратно через механический КПД. */
  function effectiveFromIndicated(Ni, etaM) { return Ni * etaM; }
  function indicatedFromEffective(Ne, etaM) { return Ne / etaM; }

  /** Средняя скорость поршня, м/с. */
  function pistonSpeed(stroke, n) { return stroke * n / 30; }

  /** Литровая мощность, кВт/л. */
  function litrePower(Ne, Vh, i) { return Ne / (Vh * 1000 * i); }

  /** Эффективный КПД по удельному расходу: η = 3,6·10⁶/(g_e·Q_н). */
  function effEfficiency(ge, Qn) { return 3.6e6 / (ge * Qn); }

  /** Обратная задача: удельный расход по КПД, г/(кВт·ч). */
  function sfocFromEfficiency(eta, Qn) { return 3.6e6 / (eta * Qn); }

  /* Учебный типоразмерный ряд среднеоборотных двигателей — тот же, по
     которому выбирали двигатель на /design/p-power: одна размерность
     цилиндра 240/300 мм, 900 об/мин, мощность набирается числом цилиндров
     по 220 кВт на цилиндр. Каталоги заводов устроены так же. */
  var ENGINES = [
    { cyl: 6, Ne: 1320, n: 900 },
    { cyl: 8, Ne: 1760, n: 900 },
    { cyl: 9, Ne: 1980, n: 900 },
    { cyl: 12, Ne: 2640, n: 900 },
    { cyl: 16, Ne: 3520, n: 900 }
  ];

  /** Наименьший двигатель ряда, покрывающий потребную мощность с запасом
   *  не меньше minSpare. Запас нужен потому, что потребная мощность сама
   *  посчитана с погрешностью: коэффициенты сопротивления и КПД винта
   *  известны хуже чем на 5 %, и двигатель, покрывающий потребную «впритык»,
   *  на сдаточных испытаниях может не дать контрактной скорости.
   *  Нижняя граница 5 % — учебная. */
  function pickEngine(required, catalog, minSpare) {
    var cat = catalog || ENGINES;
    var ms = (minSpare === undefined) ? 0.05 : minSpare;
    for (var i = 0; i < cat.length; i++) {
      var sp = (cat[i].Ne - required) / required;
      if (sp >= ms) return { engine: cat[i], spare: sp };
    }
    return { engine: null, spare: NaN };
  }

  /** Полная сводка по двигателю установки. */
  function engineSummary(pl, ed) {
    var p = pl || PLANT, e = ed || EDU;
    var Vh = cylinderVolume(p.bore, p.stroke);
    var pe = mepByPower(p.Ne, Vh, p.cyl, p.nEng, p.tact);
    var Ni = p.Ne / e.etaM;
    var pi = pe / e.etaM;
    var etaE = effEfficiency(p.ge, FUEL.Qn);
    return {
      Vh: Vh, VhLitre: Vh * 1000, Vtotal: Vh * p.cyl,
      pe: pe, peMPa: pe / 1e6, pi: pi, piMPa: pi / 1e6,
      Ni: Ni, Nmech: Ni - p.Ne,
      cm: pistonSpeed(p.stroke, p.nEng),
      litre: litrePower(p.Ne, Vh, p.cyl),
      etaE: etaE, etaI: etaE / e.etaM,
      Bh: p.ge * p.Ne / 1e6,            // т/ч
      Mflange: torque(p.Ne, p.nEng),
      Mprop: torque(p.Ne, p.nEng / p.iGear),
      nProp: p.nEng / p.iGear
    };
  }

  /* ==================================================================
   *  6. ТЕПЛОВОЙ БАЛАНС
   * ================================================================== */

  /** Тепловой баланс двигателя. Доли задаются, полезная работа и
   *  остаточные потери вычисляются — баланс сходится по построению. */
  function heatBalance(Ne, ge, Qn, share) {
    var Bs = ge * Ne / 1000 / 3600;          // кг/с
    var Q1 = Bs * Qn;                        // кВт
    var items = [];
    var sum = Ne;
    var keys = ['gas', 'water', 'oil', 'air'];
    var names = { gas: 'с выпускными газами', water: 'в охлаждающую воду',
                  oil: 'в масло', air: 'в наддувочный воздух' };
    keys.forEach(function (k) {
      var q = share[k] * Q1;
      items.push({ key: k, name: names[k], share: share[k], Q: q });
      sum += q;
    });
    var rest = Q1 - sum;
    items.push({ key: 'rest', name: 'остаточные (излучение, неполнота сгорания)',
                 share: rest / Q1, Q: rest });
    return { Bs: Bs, Bh: Bs * 3600, Q1: Q1, Ne: Ne, etaE: Ne / Q1,
             items: items, rest: rest };
  }

  /** Расход выпускных газов, кг/с: G = B·(1 + λ·L₀). */
  function gasFlow(Bs, lambda, L0) { return Bs * (1 + lambda * L0); }

  /** Температура газов из теплоты, унесённой ими. */
  function gasTemperature(Qgas, Gg, cp, t0) { return t0 + Qgas / (Gg * cp); }

  /** Расход теплоносителя по снимаемой теплоте, кг/с: G = Q/(c·Δt). */
  function coolantFlow(Q, c, dt) { return Q / (c * dt); }

  /** Объёмный расход, м³/ч, из массового в кг/с. */
  function volumeFlow(kgPerSecond, rho) { return kgPerSecond / rho * 3600; }

  /* ==================================================================
   *  7. ТОПЛИВО, ЗАПАСЫ, ЦИСТЕРНЫ
   * ================================================================== */

  /** Часовой расход, т/ч, при N в кВт и g в г/(кВт·ч). */
  function fuelRate(N, g) { return N * g / 1e6; }

  /** Ходовое время рейса, ч. */
  function voyageHours(range, v) { return range / v; }

  /** Запас топлива на рейс с нормативным коэффициентом. */
  function voyageFuel(o) {
    var hours = voyageHours(o.range, o.v);
    var main = fuelRate(o.kMCR * o.Ne, o.ge) * hours;
    var aux = fuelRate(o.Ndg, o.gdg) * hours;
    var net = main + aux;
    return { hours: hours, main: main, aux: aux, net: net,
             total: net * o.kres, lube: net * o.kres * 0.03 };
  }

  /** Объём цистерн, м³. */
  function tankVolume(mass, rho, kFill) { return mass / rho / kFill; }

  /* ==================================================================
   *  8. УТИЛИЗАЦИЯ ТЕПЛА
   * ================================================================== */

  /** Утилизационный котёл: теплота, снятая с газов, и паропроизводительность.
   *  Температура за котлом ограничена точкой росы серной кислоты. */
  function wasteHeatBoiler(o) {
    var Q = o.Gg * o.cp * (o.tGas - o.tStack);           // кВт
    var D = Q * o.etaBoiler / (o.iSteam - o.iFeed);      // кг/с
    return { Q: Q, D: D, Dh: D * 3600 };
  }

  /** Топливо, которое сжёг бы вспомогательный котёл вместо утилизационного. */
  function boilerFuel(Dh, iSteam, iFeed, Qn, etaBoiler) {
    var Q = Dh / 3600 * (iSteam - iFeed);                // кВт
    return { Q: Q, kgPerHour: Q / (Qn * etaBoiler) * 3600 };
  }

  /** Валогенератор против дизель-генератора: сравнение по расходу топлива.
   *  Валогенератор отбирает мощность от ГД через редуктор, поэтому расход
   *  считается по удельному расходу главного двигателя. */
  function shaftGeneratorCompare(o) {
    var shaftPower = o.Pel / (o.etaGen * o.etaPTO);
    var pto = shaftPower * o.ge / 1000;      // кг/ч
    var dg = o.Pel * o.gdgPart / 1000;       // кг/ч
    return { shaftPower: shaftPower, ptoFuel: pto, dgFuel: dg,
             save: dg - pto, savePct: (dg - pto) / dg * 100 };
  }

  /* ==================================================================
   *  9. ПУСКОВОЙ ВОЗДУХ
   *
   *  Правила РС, часть VII: запас воздуха должен обеспечивать без
   *  пополнения не менее шести пусков нереверсивного главного двигателя
   *  (двенадцати — реверсивного), а компрессоры — заполнение баллонов от
   *  атмосферного до рабочего давления примерно за час.
   * ================================================================== */

  function startingAir(o) {
    var Vair = o.q * o.Vtotal * o.starts;                    // м³ при н. у.
    var Vb = Vair * PATM / (o.pBottle - o.pMin);             // м³ ёмкости
    var free = Vb * (o.pBottle - PATM) / PATM;               // м³ н. у. на зарядку
    return { Vair: Vair, Vbottles: Vb, freeAir: free,
             compressor: free / (o.fillHours || 1) };
  }

  /** Давление в баллонах после каждого пуска, Па. Один пуск забирает
   *  q·ΣV_h кубометров воздуха при нормальных условиях; в баллонах ёмкостью
   *  V это снижает давление на q·ΣV_h·p_атм/V. */
  function startingAirResidual(o) {
    var perStart = o.q * o.Vtotal * PATM / o.volume;         // Па за пуск
    var p = o.pBottle, out = [];
    for (var i = 0; i < o.starts; i++) { p -= perStart; out.push(p); }
    return { drop: perStart, pressures: out,
             starts: Math.floor((o.pBottle - o.pMin) / perStart) };
  }

  /* ==================================================================
   * 10. СУДОВАЯ ЭЛЕКТРОСТАНЦИЯ
   * ================================================================== */

  /* Таблица потребителей судна сквозного примера. Для каждой строки —
     установленная мощность и коэффициенты загрузки по режимам:
     hod — ходовой, man — маневренный, port — стояночный с грузовыми
     операциями, em — аварийный (питание от аварийного дизель-генератора). */
  var LOADS = [
    { n: 'Насос забортной воды системы охлаждения', P: 22.0, k: { hod: 0.85, man: 0.85, port: 0.00, em: 0.00 } },
    { n: 'Насос пресной воды контура ЦПГ',          P: 15.0, k: { hod: 0.85, man: 0.85, port: 0.00, em: 0.00 } },
    { n: 'Масляный насос главного двигателя',       P: 18.5, k: { hod: 0.80, man: 0.80, port: 0.00, em: 0.00 } },
    { n: 'Топливоподкачивающий насос',              P: 3.0,  k: { hod: 0.70, man: 0.70, port: 0.00, em: 0.00 } },
    { n: 'Сепараторы топлива и масла',              P: 5.5,  k: { hod: 0.75, man: 0.75, port: 0.75, em: 0.00 } },
    { n: 'Компрессор пускового воздуха',            P: 11.0, k: { hod: 0.15, man: 0.15, port: 0.15, em: 0.00 } },
    { n: 'Вентиляторы машинного отделения',         P: 30.0, k: { hod: 0.80, man: 0.80, port: 0.00, em: 0.00 } },
    { n: 'Рулевая машина',                          P: 7.5,  k: { hod: 0.30, man: 0.80, port: 0.00, em: 1.00 } },
    { n: 'Подруливающее устройство',                P: 150.0, k: { hod: 0.00, man: 0.90, port: 0.00, em: 0.00 } },
    { n: 'Брашпиль и швартовные лебёдки',           P: 44.0, k: { hod: 0.00, man: 0.50, port: 0.00, em: 0.00 } },
    { n: 'Вентиляция грузовых трюмов',              P: 22.0, k: { hod: 0.00, man: 0.00, port: 1.00, em: 0.00 } },
    { n: 'Освещение и бытовые потребители',         P: 25.0, k: { hod: 0.70, man: 0.70, port: 0.90, em: 0.48 } },
    { n: 'Камбуз',                                  P: 30.0, k: { hod: 0.30, man: 0.30, port: 0.50, em: 0.00 } },
    { n: 'Навигация, связь и авральная сигнализация', P: 8.0, k: { hod: 0.80, man: 0.80, port: 0.40, em: 0.63 } },
    { n: 'Санитарный и пожарный насосы',            P: 11.0, k: { hod: 0.20, man: 0.20, port: 0.30, em: 1.00 } },
    { n: 'Холодильная машина провизионных камер',   P: 7.5,  k: { hod: 0.60, man: 0.60, port: 0.60, em: 0.00 } },
    { n: 'Шлюпочная лебёдка и приводы закрытий',    P: 10.0, k: { hod: 0.00, man: 0.00, port: 0.00, em: 1.00 } }
  ];

  var MODES = [
    { key: 'hod',  name: 'ходовой' },
    { key: 'man',  name: 'маневренный' },
    { key: 'port', name: 'стояночный с грузовыми операциями' },
    { key: 'em',   name: 'аварийный' }
  ];

  /** Расчётная нагрузка по режиму: Σ P·k_з. */
  function modeLoad(loads, mode) {
    var rows = [], P = 0;
    (loads || LOADS).forEach(function (r) {
      var k = r.k[mode] || 0;
      if (k <= 0) return;
      var p = r.P * k;
      rows.push({ n: r.n, P: r.P, k: k, load: p });
      P += p;
    });
    return { rows: rows, P: P };
  }

  /** Полная мощность и ток трёхфазной сети. */
  function apparentPower(P, cosPhi, U) {
    var S = P / cosPhi;
    return { S: S, Q: Math.sqrt(Math.max(0, S * S - P * P)),
             I: S * 1000 / (Math.sqrt(3) * U) };
  }

  /** Сколько генераторов нужно и с какой загрузкой (не выше kMax). */
  function pickGenerators(P, unit, count, kMax) {
    var need = Math.ceil(P / (unit * (kMax || 0.90)));
    var run = Math.min(Math.max(need, 1), count);
    return { running: run, load: P / (run * unit),
             enough: run * unit * (kMax || 0.90) >= P,
             reserve: (count - run) * unit };
  }

  /** Провал напряжения при прямом пуске асинхронного двигателя.
   *  ΔU/U = I_п·x_d'' / (S_ген/(√3·U) + I_п·x_d''); упрощённая оценка. */
  function startingDip(o) {
    var Istart = o.P * 1000 / (Math.sqrt(3) * o.U * o.cos * o.eta) * o.kStart;
    var Igen = o.Sgen * 1000 / (Math.sqrt(3) * o.U);
    var rel = Istart * o.xd / (Igen + Istart * o.xd);
    return { Istart: Istart, Igen: Igen, dip: rel, residual: 1 - rel };
  }

  /* ==================================================================
   * 11. КАБЕЛЬНАЯ ЛИНИЯ
   * ================================================================== */

  /* Учебная таблица длительно допустимых токов медных судовых кабелей
     с изоляцией на 85 °C, мм² → А. Для проектных расчётов пользуются
     таблицами действующей редакции Правил РС, часть XI. */
  var CABLE_TAB = [
    [1.5, 23], [2.5, 30], [4, 40], [6, 52], [10, 72], [16, 94], [25, 125],
    [35, 155], [50, 190], [70, 240], [95, 290], [120, 335], [150, 385],
    [185, 435], [240, 510]
  ];
  var RHO_CU = 0.0175;   // Ом·мм²/м, медь при расчётной температуре
  var C_CU = 141;        // А·с^0,5/мм², термическая стойкость медной жилы

  /** Расчётный ток потребителя, А. */
  function loadCurrent(P, U, cosPhi, eta, phases) {
    return P * 1000 / ((phases === 1 ? U : Math.sqrt(3) * U) * cosPhi * eta);
  }

  function nextSection(s, tab) {
    var t = tab || CABLE_TAB;
    for (var i = 0; i < t.length; i++) if (t[i][0] >= s) return t[i][0];
    return null;
  }

  /** Выбор сечения по трём условиям; решает наибольшее. */
  function cableSection(o) {
    var tab = o.tab || CABLE_TAB;
    var I = loadCurrent(o.P, o.U, o.cos, o.eta, o.phases);
    var heat = null, heatI = 0;
    for (var i = 0; i < tab.length; i++) {
      if (tab[i][1] * o.k1 * o.k2 >= I) {
        heat = tab[i][0]; heatI = tab[i][1] * o.k1 * o.k2; break;
      }
    }
    var dUallow = o.duPct / 100 * o.U;
    var sDrop = o.phases === 1
      ? 2 * RHO_CU * o.L * I / dUallow
      : Math.sqrt(3) * RHO_CU * o.L * I * o.cos / dUallow;
    var sTherm = o.Ik * Math.sqrt(o.tk) / C_CU;
    var cands = [
      { s: heat, why: 'нагрев' },
      { s: nextSection(sDrop, tab), why: 'потеря напряжения' },
      { s: nextSection(sTherm, tab), why: 'термическая стойкость' }
    ].filter(function (c) { return c.s; });
    var pick = cands.length ? cands.reduce(function (a, b) { return b.s > a.s ? b : a; }) : null;
    var dU = pick ? (o.phases === 1
      ? 2 * RHO_CU * o.L * I / pick.s
      : Math.sqrt(3) * RHO_CU * o.L * I * o.cos / pick.s) : NaN;
    return { I: I, heat: heat, heatI: heatI, dUallow: dUallow,
             sDrop: sDrop, sDropTab: nextSection(sDrop, tab),
             sTherm: sTherm, sThermTab: nextSection(sTherm, tab),
             pick: pick, dU: dU, dUpct: dU / o.U * 100 };
  }

  /** Согласование кабеля с защитой: уставка теплового расцепителя не ниже
   *  расчётного тока и не выше допустимого тока принятого сечения с
   *  поправками; отсечка — выше пускового тока с запасом. */
  function breakerSettings(o) {
    var tab = o.tab || CABLE_TAB;
    var allow = 0;
    for (var i = 0; i < tab.length; i++) if (tab[i][0] === o.section) allow = tab[i][1];
    var upper = allow * o.k1 * o.k2;
    var rated = null;
    var ROW = [6, 10, 16, 25, 32, 50, 63, 80, 100, 125, 160, 200, 250, 300, 400, 630];
    for (var j = 0; j < ROW.length; j++) {
      if (ROW[j] >= o.I && ROW[j] <= upper) { rated = ROW[j]; break; }
    }
    var trip = o.Istart ? o.Istart * (o.kTrip || 1.25) : null;
    return { allowCorrected: upper, rated: rated, trip: trip,
             ok: rated !== null && (!trip || trip > (rated || 0)) };
  }

  /* ==================================================================
   * 12. ЦИКЛЫ: РЕНКИНА И БРАЙТОНА
   * ================================================================== */

  /** КПД цикла Карно по абсолютным температурам. */
  function carnot(Thot, Tcold) { return 1 - Tcold / Thot; }

  /** Термический КПД цикла Ренкина по энтальпиям.
   *  η_t = (h₁ − h₂)/(h₁ − h′); h₂ находится по степени сухости. */
  function rankine(o) {
    var x = (o.s1 - o.sf) / (o.sg - o.sf);
    var h2 = o.hf + x * o.r;
    var H0 = o.h1 - h2;
    var q1 = o.h1 - o.hf;
    var etaT = H0 / q1;
    var etaE = etaT * o.etaOi * o.etaBoiler * o.etaPipe * o.etaMech * o.etaGear;
    return { x: x, h2: h2, H0: H0, q1: q1, etaT: etaT, etaE: etaE,
             ge: sfocFromEfficiency(etaE, FUEL.Qn) };
  }

  /** Цикл Брайтона: температуры и КПД с учётом КПД машин.
   *  T₂ид = T₁·π^((k−1)/k); действительная T₂ = T₁ + (T₂ид − T₁)/η_к. */
  function brayton(o) {
    var m = (o.k - 1) / o.k;
    var pr = Math.pow(o.pi, m);
    var T1 = o.t1 + 273.15, T3 = o.t3 + 273.15;
    var T2s = T1 * pr, T2 = T1 + (T2s - T1) / o.etaComp;
    var T4s = T3 / pr, T4 = T3 - (T3 - T4s) * o.etaTurb;
    var lT = o.cp * (T3 - T4), lC = o.cp * (T2 - T1);
    var l = lT - lC, q = o.cp * (T3 - T2);
    return { T1: T1, T2s: T2s, T2: T2, T3: T3, T4s: T4s, T4: T4,
             lTurb: lT, lComp: lC, l: l, q: q, etaT: l / q,
             etaIdeal: 1 - 1 / pr, work: lC / lT };
  }

  /* ==================================================================
   * 12а. НАДЁЖНОСТЬ
   *
   *  Экспоненциальный закон надёжности — модель периода нормальной
   *  эксплуатации, когда интенсивность отказов постоянна; приработка и
   *  износ им не описываются.
   * ================================================================== */

  /** Вероятность безотказной работы за время t при постоянной λ. */
  function reliabilityExp(lambda, t) { return Math.exp(-lambda * t); }

  /** Наработка на отказ при постоянной интенсивности отказов. */
  function mtbf(lambda) { return 1 / lambda; }

  /** Интенсивность отказов по вероятности безотказной работы за время t. */
  function failureRate(P, t) { return -Math.log(P) / t; }

  /** Последовательное соединение: отказ любого элемента — отказ системы. */
  function reliabilitySeries(ps) {
    return ps.reduce(function (a, p) { return a * p; }, 1);
  }

  /** Параллельное соединение (резервирование): отказ только при отказе всех. */
  function reliabilityParallel(ps) {
    return 1 - ps.reduce(function (a, p) { return a * (1 - p); }, 1);
  }

  /** Коэффициент готовности: доля времени, когда объект работоспособен. */
  function availability(T0, Tv) { return T0 / (T0 + Tv); }

  /* ==================================================================
   * 13. ВЫБРОСЫ, EEDI, CII
   * ================================================================== */

  /** Массовый выброс SO₂: вся сера топлива окисляется, 32 → 64 г/моль. */
  function so2(Bkg, sulphurPct) { return Bkg * sulphurPct / 100 * 2; }

  /** Массовый выброс CO₂ по коэффициенту C_F (МАРПОЛ VI). */
  function co2(Bkg, CF) { return Bkg * CF; }

  /** Предельный выброс NO_x, г/(кВт·ч), по МАРПОЛ VI, правило 13. */
  function noxLimit(n, tier) {
    if (n < 130) return tier === 3 ? 3.4 : (tier === 2 ? 14.4 : 17.0);
    if (n >= 2000) return tier === 3 ? 2.0 : (tier === 2 ? 7.7 : 9.8);
    if (tier === 3) return 9.0 * Math.pow(n, -0.2);
    if (tier === 2) return 44.0 * Math.pow(n, -0.23);
    return 45.0 * Math.pow(n, -0.2);
  }

  /** Достигнутый EEDI, г CO₂/(т·миля) — упрощённая формула без поправочных
   *  коэффициентов f и без вспомогательных источников энергии. */
  function eediAttained(o) {
    var me = o.Pme * o.SFCme * o.CF;
    var ae = o.Pae * o.SFCae * o.CFae;
    return { me: me, ae: ae, num: me + ae,
             eedi: (me + ae) / (o.capacity * o.vref) };
  }

  /** Линия отсчёта EEDI: a·DWT^(−c). Для сухогрузов общего назначения
   *  a = 107,48, c = 0,216 (резолюция МЕРС.203(62) с поправками). */
  function eediReference(dwt, a, c) { return a * Math.pow(dwt, -c); }

  /** Коэффициент снижения по фазам с линейной интерполяцией в диапазоне
   *  dwtLow…dwtHigh — так он задан для сухогрузов общего назначения. */
  function eediReduction(dwt, full, dwtLow, dwtHigh) {
    if (dwt >= dwtHigh) return full;
    if (dwt <= dwtLow) return 0;
    return full * (dwt - dwtLow) / (dwtHigh - dwtLow);
  }

  /** Эксплуатационный показатель CII, г CO₂/(т·миля). */
  function ciiAttained(fuelTons, CF, dwt, miles) {
    return fuelTons * CF * 1e6 / (dwt * miles);
  }
  function ciiReference(dwt, a, c) { return a * Math.pow(dwt, -c); }

  /* ==================================================================
   * 14. САМОПРОВЕРКА
   *
   *  Контрольные точки посчитаны независимо от кода: аналитически,
   *  обращением формулы либо сверкой с числом соседнего сайта кластера.
   * ================================================================== */

  function near(a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol; }

  function selftest() {
    var bad = [];
    function chk(name, got, want, tol) {
      if (!near(got, want, tol)) {
        bad.push(name + ': получено ' + (isFinite(got) ? got.toFixed(6) : got)
          + ', ожидалось ' + want + ' ± ' + tol);
      }
    }

    /* --- ходкость: числа опубликованы на /design/p-power --- */
    var ch = resistanceChain(EDU.eta0design);
    chk('смоченная поверхность (Мамфорд, /design)', ch.S, 2254.2, 0.1);
    chk('коэффициент трения ITTC-57 (/design)', ch.CF, 1.6544e-3, 1e-6);
    chk('полное сопротивление (/design)', ch.R.RT, 146.04, 0.02);
    chk('буксировочная мощность (/design)', ch.R.PE, 939.1, 0.1);
    chk('попутный поток по Тейлору (/design)', ch.P.w, 0.320, 1e-9);
    chk('пропульсивный коэффициент (/design)', ch.P.etaD, 0.6000, 1e-4);
    chk('мощность на валу (/design)', ch.P.PS, 1597.2, 0.1);
    chk('потребная мощность (/design)', ch.P.required, 1836.7, 0.1);

    /* Обратимость: адмиралтейский коэффициент, посчитанный по мощности,
       должен вернуть эту же мощность. */
    var Cadm = admiraltyCoef(SHIP.disp, SHIP.v, 1597.2);
    chk('обратимость адмиралтейского коэффициента',
      admiraltyPower(SHIP.disp, SHIP.v, Cadm), 1597.2, 1e-6);

    /* --- винт --- */
    var Th = ch.thrust * 1000;
    var ns = PLANT.nEng / PLANT.iGear / 60;
    var pr = propellerDesign({ Th: Th, v: ch.v, va: ch.va, Dp: PLANT.Dp,
      ns: ns, Z: PLANT.Z });
    /* Обращение: шаг назначен через кажущееся скольжение, значит обратный
       счёт скольжения по шагу обязан вернуть исходные 0,20. */
    chk('обратимость кажущегося скольжения',
      slipApparent(ch.v, pr.pitch, ns), EDU.slipDesign, 1e-12);
    /* Угол атаки сечения обязан лежать в разумных пределах — иначе шаг и
       гидродинамика расходятся и винт спроектирован неверно. */
    if (!(pr.alphaDeg > 2 && pr.alphaDeg < 7)) {
      bad.push('угол атаки сечения 0,7R вышел за 2…7°: ' + pr.alphaDeg.toFixed(2));
    }
    /* Тождество: η₀ = (J/2π)·K_T/K_Q — K_Q получен из η₀, значит обращение
       обязано вернуть исходное η₀ с машинной точностью. */
    chk('обращение η₀ через K_T/K_Q',
      pr.J / (2 * Math.PI) * pr.KT / pr.KQ, pr.eta0, 1e-12);
    /* Идеальный КПД не может быть меньше действительного. */
    if (!(pr.etaIdeal > pr.eta0)) {
      bad.push('η₀ = ' + pr.eta0.toFixed(4) + ' не меньше идеального '
        + pr.etaIdeal.toFixed(4));
    }
    /* Мощность, снятая с винта через момент, равна упору на скорость,
       делённому на КПД: два независимых пути к одной величине. */
    chk('упор × скорость = η₀ × мощность на винте',
      pr.PD0 * pr.eta0, Th * ch.va, 1e-6);
    /* Критерий Келлера: при вдвое большем упоре требуемое дисковое
       отношение растёт ровно на удвоенную нагрузочную часть. */
    var k1 = kellerArea(Th, 4, 4.2, 3.0), k2 = kellerArea(2 * Th, 4, 4.2, 3.0);
    chk('линейность критерия Келлера по упору',
      k2.AeA0 - 0.20, 2 * (k1.AeA0 - 0.20), 1e-12);

    /* --- валопровод --- */
    /* Обращение: диаметр, найденный по [τ], должен дать ровно [τ]. */
    var d = shaftDiameter(105050, 40);
    chk('обратимость диаметра вала', shear(105050, polarModulus(d)), 40, 1e-9);
    /* Полый вал с α = 0: момент сопротивления совпадает со сплошным. */
    chk('полый вал при α = 0', polarModulus(0.24, 0), Math.PI * Math.pow(0.24, 3) / 16, 1e-15);
    /* Момент: 9550·N/n — та же величина, что 30000·N/(π·n). */
    /* Ходовой коэффициент 9550 — округление 30000/π = 9549,3, поэтому
       расхождение обязано быть меньше 0,01 %. */
    chk('крутящий момент через 9550', torque(1980, 900), 9550 * 1980 / 900, 2.0);
    /* Крутильная система: удвоение жёсткости поднимает частоту в √2 раза. */
    var m1 = torsionalMode(1e6, 1e4), m2 = torsionalMode(2e6, 1e4);
    chk('частота ~ √жёсткости', m2.fHz / m1.fHz, Math.SQRT2, 1e-12);

    /* Полый вал равной прочности: подстановка найденного диаметра обратно
       обязана вернуть исходное допускаемое напряжение. */
    var dh = shaftDiameter(105050, 40, 0.4);
    chk('обратимость диаметра полого вала',
      shear(105050, polarModulus(dh, 0.4)), 40, 1e-9);
    if (!(dh > d)) bad.push('полый вал равной прочности вышел тоньше сплошного');

    /* --- надёжность --- */
    /* Последовательное соединение одинаковых элементов: P = p^n. */
    chk('последовательное соединение', reliabilitySeries([0.9, 0.9, 0.9]),
      Math.pow(0.9, 3), 1e-15);
    /* Резервирование двух одинаковых: отказ = q². */
    chk('параллельное соединение', 1 - reliabilityParallel([0.98, 0.98]),
      0.02 * 0.02, 1e-15);
    /* Обращение: интенсивность отказов, найденная по вероятности, должна
       вернуть эту же вероятность. */
    var lam = failureRate(0.991, 320);
    chk('обратимость экспоненциального закона', reliabilityExp(lam, 320), 0.991, 1e-12);
    chk('наработка на отказ', mtbf(lam) * lam, 1, 1e-12);
    chk('коэффициент готовности', availability(1000, 0), 1, 1e-15);

    /* --- двигатель --- */
    var es = engineSummary();
    /* Обращение: мощность, посчитанная по найденному p_e, равна исходной. */
    chk('обратимость среднего эффективного давления',
      powerByMep(es.pe, es.Vh, PLANT.cyl, PLANT.nEng, PLANT.tact), PLANT.Ne, 1e-9);
    chk('средняя скорость поршня', es.cm, 9.0, 1e-9);
    chk('эффективный КПД по g_e = 195', es.etaE, 0.43235, 1e-5);
    /* Обращение: удельный расход по КПД возвращает исходный g_e. */
    chk('обратимость удельного расхода',
      sfocFromEfficiency(es.etaE, FUEL.Qn), PLANT.ge, 1e-9);

    /* Выбор двигателя обязан совпасть с выбором /design/p-power: по
       потребной 1836,7 кВт — девятицилиндровый 1980 кВт с запасом 7,8 %. */
    var pk = pickEngine(1836.7);
    if (!pk.engine || pk.engine.Ne !== 1980) {
      bad.push('по потребной 1836,7 кВт выбран не тот двигатель: '
        + (pk.engine ? pk.engine.Ne : 'нет'));
    }
    chk('запас двигателя по /design', pk.spare * 100, 7.8, 0.05);
    /* По уточнённой потребной 1719,9 кВт двигатель тот же — это и есть
       проверка того, что уточнение расчёта не меняет решения. */
    if (pickEngine(1719.9).engine.Ne !== 1980) {
      bad.push('уточнённый расчёт сменил двигатель — сквозной пример разошёлся');
    }

    /* --- тепловой баланс --- */
    var hb = heatBalance(PLANT.Ne, PLANT.ge, FUEL.Qn, HEAT_SHARE);
    var sum = PLANT.Ne;
    hb.items.forEach(function (it) { sum += it.Q; });
    chk('сведение теплового баланса', sum, hb.Q1, 1e-6);
    chk('эффективный КПД из баланса', hb.etaE, es.etaE, 1e-9);
    if (hb.rest <= 0) bad.push('остаточные потери вышли неположительными: ' + hb.rest);

    /* --- топливо --- */
    var vf = voyageFuel({ range: SHIP.range, v: SHIP.v, kMCR: PLANT.kMCR,
      Ne: PLANT.Ne, ge: PLANT.ge, Ndg: PLANT.Ndg, gdg: PLANT.gdg, kres: EDU.kres });
    chk('ходовое время рейса', vf.hours, 320.0, 1e-9);
    /* Число сверено с /design/p-power: прирост запасов при переходе от
       1764,9 кВт (адмиралтейский) к выбранным 1980 кВт составил 12,9 т. */
    chk('запас топлива на рейс', vf.total, 124.39, 0.02);

    /* --- электростанция --- */
    var hod = modeLoad(LOADS, 'hod');
    /* Ходовая нагрузка обязана совпасть с той, что принята на /design/p-mass
       при расчёте запасов (N_дг = 120 кВт) — иначе сквозной пример рвётся. */
    chk('ходовая нагрузка = N_дг сайта проектирования', hod.P, PLANT.Ndg, 0.1);
    var ap = apparentPower(100, 0.8, 400);
    chk('реактивная мощность при cos φ = 0,8', ap.Q, 75.0, 1e-9);

    /* --- кабель --- */
    /* Обращение: на выбранном сечении фактическая потеря обязана быть не
       больше допустимой. */
    var cb = cableSection({ P: 150, U: 400, cos: 0.85, eta: 0.92, phases: 3,
      L: 60, k1: 1.0, k2: 0.70, duPct: 6, Ik: 6000, tk: 0.1 });
    if (!(cb.dU <= cb.dUallow)) {
      bad.push('потеря напряжения ' + cb.dU.toFixed(2) + ' В превысила допуск '
        + cb.dUallow.toFixed(2) + ' В');
    }

    /* --- циклы --- */
    /* КПД Карно между одинаковыми температурами равен нулю. */
    chk('Карно при равных температурах', carnot(500, 500), 0, 1e-15);
    /* Идеальный Брайтон (η машин = 1) должен совпасть с 1 − π^−m. */
    var br = brayton({ pi: 18, t1: 15, t3: 1200, k: 1.4, cp: 1.005,
      etaComp: 1, etaTurb: 1 });
    chk('идеальный цикл Брайтона', br.etaT, br.etaIdeal, 1e-12);

    /* --- выбросы --- */
    chk('SO₂ при 1 % серы', so2(100, 1.0), 2.0, 1e-12);
    /* Предел Tier II на границе диапазона n = 130 об/мин должен смыкаться
       с постоянной ветвью 14,4 г/(кВт·ч) с точностью долей процента. */
    chk('смыкание ветвей Tier II на 130 об/мин', noxLimit(130, 2), 14.4, 0.15);
    /* Интерполяция коэффициента снижения EEDI: на верхней границе — полное
       значение, на нижней — ноль, в середине — половина. */
    chk('интерполяция снижения EEDI (верх)', eediReduction(15000, 0.30, 3000, 15000), 0.30, 1e-15);
    chk('интерполяция снижения EEDI (низ)', eediReduction(3000, 0.30, 3000, 15000), 0, 1e-15);
    chk('интерполяция снижения EEDI (середина)', eediReduction(9000, 0.30, 3000, 15000), 0.15, 1e-15);

    return bad;
  }

  /* ================================================================== */

  return {
    /* постоянные */
    G: G, RHO_SW: RHO_SW, RHO_AIR: RHO_AIR, NU_SW: NU_SW, KN: KN,
    PATM: PATM, PV_WATER: PV_WATER, RHO_CU: RHO_CU, C_CU: C_CU,
    /* данные */
    SHIP: SHIP, PLANT: PLANT, FUEL: FUEL, EDU: EDU, SERVICE: SERVICE,
    HEAT_SHARE: HEAT_SHARE,
    LOADS: LOADS, MODES: MODES, CABLE_TAB: CABLE_TAB,
    /* ходкость */
    knots: knots, volume: volume, wettedSurface: wettedSurface,
    reynolds: reynolds, cFriction: cFriction, resistance: resistance,
    wakeTaylor: wakeTaylor, propulsion: propulsion,
    resistanceChain: resistanceChain,
    admiraltyPower: admiraltyPower, admiraltyCoef: admiraltyCoef,
    similarityScale: similarityScale,
    /* винт */
    thrustLoading: thrustLoading, idealEfficiency: idealEfficiency,
    kellerArea: kellerArea, propellerDesign: propellerDesign,
    slipApparent: slipApparent,
    /* валопровод */
    torque: torque, polarModulus: polarModulus, polarInertia: polarInertia,
    shaftDiameter: shaftDiameter, shaftDiameterRules: shaftDiameterRules,
    inertiaOfMass: inertiaOfMass, gearedSpeed: gearedSpeed,
    shear: shear, twist: twist, torsionalStiffness: torsionalStiffness,
    torsionalMode: torsionalMode, criticalSpeed: criticalSpeed,
    /* двигатель */
    cylinderVolume: cylinderVolume, powerByMep: powerByMep,
    mepByPower: mepByPower, mepFromCard: mepFromCard,
    pistonSpeed: pistonSpeed, litrePower: litrePower,
    effectiveFromIndicated: effectiveFromIndicated,
    indicatedFromEffective: indicatedFromEffective,
    effEfficiency: effEfficiency, sfocFromEfficiency: sfocFromEfficiency,
    ENGINES: ENGINES, pickEngine: pickEngine, engineSummary: engineSummary,
    /* тепло */
    heatBalance: heatBalance, gasFlow: gasFlow,
    gasTemperature: gasTemperature, coolantFlow: coolantFlow,
    volumeFlow: volumeFlow,
    /* топливо */
    fuelRate: fuelRate, voyageHours: voyageHours, voyageFuel: voyageFuel,
    tankVolume: tankVolume,
    /* утилизация */
    wasteHeatBoiler: wasteHeatBoiler, boilerFuel: boilerFuel,
    shaftGeneratorCompare: shaftGeneratorCompare,
    /* пусковой воздух */
    startingAir: startingAir, startingAirResidual: startingAirResidual,
    /* электростанция */
    modeLoad: modeLoad, apparentPower: apparentPower,
    pickGenerators: pickGenerators, startingDip: startingDip,
    /* кабель */
    loadCurrent: loadCurrent, nextSection: nextSection, cableSection: cableSection,
    breakerSettings: breakerSettings,
    /* циклы */
    carnot: carnot, rankine: rankine, brayton: brayton,
    /* надёжность */
    reliabilityExp: reliabilityExp, mtbf: mtbf, failureRate: failureRate,
    reliabilitySeries: reliabilitySeries, reliabilityParallel: reliabilityParallel,
    availability: availability,
    /* выбросы */
    so2: so2, co2: co2, noxLimit: noxLimit,
    eediAttained: eediAttained, eediReference: eediReference,
    eediReduction: eediReduction,
    ciiAttained: ciiAttained, ciiReference: ciiReference,
    /* самопроверка */
    selftest: selftest
  };
}));
