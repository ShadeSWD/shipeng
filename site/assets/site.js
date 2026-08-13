/* Каркас страниц «Судовые энергетические установки»: шапка с группированной
   навигацией, подвал, общие SVG-маркеры стрелок. */
'use strict';
(function () {
  const me = document.currentScript;
  const root = (me && me.dataset.root) || './';
  const page = (me && me.dataset.page) || '';
  const logoSvg = `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="6" fill="#7c2d12"/>
    <text x="15" y="22" text-anchor="middle" font-size="16">🔧</text>
  </svg>`;
  const nav = [
    { h: '', k: 'index', t: 'Обзор' },
    { t: 'Теория', h: 'theory', drop: [
      { h: 'theory', k: 'theory', t: 'Оглавление курса' },
      { h: 't-overview', k: 'theory', t: '1. Состав и показатели СЭУ' },
      { h: 't-diesel', k: 'theory', t: '2. Судовые дизели' },
      { h: 't-turbine', k: 'theory', t: '3. Паровые и газовые турбины' },
      { h: 't-propulsion', k: 'theory', t: '4. Валопровод и движители' },
      { h: 't-systems', k: 'theory', t: '5. Обслуживающие системы' },
      { h: 't-electro', k: 'theory', t: '6. Электроэнергетическая система' },
      { h: 't-modern', k: 'theory', t: '7. Современные тенденции' },
    ] },
    { t: 'Задачи', h: 'tasks', drop: [
      { h: 'tasks', k: 'tasks', t: 'Оглавление разборов' },
      { h: 'p-power', k: 'tasks', t: '1. Индикаторная и эффективная мощность' },
      { h: 'p-heat', k: 'tasks', t: '2. Тепловой баланс дизеля' },
      { h: 'p-fuel', k: 'tasks', t: '3. Удельный расход и запас топлива' },
      { h: 'p-engine', k: 'tasks', t: '4. Подбор двигателя (живой расчёт)' },
      { h: 'p-propeller', k: 'tasks', t: '5. Согласование винта и двигателя' },
      { h: 'p-thrust', k: 'tasks', t: '6. Упор, момент и КПД винта' },
      { h: 'p-shaft', k: 'tasks', t: '7. Валопровод на кручение' },
      { h: 'p-station', k: 'tasks', t: '8. Нагрузка судовой электростанции' },
      { h: 'p-cable', k: 'tasks', t: '9. Сечение кабеля и защита' },
      { h: 'p-cycle', k: 'tasks', t: '10. КПД циклов Ренкина и Брайтона' },
      { h: 'p-emission', k: 'tasks', t: '11. Выбросы, EEDI и CII' },
    ] },
    { h: 'sources', k: 'sources', t: 'Источники' },
  ];
  const navLink = (it) =>
    `<a href="${root}${it.h}" class="${page === it.k ? 'on' : ''}">${it.t}</a>`;
  const navHtml = nav.map((g) => {
    if (!g.drop) return navLink(g);
    const on = g.drop.some((it) => page === it.k) ? 'on' : '';
    return `<span class="nav-drop"><a href="${root}${g.h}" class="${on}">${g.t} ▾</a>`
      + `<span class="drop">${g.drop.map(navLink).join('')}</span></span>`;
  }).join('');
  const header = document.createElement('header');
  header.className = 'site';
  header.innerHTML = `<div class="wrap">
    <a class="logo" href="${root}">${logoSvg}<span>Судовые энергетические установки</span></a>
    <nav class="top">${navHtml}</nav>
  </div>`;
  document.body.prepend(header);
  const onReady = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn) : fn());
  const footer = document.createElement('footer');
  footer.className = 'site';
  footer.innerHTML = `<div class="wrap">
    <div>Учебный сайт по курсу «Судовые энергетические установки» · кафедра СЭУ, систем и оборудования (2245) СПбГМТУ</div>
    <div><a href="https://shadeswd.duckdns.org/">Кластер учебных сайтов</a></div>
  </div>`;
  onReady(() => document.body.appendChild(footer));
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = `<defs>
    <marker id="arrE" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <path d="M0,0 L10,4 L0,8 z" fill="#16161a"/></marker>
    <marker id="arrS" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto">
      <path d="M10,0 L0,4 L10,8 z" fill="#16161a"/></marker>
  </defs>`;
  onReady(() => document.body.appendChild(defs));
})();
