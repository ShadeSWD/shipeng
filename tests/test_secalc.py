# -*- coding: utf-8 -*-
"""Проверка расчётного ядра site/assets/secalc.js.

Модуль secalc.js — единственное место, где живут формулы разборов задач
(p-*.html) и живых калькуляторов. Ошибка в нём не поймается ни разбором HTML,
ни проверкой ссылок: страницы останутся валидными, а числа станут неверными.
Поэтому здесь проверяется сама арифметика, причём четырьмя независимыми
способами:

  * встроенная самопроверка SECALC.selftest() — контрольные точки, посчитанные
    аналитически либо обращением формулы;

  * пересчёт ключевых величин на Python по формулам, выписанным в этом файле
    заново, — так опечатка в JS не может «подтвердить сама себя»;

  * сверка с числами, опубликованными соседними сайтами кластера: цепочка
    ходкости обязана в точности воспроизвести /design/p-power, а ходовая
    нагрузка электростанции — совпасть с той, что /design/p-mass заложил в
    расчёт запасов топлива;

  * сверка чисел, напечатанных на страницах разборов, с тем, что выдаёт
    модуль: страница и ядро не должны разъезжаться.

Судно сквозного примера — тот же сухогруз 100,0 × 15,3 × 8,3 м, что на сайтах
«Проектирование судов» (/design/), «Технология судостроения» (/shiptech/) и
«Конструкция корпуса судов» (/hullstruct/).
"""
import json
import math
import os
import re
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECALC_JS = os.path.join(ROOT, 'site', 'assets', 'secalc.js')
SITE = os.path.join(ROOT, 'site')

pytestmark = [
    pytest.mark.skipif(not os.path.isfile(SECALC_JS), reason='нет site/assets/secalc.js'),
    pytest.mark.skipif(not shutil.which('node'), reason='node не установлен'),
]

#: постоянные, выписанные здесь заново (сверять с шапкой secalc.js)
G = 9.81
RHO_SW = 1025.0
RHO_AIR = 1.226
NU_SW = 1.1892e-6
KN = 0.5144444
PATM = 101325.0
PV = 1700.0

#: судно сквозного примера кластера
L, B, H, T, CB = 100.0, 15.3, 8.3, 6.60, 0.74
DISP, DWT = 7659.3, 4157.0
V_KN = 12.5
RANGE_NM, AUTO_D, CREW = 4000, 20, 14

#: установка
NE, N_ENG, CYL = 1980.0, 900.0, 9
BORE, STROKE, TACT = 0.240, 0.300, 4
GE, GDG = 195.0, 210.0
I_GEAR, DP, Z = 5.0, 4.2, 4
ETA_SHAFT, K_MCR, NDG = 0.98, 0.85, 120.0
QN, RHO_FUEL, CF_FUEL, L0 = 42700.0, 0.86, 3.206, 14.3

#: учебные коэффициенты
K1FORM, CA, CW, CAIR, AAIR, KAPP = 1.25, 0.4e-3, 0.45e-3, 0.8, 153.0, 0.03
T_SUCT, ETA_R, ETA0_DESIGN, SEA_MARGIN = 0.20, 1.02, 0.50, 0.15
ETA_M = 0.90
EPS_BLADE, KZ_BLADE, SLIP_DESIGN = 0.030, 0.80, 0.20
TAU_ALLOW, RM, G_STEEL, L_SHAFT = 40.0, 600.0, 8.1e10, 18.0
KRES, KFILL = 1.10, 0.95
LAMBDA, CP_GAS, T0, T_STACK = 2.2, 1.10, 15.0, 180.0


def sc(expr):
    """Выполнить выражение в node с загруженным модулем и вернуть результат."""
    src = 'const S = require(%s); console.log(JSON.stringify(%s));' % (
        json.dumps(SECALC_JS), expr)
    r = subprocess.run(['node', '-e', src], capture_output=True, text=True)
    assert r.returncode == 0, 'node упал: %s' % r.stderr.strip()[:500]
    return json.loads(r.stdout.strip())


# ------------------------------------------------------------ самопроверка

def test_selftest_passes():
    bad = sc('S.selftest()')
    assert bad == [], 'самопроверка модуля нашла расхождения:\n' + '\n'.join(bad)


def test_constants_match():
    got = sc('({G: S.G, RHO: S.RHO_SW, AIR: S.RHO_AIR, NU: S.NU_SW, '
             'KN: S.KN, PATM: S.PATM, PV: S.PV_WATER})')
    assert got['G'] == G and got['RHO'] == RHO_SW and got['AIR'] == RHO_AIR
    assert got['NU'] == NU_SW and got['KN'] == KN
    assert got['PATM'] == PATM and got['PV'] == PV


def test_ship_is_cluster_example():
    """Судно то же, что на /design/, /shiptech/ и /hullstruct/."""
    s = sc('S.SHIP')
    assert (s['L'], s['B'], s['H'], s['T'], s['delta']) == (L, B, H, T, CB)
    assert s['disp'] == DISP and s['dwt'] == DWT
    assert s['v'] == V_KN and s['range'] == RANGE_NM
    assert s['auto'] == AUTO_D and s['crew'] == CREW


def test_plant_matches_design_choice():
    """Двигатель — тот, что выбран на /design/p-power."""
    p = sc('S.PLANT')
    assert p['Ne'] == NE and p['nEng'] == N_ENG and p['cyl'] == CYL
    assert p['ge'] == GE and p['gdg'] == GDG and p['Ndg'] == NDG
    assert p['iGear'] == I_GEAR and p['Dp'] == DP and p['Z'] == Z


# ------------------------------------------------- 1. ходкость: пересчёт

def py_wetted(L_, T_, V_):
    return 1.7 * L_ * T_ + V_ / T_


def py_cf(re):
    return 0.075 / (math.log10(re) - 2) ** 2


