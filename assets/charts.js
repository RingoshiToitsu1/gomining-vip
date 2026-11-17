/* GMT-Optimizer chart kit: one place for chart colours and number formatting.
   ============================================================================
   Every chart on the site takes its colours and number formats from here, so charts follow
   assets/tokens.css and the page language instead of carrying their own hex codes.

     GMTCharts.css('gold')      → 'var(--color-gold)'   for SVG (use in style="", not presentation attributes)
     GMTCharts.color('gold')    → '#E2B259'             resolved token, for <canvas>, which can't read CSS variables
     GMTCharts.series(i)        → i-th data-viz series colour (canvas)
     GMTCharts.money(v, d)      → '$1,234' / '1.234 $' … locale-aware, USD
     GMTCharts.num(v, d)        → '1,234.5' / '1.234,5' …
     GMTCharts.pct(v, d)        → '12.5%' / '12,5 %' …  (v is already a percentage: 12.5)
   Locale comes from <html lang> (en, es, fr, de), default en-US.
*/
(function () {
  'use strict';
  if (window.GMTCharts) return;
  const LOCALES = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };
  const locale = () => LOCALES[(document.documentElement.lang || 'en').slice(0, 2).toLowerCase()] || 'en-US';
  const cache = {};
  const color = name => {
    if (cache[name]) return cache[name];
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-' + name).trim();
    return (cache[name] = v || '#E2B259');
  };
  const fmt = (v, opts) => new Intl.NumberFormat(locale(), opts).format(v);
  window.GMTCharts = {
    locale, color,
    css: name => 'var(--color-' + name + ')',
    series: i => color('series-' + ((i % 5) + 1)),
    money: (v, d) => fmt(v, { style: 'currency', currency: 'USD', minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d }),
    num: (v, d) => fmt(v, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }),
    pct: (v, d) => fmt(v / 100, { style: 'percent', minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 })
  };
})();
