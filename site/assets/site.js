/* Данные каркаса страниц. Машинерия — assets/shell.js. */
'use strict';
(function () {
  const me = document.currentScript;
  const root = (me && me.dataset.root) || './';
  buildSiteShell({
    root,
    page: (me && me.dataset.page) || '',
    brand: 'Судовые энергетические установки',
    logo: `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="6" fill="#7c2d12"/>
    <text x="15" y="22" text-anchor="middle" font-size="16">🔧</text>
  </svg>`,
    nav: [
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
        { h: 't-stirling', k: 'theory', t: '8. Двигатель Стирлинга' },
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
    ],
    footer: `<div>Учебный сайт по курсу «Судовые энергетические установки» · кафедра СЭУ, систем и оборудования (2245) СПбГМТУ</div>
    <div><a href="https://shadeswd.duckdns.org/">Кластер учебных сайтов</a></div>`,
    markers: `<marker id="arrE" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <path d="M0,0 L10,4 L0,8 z" fill="#16161a"/></marker>
    <marker id="arrS" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto">
      <path d="M10,0 L0,4 L10,8 z" fill="#16161a"/></marker>`,
  });
})();