def py_chain(eta0):
    """Вся цепочка ходкости, выписанная на Python заново."""
    v = V_KN * KN
    vol = CB * L * B * T
    s = py_wetted(L, T, vol)
    re = v * L / NU_SW
    cf = py_cf(re)
    qs = 0.5 * RHO_SW * v * v * s / 1000
    rv = (K1FORM * cf + CA) * qs
    rw = CW * qs
    rapp = KAPP * rv
    rair = 0.5 * RHO_AIR * CAIR * AAIR * v * v / 1000
    rt = rv + rw + rapp + rair
    pe = rt * v
    w = 0.5 * CB - 0.05
    eta_h = (1 - T_SUCT) / (1 - w)
    eta_d = eta_h * eta0 * ETA_R
    pd = pe / eta_d
    ps = pd / ETA_SHAFT
    return dict(S=s, Re=re, CF=cf, qS=qs, Rvisc=rv, Rw=rw, Rapp=rapp,
                Rair=rair, RT=rt, PE=pe, w=w, etaH=eta_h, etaD=eta_d,
                PD=pd, PS=ps, required=ps * (1 + SEA_MARGIN),
                thrust=rt / (1 - T_SUCT), va=v * (1 - w))


def test_wetted_surface_mumford():
    got = sc('S.wettedSurface(100.0, 6.60, S.volume(S.SHIP))')
    assert got == pytest.approx(py_chain(0.5)['S'], rel=1e-12)
    assert got == pytest.approx(2254.2, abs=0.05)   # число /design/p-power


def test_friction_ittc57():
    got = sc('S.cFriction(S.reynolds(S.knots(12.5), 100.0))')
    assert got == pytest.approx(py_chain(0.5)['CF'], rel=1e-12)
    assert got == pytest.approx(1.6544e-3, abs=1e-7)


@pytest.mark.parametrize('key,want,tol', [
    ('Rvisc', 117.90, 0.02), ('Rw', 21.50, 0.02), ('Rapp', 3.54, 0.02),
    ('Rair', 3.10, 0.02), ('RT', 146.04, 0.02), ('PE', 939.1, 0.1),
])
def test_resistance_components_match_design(key, want, tol):
    """Составляющие сопротивления обязаны совпасть с /design/p-power."""
    got = sc('S.resistanceChain(0.50).R')[key]
    assert got == pytest.approx(py_chain(0.5)[key], rel=1e-12)
    assert got == pytest.approx(want, abs=tol)


def test_propulsion_chain_reproduces_design():
    """Ключевая сверка кластера: /design довёл до 1836,7 кВт при η₀ = 0,50."""
    p = sc('S.resistanceChain(0.50).P')
    py = py_chain(ETA0_DESIGN)
    assert p['w'] == pytest.approx(0.320, abs=1e-9)
    assert p['etaH'] == pytest.approx(py['etaH'], rel=1e-12)
    assert p['etaD'] == pytest.approx(0.6000, abs=1e-4)
    assert p['PD'] == pytest.approx(1565.2, abs=0.1)
    assert p['PS'] == pytest.approx(1597.2, abs=0.1)
    assert p['required'] == pytest.approx(1836.7, abs=0.1)


def test_wake_taylor_is_a_line():
    """w = 0,5δ − 0,05: проверяем на двух точках, что это прямая."""
    a, b = sc('S.wakeTaylor(0.60)'), sc('S.wakeTaylor(0.80)')
    assert a == pytest.approx(0.25, abs=1e-12)
    assert b == pytest.approx(0.35, abs=1e-12)
    assert sc('S.wakeTaylor(0.70)') == pytest.approx((a + b) / 2, abs=1e-12)


def test_admiralty_round_trip():
    c = sc('S.admiraltyCoef(7659.3, 12.5, 1597.2)')
    assert sc('S.admiraltyPower(7659.3, 12.5, %r)' % c) == pytest.approx(1597.2, rel=1e-12)


# --------------------------------------------------------------- 2. винт

def py_propeller(th, v, va, dp, ns):
    a0 = math.pi * dp * dp / 4
    ct = th / (0.5 * RHO_SW * va * va * a0)
    a = (math.sqrt(1 + ct) - 1) / 2
    eta_id = 1 / (1 + a)
    j = va / (ns * dp)
    tan_b = j / (0.7 * math.pi)
    tan_bi = tan_b * (1 + a)
    eta_prof = (1 - EPS_BLADE / tan_bi) / (1 + EPS_BLADE * tan_bi)
    eta0 = eta_id * eta_prof * KZ_BLADE
    kt = th / (RHO_SW * ns * ns * dp ** 4)
    kq = j * kt / (2 * math.pi * eta0)
    pitch = v / ((1 - SLIP_DESIGN) * ns)
    return dict(CT=ct, a=a, etaIdeal=eta_id, J=j, etaProf=eta_prof,
                eta0=eta0, KT=kt, KQ=kq, PoD=pitch / dp, pitch=pitch)


def test_propeller_design_matches_python():
    ch = sc('S.resistanceChain(0.50)')
    ns = N_ENG / I_GEAR / 60
    got = sc('S.propellerDesign({Th: S.resistanceChain(0.50).thrust*1000, '
             'v: S.resistanceChain(0.50).v, va: S.resistanceChain(0.50).va, '
             'Dp: 4.2, ns: %r, Z: 4})' % ns)
    py = py_propeller(ch['thrust'] * 1000, ch['v'], ch['va'], DP, ns)
    for k in ('CT', 'a', 'etaIdeal', 'J', 'etaProf', 'eta0', 'KT', 'KQ', 'PoD'):
        assert got[k] == pytest.approx(py[k], rel=1e-10), k


def test_propeller_key_numbers():
    ns = N_ENG / I_GEAR / 60
    p = sc('S.propellerDesign({Th: S.resistanceChain(0.50).thrust*1000, '
           'v: S.resistanceChain(0.50).v, va: S.resistanceChain(0.50).va, '
           'Dp: 4.2, ns: %r, Z: 4})' % ns)
    assert p['J'] == pytest.approx(0.3470, abs=5e-4)
    assert p['KT'] == pytest.approx(0.06360, abs=5e-5)
    assert p['KQ'] == pytest.approx(0.00658, abs=5e-5)
    assert p['eta0'] == pytest.approx(0.5340, abs=5e-4)
    assert p['etaIdeal'] == pytest.approx(0.7901, abs=5e-4)
    assert p['PoD'] == pytest.approx(0.638, abs=1e-3)
    assert p['alphaDeg'] == pytest.approx(4.88, abs=0.05)
    assert p['tipSpeed'] == pytest.approx(39.58, abs=0.02)


def test_refined_chain_keeps_the_same_engine():
    """Главный вывод сайта: уточнение η₀ не меняет выбранный двигатель."""
    ref = sc('S.resistanceChain(S.propellerDesign({'
             'Th: S.resistanceChain(0.50).thrust*1000, '
             'v: S.resistanceChain(0.50).v, va: S.resistanceChain(0.50).va, '
             'Dp: 4.2, ns: 3.0, Z: 4}).eta0).P')
    assert ref['etaD'] == pytest.approx(0.6408, abs=5e-4)
    assert ref['PS'] == pytest.approx(1495.6, abs=0.2)
    assert ref['required'] == pytest.approx(1719.9, abs=0.2)
    pick = sc('S.pickEngine(%r)' % ref['required'])
    assert pick['engine']['Ne'] == 1980
    assert pick['spare'] == pytest.approx(0.151, abs=5e-4)
    # тот же двигатель выбирается и по числу /design
    assert sc('S.pickEngine(1836.7).engine.Ne') == 1980


def test_keller_area():
    got = sc('S.kellerArea(S.resistanceChain(0.50).thrust*1000, 4, 4.2, 3.0)')
    th = sc('S.resistanceChain(0.50).thrust') * 1000
    p0 = PATM + RHO_SW * G * 3.0
    want = (1.3 + 0.3 * 4) * th / ((p0 - PV) * 4.2 ** 2) + 0.20
    assert got['AeA0'] == pytest.approx(want, rel=1e-12)
    assert got['AeA0'] == pytest.approx(0.3993, abs=5e-4)


def test_ideal_efficiency_is_upper_bound():
    """Действительный КПД винта не может превысить идеальный ни при какой
    частоте вращения — иначе модель нефизична."""
    for i_gear in (4.0, 4.5, 5.0, 5.5, 6.0):
        ns = N_ENG / i_gear / 60
        p = sc('S.propellerDesign({Th: S.resistanceChain(0.50).thrust*1000, '
               'v: S.resistanceChain(0.50).v, va: S.resistanceChain(0.50).va, '
               'Dp: 4.2, ns: %r, Z: 4})' % ns)
        assert p['eta0'] < p['etaIdeal'], 'i = %s' % i_gear


# --------------------------------------------------------- 3. валопровод

def test_torque_and_gearbox():
    m_eng = sc('S.torque(1980, 900)')
    m_prop = sc('S.torque(1980, 180)')
    assert m_eng == pytest.approx(30000 * 1980 / (math.pi * 900), rel=1e-12)
    assert m_prop == pytest.approx(m_eng * 5.0, rel=1e-12)
    assert m_prop == pytest.approx(105042, abs=2)


def test_shaft_diameter_round_trip():
    m = sc('S.torque(1980, 180)')
    d = sc('S.shaftDiameter(%r, 40)' % m)
    assert d * 1000 == pytest.approx(237.4, abs=0.1)
    wp = sc('S.polarModulus(%r)' % d)
    assert sc('S.shear(%r, %r)' % (m, wp)) == pytest.approx(40.0, rel=1e-9)


def test_shaft_diameter_rules():
    """Структура формулы Правил РС, часть VII."""
    def py_rules(n, f, k):
        return f * k * (1980 / n * 560 / (RM + 160)) ** (1 / 3)
    assert sc('S.shaftDiameterRules(1980, 180, 600, 100, 1.22)') == \
        pytest.approx(py_rules(180, 100, 1.22), rel=1e-12)
    assert sc('S.shaftDiameterRules(1980, 180, 600, 100, 1.22)') == \
        pytest.approx(245.1, abs=0.1)
    assert sc('S.shaftDiameterRules(1980, 180, 600, 95, 1.0)') == \
        pytest.approx(190.8, abs=0.1)
    assert sc('S.shaftDiameterRules(1980, 900, 600, 95, 1.0)') == \
        pytest.approx(111.6, abs=0.1)


def test_twist_angle():
    m = sc('S.torque(1980, 180)')
    ip = sc('S.polarInertia(0.245)')
    assert ip == pytest.approx(math.pi * 0.245 ** 4 / 32, rel=1e-12)
    tw = sc('S.twist(%r, 18.0, 8.1e10, %r)' % (m, ip))
    assert tw['deg'] == pytest.approx(3.781, abs=5e-3)
    assert tw['perMetre'] == pytest.approx(0.2101, abs=5e-4)
    assert tw['perMetre'] < 0.25, 'угол закручивания вышел за норму жёсткости'


def test_torsional_mode():
    ip = sc('S.polarInertia(0.245)')
    c = sc('S.torsionalStiffness(8.1e10, %r, 18.0)' % ip)
    assert c == pytest.approx(G_STEEL * ip / L_SHAFT, rel=1e-12)
    md = sc('S.torsionalMode(%r, %r, 0.25)' % (c, 7500 * 1.05 ** 2))
    jj = 7500 * 1.05 ** 2 * 1.25
    assert md['J'] == pytest.approx(jj, rel=1e-12)
    assert md['fCpm'] == pytest.approx(math.sqrt(c / jj) / (2 * math.pi) * 60, rel=1e-12)
    assert md['fCpm'] == pytest.approx(118.5, abs=0.1)
    # лопастной порядок уводит резонанс далеко ниже рабочего диапазона
    assert sc('S.criticalSpeed(%r, 4)' % md['fCpm']) == pytest.approx(29.6, abs=0.1)
    assert sc('S.criticalSpeed(%r, 1)' % md['fCpm']) == pytest.approx(118.5, abs=0.1)


# ---------------------------------------------------------- 4. двигатель

def test_engine_summary():
    es = sc('S.engineSummary()')
    vh = math.pi * BORE ** 2 / 4 * STROKE
    assert es['Vh'] == pytest.approx(vh, rel=1e-12)
    assert es['VhLitre'] == pytest.approx(13.5717, abs=1e-3)
    pe = NE * 1000 * 30 * TACT / (vh * CYL * N_ENG)
    assert es['pe'] == pytest.approx(pe, rel=1e-12)
    assert es['peMPa'] == pytest.approx(2.1614, abs=5e-4)
    assert es['piMPa'] == pytest.approx(2.4015, abs=5e-4)
    assert es['Ni'] == pytest.approx(NE / ETA_M, rel=1e-12)
    assert es['cm'] == pytest.approx(STROKE * N_ENG / 30, rel=1e-12)
    assert es['cm'] == pytest.approx(9.0, abs=1e-9)
    assert es['litre'] == pytest.approx(16.21, abs=5e-3)
    assert es['etaE'] == pytest.approx(3.6e6 / (GE * QN), rel=1e-12)
    assert es['etaE'] == pytest.approx(0.43235, abs=1e-5)
    assert es['nProp'] == pytest.approx(180.0, rel=1e-12)


def test_indicator_card():
    """Учебная диаграмма 1280 мм² при длине 80 мм и масштабе 0,15 МПа/мм
    должна вернуть паспортную мощность с точностью округления."""
    pi = sc('S.mepFromCard(1280, 80, 0.15)')
    assert pi == pytest.approx(2.400, abs=1e-9)
    vh = math.pi * BORE ** 2 / 4 * STROKE
    ni = sc('S.powerByMep(%r, %r, 9, 900, 4)' % (pi * 1e6, vh))
    assert ni == pytest.approx(2198.6, abs=0.1)
    assert ni * ETA_M == pytest.approx(1978.8, abs=0.1)
    assert abs(ni * ETA_M - NE) / NE < 0.001


def test_mep_power_round_trip():
    vh = math.pi * BORE ** 2 / 4 * STROKE
    pe = sc('S.mepByPower(1980, %r, 9, 900, 4)' % vh)
    assert sc('S.powerByMep(%r, %r, 9, 900, 4)' % (pe, vh)) == pytest.approx(1980, rel=1e-12)


def test_engine_catalogue_needs_a_margin():
    """Двигатель, покрывающий потребную мощность впритык, не выбирается."""
    assert sc('S.pickEngine(1719.9, null, 0).engine.Ne') == 1760
    assert sc('S.pickEngine(1719.9).engine.Ne') == 1980


# ----------------------------------------------------- 5. тепловой баланс

def test_heat_balance_closes():
    hb = sc('S.heatBalance(1980, 195, 42700, S.HEAT_SHARE)')
    bs = GE * NE / 1000 / 3600
    assert hb['Bs'] == pytest.approx(bs, rel=1e-12)
    assert hb['Q1'] == pytest.approx(bs * QN, rel=1e-12)
    assert hb['Q1'] == pytest.approx(4579.6, abs=0.1)
    assert hb['etaE'] == pytest.approx(0.43235, abs=1e-5)
    total = NE + sum(it['Q'] for it in hb['items'])
    assert total == pytest.approx(hb['Q1'], abs=1e-6)
    by_key = {it['key']: it for it in hb['items']}
    assert by_key['gas']['Q'] == pytest.approx(1282.3, abs=0.1)
    assert by_key['water']['Q'] == pytest.approx(778.5, abs=0.1)
    assert by_key['oil']['Q'] == pytest.approx(183.2, abs=0.1)
    assert by_key['air']['Q'] == pytest.approx(274.8, abs=0.1)
    assert by_key['rest']['Q'] == pytest.approx(80.8, abs=0.1)
    assert by_key['rest']['Q'] > 0, 'остаточные потери вышли отрицательными'


def test_gas_flow_and_temperature():
    hb = sc('S.heatBalance(1980, 195, 42700, S.HEAT_SHARE)')
    gg = sc('S.gasFlow(%r, 2.2, 14.3)' % hb['Bs'])
    assert gg == pytest.approx(hb['Bs'] * (1 + LAMBDA * L0), rel=1e-12)
    assert gg == pytest.approx(3.4813, abs=1e-3)
    qgas = [it for it in hb['items'] if it['key'] == 'gas'][0]['Q']
    tg = sc('S.gasTemperature(%r, %r, 1.10, 15.0)' % (qgas, gg))
    assert tg == pytest.approx(T0 + qgas / (gg * CP_GAS), rel=1e-12)
    assert tg == pytest.approx(349.8, abs=0.2)


def test_coolant_flow():
    """G = Q/(c·Δt): обращение обязано вернуть исходную теплоту."""
    g = sc('S.coolantFlow(778.5, 4.19, 8.0)')
    assert g * 4.19 * 8.0 == pytest.approx(778.5, rel=1e-12)


# ------------------------------------------------------------- 6. топливо

def py_voyage_fuel():
    hours = RANGE_NM / V_KN
    main = K_MCR * NE * GE / 1e6 * hours
    aux = NDG * GDG / 1e6 * hours
    net = main + aux
    return hours, main, aux, net, net * KRES


def test_voyage_fuel():
    vf = sc('S.voyageFuel({range: 4000, v: 12.5, kMCR: 0.85, Ne: 1980, '
            'ge: 195, Ndg: 120, gdg: 210, kres: 1.10})')
    hours, main, aux, net, total = py_voyage_fuel()
    assert vf['hours'] == pytest.approx(hours, rel=1e-12) == 320.0
    assert vf['main'] == pytest.approx(main, rel=1e-12)
    assert vf['main'] == pytest.approx(105.02, abs=0.01)
    assert vf['aux'] == pytest.approx(8.06, abs=0.01)
    assert vf['total'] == pytest.approx(total, rel=1e-12)
    assert vf['total'] == pytest.approx(124.39, abs=0.01)


def test_fuel_matches_design_stores_increment():
    """/design/p-power добавил в запасы 12,9 т при переходе с 1764,9 кВт
    (адмиралтейский коэффициент) на выбранные 1980 кВт. Наш расчёт обязан
    дать ровно тот же прирост."""
    hours = RANGE_NM / V_KN
    def total(ne):
        net = (K_MCR * ne * GE / 1e6 + NDG * GDG / 1e6) * hours
        return net * KRES
    ours = sc('S.voyageFuel({range: 4000, v: 12.5, kMCR: 0.85, Ne: 1980, '
              'ge: 195, Ndg: 120, gdg: 210, kres: 1.10}).total')
    old = total(1764.9)
    assert old == pytest.approx(111.86, abs=0.02)     # число /design/p-mass
    # топливо + масло 3 % = прирост, указанный на /design/p-power
    assert (ours - old) * 1.03 == pytest.approx(12.9, abs=0.1)


def test_tank_volume():
    v = sc('S.tankVolume(124.39, 0.86, 0.95)')
    assert v == pytest.approx(124.39 / RHO_FUEL / KFILL, rel=1e-12)
    assert v == pytest.approx(152.3, abs=0.1)


# --------------------------------------------------------- 7. утилизация

def test_waste_heat_boiler():
    hb = sc('S.heatBalance(1980, 195, 42700, S.HEAT_SHARE)')
    gg = sc('S.gasFlow(%r, 2.2, 14.3)' % hb['Bs'])
    qgas = [it for it in hb['items'] if it['key'] == 'gas'][0]['Q']
    tg = sc('S.gasTemperature(%r, %r, 1.10, 15.0)' % (qgas, gg))
    uk = sc('S.wasteHeatBoiler({Gg: %r, cp: 1.10, tGas: %r, tStack: 180.0, '
            'etaBoiler: 0.98, iSteam: 2763, iFeed: 251})' % (gg, tg))
    assert uk['Q'] == pytest.approx(gg * CP_GAS * (tg - T_STACK), rel=1e-12)
    assert uk['Q'] == pytest.approx(650.4, abs=0.2)
    assert uk['Dh'] == pytest.approx(uk['Q'] * 0.98 / (2763 - 251) * 3600, rel=1e-12)
    assert uk['Dh'] == pytest.approx(913, abs=1)
    # снятая теплота не может превысить теплоту, унесённую газами
    assert uk['Q'] < qgas


def test_auxiliary_boiler_fuel():
    bf = sc('S.boilerFuel(400, 2763, 251, 42700, 0.85)')
    q = 400 / 3600 * (2763 - 251)
    assert bf['Q'] == pytest.approx(q, rel=1e-12)
    assert bf['kgPerHour'] == pytest.approx(q / (QN * 0.85) * 3600, rel=1e-12)
    assert bf['kgPerHour'] == pytest.approx(27.7, abs=0.1)
    assert bf['kgPerHour'] * 320 / 1000 == pytest.approx(8.86, abs=0.02)


def test_shaft_generator_is_only_marginally_better():
    """Валогенератор на этом судне экономит единицы процентов — вывод
    разбора 12 держится на этом числе."""
    sg = sc('S.shaftGeneratorCompare({Pel: 120, etaGen: 0.95, etaPTO: 0.98, '
            'ge: 195, gdgPart: 220})')
    assert sg['shaftPower'] == pytest.approx(120 / (0.95 * 0.98), rel=1e-12)
    assert sg['ptoFuel'] == pytest.approx(25.13, abs=0.02)
    assert sg['dgFuel'] == pytest.approx(26.40, abs=0.02)
    assert sg['savePct'] == pytest.approx(4.8, abs=0.1)


# ---------------------------------------------------- 8. пусковой воздух

def test_starting_air():
    es = sc('S.engineSummary()')
    sa = sc('S.startingAir({q: 10, Vtotal: %r, starts: 6, pBottle: 3.0e6, '
            'pMin: 0.9e6, fillHours: 1})' % es['Vtotal'])
    assert sa['Vair'] == pytest.approx(10 * es['Vtotal'] * 6, rel=1e-12)
    assert sa['Vair'] == pytest.approx(7.329, abs=1e-3)
    assert sa['Vbottles'] == pytest.approx(sa['Vair'] * PATM / (3.0e6 - 0.9e6), rel=1e-12)
    assert sa['Vbottles'] * 1000 == pytest.approx(354, abs=1)
    # принятые два баллона по 200 л обязаны покрывать требуемое
    assert 400 > sa['Vbottles'] * 1000


# --------------------------------------------------- 9. электростанция

def test_ship_service_load_matches_design_assumption():
    """Ходовая нагрузка, собранная по таблице потребителей, обязана совпасть
    со 120 кВт, которые /design/p-mass заложил в расчёт запасов топлива."""
    hod = sc('S.modeLoad(S.LOADS, "hod").P')
    assert hod == pytest.approx(NDG, abs=0.1)


def test_mode_loads():
    want = {'hod': 119.98, 'man': 280.72, 'port': 76.28, 'em': 45.54}
    for key, value in want.items():
        got = sc('S.modeLoad(S.LOADS, "%s").P' % key)
        assert got == pytest.approx(value, abs=0.02), key


def test_mode_load_is_a_plain_sum():
    """Пересчёт строк ходового режима на Python."""
    loads = sc('S.LOADS')
    py = sum(r['P'] * r['k']['hod'] for r in loads if r['k']['hod'] > 0)
    assert sc('S.modeLoad(S.LOADS, "hod").P') == pytest.approx(py, rel=1e-12)


def test_apparent_power_triangle():
    ap = sc('S.apparentPower(119.98, 0.80, 400)')
    assert ap['S'] == pytest.approx(119.98 / 0.8, rel=1e-12)
    assert ap['S'] == pytest.approx(150.0, abs=0.05)
    assert ap['S'] ** 2 == pytest.approx(119.98 ** 2 + ap['Q'] ** 2, rel=1e-9)
    assert ap['I'] == pytest.approx(ap['S'] * 1000 / (math.sqrt(3) * 400), rel=1e-12)
    assert ap['I'] == pytest.approx(216.5, abs=0.1)


def test_generator_choice():
    for key, running, load in (('hod', 1, 0.750), ('man', 2, 0.877),
                               ('port', 1, 0.477)):
        g = sc('S.pickGenerators(S.modeLoad(S.LOADS, "%s").P, 160, 2)' % key)
        assert g['running'] == running, key
        assert g['load'] == pytest.approx(load, abs=5e-4), key
    e = sc('S.pickGenerators(S.modeLoad(S.LOADS, "em").P, 64, 1)')
    assert e['load'] == pytest.approx(0.712, abs=5e-4)


def test_starting_dip():
    ok = sc('S.startingDip({P: 22, U: 400, cos: 0.85, eta: 0.88, kStart: 6, '
            'Sgen: 200, xd: 0.15})')
    assert ok['dip'] == pytest.approx(0.117, abs=5e-4)
    assert ok['dip'] < 0.15, 'прямой пуск насоса обязан укладываться в норму'
    bad = sc('S.startingDip({P: 150, U: 400, cos: 0.85, eta: 0.92, kStart: 6, '
             'Sgen: 400, xd: 0.15})')
    assert bad['dip'] == pytest.approx(0.301, abs=5e-4)
    assert bad['dip'] > 0.15, 'прямой пуск подруливающего обязан не проходить'
    soft = sc('S.startingDip({P: 150, U: 400, cos: 0.85, eta: 0.92, kStart: 2, '
              'Sgen: 400, xd: 0.15})')
    assert soft['dip'] == pytest.approx(0.126, abs=5e-4)


# ------------------------------------------------------------- 10. кабель

CABLE_CASES = [
    ('подруливающее', dict(P=150, U=400, cos=0.85, eta=0.92, phases=3, L=60,
                           k1=1.0, k2=0.70, duPct=6, Ik=6000, tk=0.1),
     276.9, 185, 'нагрев'),
    ('насос забортной воды', dict(P=22, U=400, cos=0.85, eta=0.88, phases=3, L=25,
                                  k1=1.0, k2=0.70, duPct=6, Ik=6000, tk=0.1),
     42.5, 16, 'термическая стойкость'),
    ('освещение', dict(P=3, U=220, cos=1.0, eta=1.0, phases=1, L=70,
                       k1=1.0, k2=0.85, duPct=5, Ik=2000, tk=0.02),
     13.6, 4, 'потеря напряжения'),
]


@pytest.mark.parametrize('name,arg,current,section,why', CABLE_CASES,
                         ids=[c[0] for c in CABLE_CASES])
def test_cable_section(name, arg, current, section, why):
    """Три фидера судна решаются тремя разными условиями — это сюжет
    разбора 9, и он обязан держаться на числах."""
    got = sc('S.cableSection(%s)' % json.dumps(arg))
    assert got['I'] == pytest.approx(current, abs=0.05)
    assert got['pick']['s'] == section
    assert got['pick']['why'] == why
    assert got['dU'] <= got['dUallow'] + 1e-9


def test_cable_current_formula():
    """I = P/(√3·U·cos φ·η) — пересчёт на Python."""
    got = sc('S.loadCurrent(150, 400, 0.85, 0.92, 3)')
    assert got == pytest.approx(150 * 1000 / (math.sqrt(3) * 400 * 0.85 * 0.92), rel=1e-12)
    single = sc('S.loadCurrent(3, 220, 1.0, 1.0, 1)')
    assert single == pytest.approx(3 * 1000 / 220, rel=1e-12)


# -------------------------------------------------------------- 11. циклы

def test_rankine():
    rk = sc('S.rankine({h1: 3422, s1: 6.880, hf: 137.8, sf: 0.476, sg: 8.394, '
            'r: 2424, etaOi: 0.82, etaBoiler: 0.88, etaPipe: 0.98, '
            'etaMech: 0.98, etaGear: 0.975})')
    x = (6.880 - 0.476) / (8.394 - 0.476)
    h2 = 137.8 + x * 2424
    assert rk['x'] == pytest.approx(x, rel=1e-12)
    assert rk['h2'] == pytest.approx(h2, rel=1e-12)
    assert rk['etaT'] == pytest.approx((3422 - h2) / (3422 - 137.8), rel=1e-12)
    assert rk['etaT'] == pytest.approx(0.4030, abs=5e-4)
    assert rk['etaE'] == pytest.approx(0.2723, abs=5e-4)
    assert rk['ge'] == pytest.approx(3.6e6 / (rk['etaE'] * QN), rel=1e-12)


def test_brayton_against_ideal():
    ideal = sc('S.brayton({pi: 18, t1: 15, t3: 1200, k: 1.4, cp: 1.005, '
               'etaComp: 1, etaTurb: 1})')
    m = (1.4 - 1) / 1.4
    assert ideal['etaT'] == pytest.approx(1 - 18 ** -m, rel=1e-12)
    real = sc('S.brayton({pi: 18, t1: 15, t3: 1200, k: 1.4, cp: 1.005, '
              'etaComp: 0.86, etaTurb: 0.89})')
    assert real['etaT'] == pytest.approx(0.4065, abs=5e-4)
    assert real['etaT'] < ideal['etaT']
    # компрессор съедает больше 40 % работы турбины — вывод разбора 10
    assert real['lComp'] / real['lTurb'] == pytest.approx(0.584, abs=5e-3)


def test_carnot_monotone():
    assert sc('S.carnot(1000, 300)') > sc('S.carnot(800, 300)')
    assert sc('S.carnot(500, 500)') == pytest.approx(0, abs=1e-15)


# -------------------------------------------------------- 11а. надёжность

def test_reliability_series_and_parallel():
    """Числа главы 9: последовательная главная цепь и резервированные ДГ."""
    s = sc('S.reliabilitySeries([0.995, 0.999, 0.999, 0.998])')
    assert s == pytest.approx(0.995 * 0.999 * 0.999 * 0.998, rel=1e-15)
    assert s == pytest.approx(0.9910, abs=5e-5)
    p = sc('S.reliabilityParallel([0.98, 0.98])')
    assert 1 - p == pytest.approx(0.02 * 0.02, rel=1e-12)
    # резервирование всегда надёжнее одиночного элемента
    assert p > 0.98


def test_reliability_exponential_round_trip():
    lam = sc('S.failureRate(0.991, 320)')
    assert sc('S.reliabilityExp(%r, 320)' % lam) == pytest.approx(0.991, rel=1e-12)
    assert sc('S.mtbf(%r)' % lam) == pytest.approx(1 / lam, rel=1e-15)


def test_availability():
    assert sc('S.availability(64000, 128)') == pytest.approx(64000 / 64128, rel=1e-15)
    assert sc('S.availability(64000, 128)') == pytest.approx(0.9980, abs=5e-5)


def test_hollow_shaft_and_inertia():
    d = sc('S.shaftDiameter(105042, 40, 0.4)')
    assert d * 1000 == pytest.approx(239.4, abs=0.1)
    wp = sc('S.polarModulus(%r, 0.4)' % d)
    assert sc('S.shear(105042, %r)' % wp) == pytest.approx(40.0, rel=1e-9)
    assert sc('S.inertiaOfMass(7500, 1.05)') == pytest.approx(7500 * 1.05 ** 2, rel=1e-15)
    assert sc('S.gearedSpeed(900, 5.0)') == pytest.approx(180.0, rel=1e-15)


# --------------------------------------------------- 12. выбросы и индексы

def test_so2_and_co2():
    assert sc('S.so2(386.1, 0.10)') == pytest.approx(386.1 * 0.001 * 2, rel=1e-12)
    assert sc('S.so2(386.1, 0.10)') == pytest.approx(0.77, abs=0.01)
    assert sc('S.so2(386.1, 2.5)') == pytest.approx(19.31, abs=0.01)
    assert sc('S.co2(386.1, 3.206)') / 1000 == pytest.approx(1.238, abs=1e-3)


def test_nox_limits():
    assert sc('S.noxLimit(900, 1)') == pytest.approx(45.0 * 900 ** -0.2, rel=1e-12)
    assert sc('S.noxLimit(900, 2)') == pytest.approx(9.20, abs=0.01)
    assert sc('S.noxLimit(900, 3)') == pytest.approx(2.31, abs=0.01)
    # Tier III строже Tier II, а тот строже Tier I — на всём диапазоне
    for n in (100, 130, 500, 900, 1500, 2000, 2500):
        assert sc('S.noxLimit(%d, 3)' % n) < sc('S.noxLimit(%d, 2)' % n) < \
            sc('S.noxLimit(%d, 1)' % n), n


def test_eedi():
    ee = sc('S.eediAttained({Pme: 1485, SFCme: 195, CF: 3.206, Pae: 99, '
            'SFCae: 210, CFae: 3.206, capacity: 4157, vref: 12.47})')
    num = 1485 * 195 * 3.206 + 99 * 210 * 3.206
    assert ee['num'] == pytest.approx(num, rel=1e-12)
    assert ee['eedi'] == pytest.approx(num / (4157 * 12.47), rel=1e-12)
    assert ee['eedi'] == pytest.approx(19.195, abs=5e-3)
    ref = sc('S.eediReference(4157, 107.48, 0.216)')
    assert ref == pytest.approx(107.48 * 4157 ** -0.216, rel=1e-12)
    assert ref == pytest.approx(17.769, abs=5e-3)
    # ни одна фаза не выполняется — результат разбора 11
    for full, req in ((0.10, 17.598), (0.20, 17.427), (0.30, 17.255)):
        red = sc('S.eediReduction(4157, %r, 3000, 15000)' % full)
        assert ref * (1 - red) == pytest.approx(req, abs=5e-3)
        assert ee['eedi'] > ref * (1 - red)


def test_eedi_after_measures():
    """Валогенератор плюс ограничение мощности до 1870 кВт выводят судно
    в требования фазы 3 — вывод разбора 11."""
    ref = sc('S.eediReference(4157, 107.48, 0.216)')
    red = sc('S.eediReduction(4157, 0.30, 3000, 15000)')
    req = ref * (1 - red)
    pto = sc('S.eediAttained({Pme: 1485, SFCme: 195, CF: 3.206, Pae: 0, '
             'SFCae: 210, CFae: 3.206, capacity: 4157, vref: 12.47})')
    assert pto['eedi'] == pytest.approx(17.909, abs=5e-3)
    assert pto['eedi'] > req
    vref = 12.47 * (0.75 * 1870 / 1485) ** (1 / 3)
    epl = sc('S.eediAttained({Pme: %r, SFCme: 195, CF: 3.206, Pae: 0, '
             'SFCae: 210, CFae: 3.206, capacity: 4157, vref: %r})'
             % (0.75 * 1870, vref))
    assert epl['eedi'] == pytest.approx(17.240, abs=5e-3)
    assert epl['eedi'] <= req


def test_cii():
    cii = sc('S.ciiAttained(2011.5, 3.206, 4157, 60000)')
    assert cii == pytest.approx(2011.5 * 3.206 * 1e6 / (4157 * 60000), rel=1e-12)
    assert cii == pytest.approx(25.86, abs=0.01)
    ref = sc('S.ciiReference(4157, 588, 0.3885)')
    assert ref == pytest.approx(23.09, abs=0.01)
    assert cii / (ref * (1 - 0.11)) == pytest.approx(1.258, abs=5e-3)


# --------------------------------------- согласование страниц и модуля

#: (файл разбора, строка, которая обязана на нём стоять)
PAGE_NUMBERS = [
    # цепочка ходкости — те же числа, что на /design/p-power
    ('p-thrust.html', '146,04'), ('p-thrust.html', '939,1'),
    ('p-thrust.html', '182,55'), ('p-thrust.html', '4,3728'),
    ('p-thrust.html', '1 597,2'), ('p-thrust.html', '1 836,7'),
    ('p-thrust.html', '1,1765'), ('p-thrust.html', '0,7901'),
    # винт
    ('p-propeller.html', '0,3470'), ('p-propeller.html', '0,06360'),
    ('p-propeller.html', '0,5340'), ('p-propeller.html', '0,3993'),
    ('p-propeller.html', '0,6408'), ('p-propeller.html', '1 719,9'),
    ('p-propeller.html', '180 об/мин'), ('p-propeller.html', '4,2 м'),
    ('p-propeller.html', '0,638'), ('p-propeller.html', '39,58'),
    # двигатель
    ('p-power.html', '13,5717'), ('p-power.html', '2,4000'),
    ('p-power.html', '2 198,6'), ('p-power.html', '2,1614'),
    ('p-power.html', '9,00'), ('p-power.html', '16,21'),
    # тепловой баланс
    ('p-heat.html', '4 579,6'), ('p-heat.html', '1 282,3'),
    ('p-heat.html', '778,5'), ('p-heat.html', '349,8'),
    ('p-heat.html', '3,4813'),
    # топливо
    ('p-fuel.html', '328,2'), ('p-fuel.html', '105,02'),
    ('p-fuel.html', '124,39'), ('p-fuel.html', '152,3'),
    # утилизация
    ('p-recovery.html', '650,4'), ('p-recovery.html', '913'),
    ('p-recovery.html', '8,86'), ('p-recovery.html', '25,13'),
    # пусковой воздух
    ('p-start.html', '7,329'), ('p-start.html', '354'),
    # валопровод
    ('p-shaft.html', '105 042'), ('p-shaft.html', '245,1'),
    ('p-shaft.html', '190,8'), ('p-shaft.html', '0,2101'),
    # крутильные колебания
    ('p-torsion.html', '118,5'), ('p-torsion.html', '29,6'),
    ('p-torsion.html', '10 336'),
    # электростанция
    ('p-station.html', '119,98'), ('p-station.html', '280,72'),
    ('p-station.html', '216,5'), ('p-station.html', '160'),
    # кабель
    ('p-cable.html', '276,9'), ('p-cable.html', '185'),
    ('p-cable.html', '42,5'), ('p-cable.html', '13,6'),
    # циклы
    ('p-cycle.html', '0,4030'), ('p-cycle.html', '0,4065'),
    # выбросы
    ('p-emission.html', '19,195'), ('p-emission.html', '17,769'),
    ('p-emission.html', '25,86'), ('p-emission.html', '9,20'),
    # теория обязана печатать те же числа, что и разборы
    ('t-operation.html', '0,991'), ('t-operation.html', '119,98'),
    ('t-operation.html', '650,4'),
]


def _digits(text):
    """Убрать разделитель разрядов: группировка — вопрос вёрстки, а не числа.
    «1 597,2», «1\u00a0597,2» и «1597,2» — одно и то же значение."""
    flat = text.replace('&nbsp;', '\u00a0')
    return re.sub(r'(?<=\d)[\s\u00a0\u202f](?=\d)', '', flat)


@pytest.mark.parametrize('page,needle', PAGE_NUMBERS,
                         ids=['%s:%s' % (p, n) for p, n in PAGE_NUMBERS])
def test_page_shows_computed_number(page, needle):
    """Числа, полученные модулем, должны стоять и в тексте разбора."""
    path = os.path.join(SITE, page)
    if not os.path.isfile(path):
        pytest.skip('страница %s ещё не создана' % page)
    with open(path, encoding='utf-8') as fh:
        html = fh.read()
    assert _digits(needle) in _digits(html), \
        'на странице %s нет значения «%s»' % (page, needle)


#: следы прежнего судна-прототипа (фидерный контейнеровоз 145 м, 7800 кВт),
#: с которого сайт переведён на сквозной пример кластера. Границы поставлены
#: так, чтобы «5,6 м» не ловилось внутри «5,6 мм», а «7800» — внутри года.
OLD_SHIP_TRACES = [
    r'7800\s*кВт', r'7\s800\s*кВт',
    r'21\s?200\s*т', r'16,5\s*уз', r'129\s*об/мин',
    r'контейнеровоз', r'172\s*г/\(кВт',
    r'5,6\s*м(?!м)',            # диаметр прежнего винта
    r'\b577\s*кН·м',            # прежний крутящий момент
]


@pytest.mark.parametrize('page', [
    'p-power.html', 'p-heat.html', 'p-fuel.html', 'p-engine.html',
    'p-propeller.html', 'p-thrust.html', 'p-shaft.html', 'p-torsion.html',
    'p-station.html', 'p-cable.html', 'p-cycle.html', 'p-emission.html',
    'p-recovery.html', 'p-start.html', 'tasks.html'])
def test_no_traces_of_the_old_example_ship(page):
    """Разборы обязаны считать одно судно — то же, что /design/, /shiptech/
    и /hullstruct/."""
    path = os.path.join(SITE, page)
    if not os.path.isfile(path):
        pytest.skip('страница %s ещё не создана' % page)
    with open(path, encoding='utf-8') as fh:
        html = fh.read()
    flat = _digits(html).replace(' ', ' ')
    found = [m.group(0) for pat in OLD_SHIP_TRACES
             for m in re.finditer(pat, flat, re.IGNORECASE)]
    assert not found, 'остались числа прежнего судна: %s' % ', '.join(sorted(set(found)))


def test_every_discussion_page_cites_a_norm():
    """В каждом разборе должна быть ссылка на норматив, а не только формулы."""
    pages = sorted(f for f in os.listdir(SITE)
                   if f.startswith('p-') and f.endswith('.html'))
    assert len(pages) >= 14
    bad = []
    for page in pages:
        with open(os.path.join(SITE, page), encoding='utf-8') as fh:
            html = fh.read()
        if not re.search(r'Правил|РМРС|МАРПОЛ|ГОСТ|ISO\s|ITTC|ИМО|Tier', html):
            bad.append(page)
    assert not bad, 'разборы без ссылки на норматив: %s' % ', '.join(bad)


def test_every_discussion_page_points_at_the_core():
    """Каждый разбор обязан сказать, каким модулем посчитаны его числа."""
    pages = sorted(f for f in os.listdir(SITE)
                   if f.startswith('p-') and f.endswith('.html'))
    bad = [p for p in pages
           if 'secalc.js' not in open(os.path.join(SITE, p), encoding='utf-8').read()]
    assert not bad, 'разборы без ссылки на расчётное ядро: %s' % ', '.join(bad)


def test_every_discussion_page_has_dimension_check():
    pages = sorted(f for f in os.listdir(SITE)
                   if f.startswith('p-') and f.endswith('.html'))
    bad = [p for p in pages
           if 'роверка размерности' not in
           open(os.path.join(SITE, p), encoding='utf-8').read()]
    assert not bad, 'разборы без проверки размерности: %s' % ', '.join(bad)


def test_widgets_contain_no_formulas_of_their_own():
    """Живые калькуляторы обязаны быть тонким слоем над ядром: если в файле
    виджета есть арифметика по существу задачи, формула продублирована."""
    widgets = ['cable.js', 'station.js', 'cycle.js', 'engine.js']
    bad = []
    for w in widgets:
        path = os.path.join(SITE, 'assets', w)
        if not os.path.isfile(path):
            continue
        src = open(path, encoding='utf-8').read()
        if 'SECALC' not in src:
            bad.append('%s не обращается к ядру' % w)
        if re.search(r'Math\.(sqrt|pow|log|atan|exp)\s*\(', src):
            bad.append('%s содержит собственную арифметику' % w)
    assert not bad, '; '.join(bad)
