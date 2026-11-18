/* Text for the generated data pages (scripts/gen-pages.js), per language.
   =========================================================================
   English is the source and must stay word-for-word what the pages have always said (SEO); es/fr/de are
   machine translations awaiting native review (TRANSLATIONS.md). Every function receives `c`:
     c.th, c.pk (price in $k), c.year, c.month (localized month name), c.date (localized full date)
     c.u(n)  whole-dollar amount    c.u2(n) dollar amount with cents    c.p1(x) number with one decimal
     c.n(x)  whole number           c.cap  token discount cap (%)       c.apr  staking APR (localized)
     c.conv  BTC→GMT fee (%)        c.btc  live BTC price (formatted)    c.sats sats/TH/day
     c.ref   { pct, cap, months, card } RINGO5 terms from data/config.json
     c.halving next halving year      c.consoleHref the calculator in this language, or English until it's translated
   Numbers from data/config.json come in through c (never typed here), so a config change can't leave a
   translation stale.
*/
'use strict';
const T = {};

T.en = {
  faqTitle: 'Frequently asked questions', readNext: 'Read next:',
  asof: d => `Fees and rates as of <time data-cfg="meta.updated" data-cfg-fmt="date">${d}</time>. They may change.`,
  cta: c => `  <div class="cta">
    <h3>Run your own numbers — free</h3>
    <p>Plug in your hashrate for live P&amp;L on today's numbers &mdash; then project it forward on assumptions you choose.</p>
    <p style="margin-top:.6rem">New to GoMining? Use code <span class="code">RINGO5</span> to unlock three bonuses: +${c.ref.pct}% bonus TH on your first miner (up to ${c.ref.cap} TH), ${c.ref.months} month of VIP Platinum+ and a GoMining Card cashback bonus.</p>
    <a href="${c.consoleHref}" class="btn">Open the calculator →</a>
  </div>`,
  verdict: (c, y) => {
    const r = `${c.p1(y)}% a year on capital at today's price`;
    if (y >= 20) return `that is ${r} — a strong rate for cloud mining, though it assumes you hold the maximum fee discount`;
    if (y >= 12) return `that is ${r}, a solid rate provided you keep the fee discount in place`;
    if (y >= 6) return `that is ${r} — modest, and materially better if Bitcoin outruns the modelled path`;
    return `that is ${r}, a thin rate, so the case rests largely on Bitcoin outperforming the path modelled here`;
  },
  stat: { capital: 'Total capital', net: 'Net / month', lock: 'GMT to lock', perDay: 'Per day', btc: 'BTC price', btcNow: 'BTC price now',
    hashPlusLock: (c, a, b) => `${a} hashrate + ${b} GMT lock`, hashPlusGmt: (c, a, b) => `${a} hashrate + ${b} GMT`,
    miningPlusStaking: (c, a, b) => `${a} mining + ${b} staking`, forCap: c => `for the ${c.cap}% discount`,
    yearOnCap: (c, y) => `${c.p1(y)}% a year on capital`, scenario: 'scenario', live: 'live' },
  related: { roi: 'How ROI is calculated', disc: 'The GMT discount explained', promo: 'GoMining promo code (RINGO5)', calc: 'the calculator',
    worth: 'Is GoMining worth it?', worthFull: 'Is GoMining worth it? (full guide)' },
  hash: {
    title: c => `GoMining ${c.th} TH: What It Actually Earns (${c.year})`,
    desc: (c, f) => `What ${c.th} TH on GoMining earns at today's price: ${c.u(f.monthlyUSD)}/mo on ${c.u(f.totalCapital)} of capital — counting mining, staking, and the GMT you lock for the discount.`,
    h1: c => `GoMining ${c.th} TH: What It Actually Earns`,
    lead: c => `Exactly what a ${c.th} TH GoMining setup costs and pays you at today's price and difficulty — counting the GMT you must lock for the discount and the staking it earns, not just the hashrate.`,
    updated: c => `Live figures &middot; Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/day &middot; ${c.apr}% GMT staking APR &middot; updated ${c.date}`,
    p1: (c, f, v) => `Two things get bought here, and most calculators only count the first. You mint ${c.th} TH for about <strong>${c.u(f.hashCost)}</strong>, and to hold the maximum ${c.cap}% fee discount you must lock roughly <strong>${c.u(f.gmtLockUSD)} of GMT</strong> (360 days of fee coverage) — <strong>${c.u(f.totalCapital)}</strong> of capital committed in total. On the income side, the hashrate nets about ${c.u(f.miningMonthlyUSD)}/month after fees and the BTC→GMT conversion fee (currently ${c.conv}%, may change), and the locked GMT earns roughly ${c.u(f.stakingMonthlyUSD)}/month staking at ${c.apr}% APR — about ${c.u(f.monthlyUSD)} combined, ${v}.`,
    h2a: 'Why the locked GMT is not a normal cost',
    p2: (c, f, none) => `Unlike the hashrate, the ${c.u(f.gmtLockUSD)} in GMT isn't spent — you still own the tokens and can unlock them later, so it's capital tied up rather than money gone (with GMT price risk while it's locked). It also pulls double duty: it cuts your fee by ${c.cap}% <em>and</em> earns ${c.apr}% staking. Without any discount, ${c.th} TH nets only about <strong>${c.u(none.monthlyUSD)}/month</strong> and ties up no GMT — but you leave the fee saving and the staking on the table. That trade is the main lever you control.`,
    formula: c => `daily net = mining net + GMT staking = (sats/TH/day × ${c.th} TH × BTC − fee × (1 − discount)) × 0.98 + locked GMT × APR ÷ 365\ntotal capital = hashrate + GMT locked for the discount`,
    h2b: 'Why there is no multi-year forecast on this page',
    p3: c => `Every figure above is today's: live Bitcoin price (${c.btc}), live network difficulty, current fee rates and the ${c.apr}% staking APR. None of it is projected forward, because a multi-year total printed into a static page is a number you did not choose and cannot inspect — and it will be read as a promise no matter how it is labelled. What happens next depends on the Bitcoin price, difficulty growth, the ${c.halving} halving and whether you keep the discount funded. Those are your assumptions to set, so set them in the calculator and watch what moves.`,
    faq: (c, f, none, cpt) => [
      { q: `How much capital do you really need for ${c.th} TH on GoMining?`, a: `About ${c.u(f.totalCapital)} in total: roughly ${c.u(f.hashCost)} for ${c.th} TH at the 15 W/TH new-miner price (~${c.u2(cpt)}/TH), plus about ${c.u(f.gmtLockUSD)} of GMT locked to hold the maximum ${c.cap}% fee discount. The GMT is retained, not spent. With promo code RINGO5 you get ${c.ref.pct}% extra hashrate for the same spend.` },
      { q: `How much does ${c.th} TH earn per month?`, a: `At today's Bitcoin price of ${c.btc} and current difficulty, ${c.th} TH nets about ${c.u(f.miningMonthlyUSD)} per month from mining after fees and the BTC→GMT conversion fee (currently ${c.conv}%, may change) (with the ${c.cap}% GMT discount), plus roughly ${c.u(f.stakingMonthlyUSD)} from staking the locked GMT at ${c.apr}% APR — about ${c.u(f.monthlyUSD)} combined. Without the discount, mining alone is closer to ${c.u(none.monthlyUSD)}.` },
      { q: `What will ${c.th} TH be earning in a few years?`, a: `Nobody can tell you that, and any page quoting a single number is guessing. It depends on the Bitcoin price, how fast network difficulty grows, whether you keep the fee discount funded, and the ${c.halving} halving cutting the block subsidy in half. What this page gives you is today's figures, computed from live data. If you want a projection, run one in the calculator where you set the assumptions yourself and can see exactly what they are.` }
    ]
  },
  price: {
    k: c => `$${c.pk}k`, full: c => `$${c.pk},000`,
    title: c => `Is GoMining Profitable if Bitcoin Hits $${c.pk}k? (${c.year})`,
    desc: (c, m) => `Modeling GoMining returns at a $${c.pk},000 Bitcoin price: a 100 TH farm (plus the GMT locked for the discount) nets about ${c.u(m.monthlyUSD)}/month on ${c.u(m.totalCapital)} of capital. Live difficulty.`,
    h1: c => `GoMining Profitability at $${c.pk}k Bitcoin`,
    lead: c => `What a GoMining farm would earn if Bitcoin traded at $${c.pk},000 — counting the GMT locked for the discount and its staking, on a reference 100 TH setup at live difficulty.`,
    updated: c => `Scenario price $${c.pk},000 &middot; live difficulty ${c.sats} sats/TH/day &middot; ${c.apr}% GMT staking APR &middot; updated ${c.date}`,
    p1: (c, m, v) => `Mining rewards are paid in Bitcoin, so a higher price lifts the dollar value of every sat while the electricity and service fees (quoted in dollars) stay fixed. At $${c.pk},000, the 100 TH hashrate nets about ${c.u(m.miningMonthlyUSD)}/month, and the ${c.u(m.gmtLockUSD)} of GMT you lock for the ${c.cap}% discount adds roughly ${c.u(m.stakingMonthlyUSD)}/month in staking — about ${c.u(m.monthlyUSD)} combined on ${c.u(m.totalCapital)} of committed capital, ${v}.`,
    p2: c => `The reason a higher Bitcoin price helps so much: your fee is a dollar amount, so as price rises it shrinks as a share of your reward. That's the leverage — and the risk works in reverse if price falls. The locked GMT, meanwhile, is retained capital that keeps paying staking regardless of BTC.`,
    faq: (c, m) => [
      { q: `Is GoMining profitable at $${c.pk}k Bitcoin?`, a: `At a $${c.pk},000 price and current difficulty, a 100 TH GoMining farm nets about ${c.u(m.miningMonthlyUSD)}/month from mining plus ${c.u(m.stakingMonthlyUSD)} from staking the GMT locked for the ${c.cap}% discount — around ${c.u(m.monthlyUSD)} combined on ${c.u(m.totalCapital)} of capital. Earnings scale with your hashrate.` },
      { q: `Why does the Bitcoin price matter so much for GoMining?`, a: `Rewards are paid in Bitcoin but fees are charged in dollars, so a higher BTC price raises your revenue while your cost stays fixed — every dollar of price increase lands in your margin. A falling price does the opposite.` },
      { q: `Does difficulty change these numbers?`, a: `Yes, and this page holds it at today's level rather than guessing where it goes. Rising difficulty steadily reduces the sats each TH earns, so a figure computed at today's difficulty is a snapshot, not a forecast. The calculator lets you project difficulty growth forward and see how much it costs you.` }
    ]
  },
  month: {
    title: c => `Is GoMining Worth It in ${c.month} ${c.year}?`,
    desc: (c, m) => `A ${c.month} ${c.year} snapshot: with Bitcoin at ${c.btc}, a 100 TH GoMining farm plus the GMT locked for the discount nets ~${c.u(m.monthlyUSD)}/mo on ${c.u(m.totalCapital)} of capital. Live numbers.`,
    h1: c => `Is GoMining Worth It in ${c.month} ${c.year}?`,
    lead: c => `A current-conditions snapshot, computed from live Bitcoin price and network difficulty as of ${c.date} — counting the GMT you lock for the discount and its staking.`,
    updated: c => `Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/day &middot; ${c.apr}% GMT staking APR &middot; updated ${c.date}`,
    p1: (c, m, v) => `As of ${c.date}, Bitcoin trades near ${c.btc} and the network mines about ${c.sats} sats per TH per day. On those numbers a 100 TH GoMining farm nets roughly <strong>${c.u(m.miningMonthlyUSD)}/month</strong> from mining, and the ${c.u(m.gmtLockUSD)} of GMT locked for the ${c.cap}% discount adds about ${c.u(m.stakingMonthlyUSD)}/month in staking — around <strong>${c.u(m.monthlyUSD)} combined</strong> on ${c.u(m.totalCapital)} of committed capital. In short, ${v}.`,
    h2: 'What would change this',
    p2: c => `These figures move constantly. A rising Bitcoin price improves margin (fees are fixed in dollars); rising difficulty erodes sats per TH; and letting your GMT coverage lapse can wipe out the discount and gut your net. That's why it pays to check current numbers rather than trust a static estimate — run yours below.`,
    faq: (c, m, y) => [
      { q: `Is GoMining worth it right now?`, a: `As of ${c.date}, with Bitcoin near ${c.btc}, a 100 TH farm nets about ${c.u(m.miningMonthlyUSD)}/month from mining plus ${c.u(m.stakingMonthlyUSD)} from staking the GMT locked for the discount — around ${c.u(m.monthlyUSD)} combined on ${c.u(m.totalCapital)} of committed capital, or ${c.p1(y)}% a year. Whether that's "worth it" depends on your view of Bitcoin's price from here, which is why this page stops at today's numbers.` },
      { q: `How much can you make with GoMining in ${c.year}?`, a: `Earnings scale with hashrate. At current conditions each 100 TH nets roughly ${c.u(m.miningMonthlyUSD)}/month mining plus ${c.u(m.stakingMonthlyUSD)} staking the GMT you lock for the discount. More hashrate earns proportionally more; the discount, staking rate and Bitcoin's price are the main swing factors.` },
      { q: `Is GoMining a scam?`, a: `GoMining is a real service that has paid users for years, though many negative reviews trace to maintenance fees spiking when a user's GMT coverage lapses and the discount is lost — a configuration issue, not a scam. Understanding the fee and discount mechanics is what separates a good outcome from a bad one.` }
    ]
  },
  live: (c, good, bad, yGood, yBad, effBase) =>
`  <div class="formula">Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/day &middot; updated ${c.date}</div>
  <p>Take a 50 TH setup on a new miner (${effBase} W/TH, the only efficiency GoMining sells new). Buying the hashrate costs about
  <strong>${c.u(good.hashCost)}</strong>, and holding the maximum ${c.cap}% fee discount means locking roughly
  <strong>${c.u(good.gmtLockUSD)}</strong> of GMT — <strong>${c.u(good.totalCapital)}</strong> of capital in total.
  That pays about <strong>${c.u(good.monthlyUSD)}/month</strong>, or <strong>${c.p1(yGood)}% a year</strong>
  on the capital committed.</p>
  <p>Run the same 50 TH <em>without</em> the GMT discount and the fee takes most of the margin: the same
  hashrate nets around <strong>${c.u(bad.monthlyUSD)}/month</strong> on ${c.u(bad.totalCapital)} of capital,
  <strong>${c.p1(yBad)}% a year</strong>. That gap is the whole answer to "is it worth it": the hardware
  is not what decides it, the discount is. Both figures are today's, on live price and difficulty — what they
  become depends on Bitcoin, difficulty growth and the ${c.year < 2028 ? '2028 halving' : 'next halving'},
  which is your call to model, not ours to assert.</p>`
};

/* ---------------------------------------------------------------- Spanish (tú) */
T.es = {
  faqTitle: 'Preguntas frecuentes', readNext: 'Lee también:',
  asof: d => `Comisiones y tarifas a fecha de <time data-cfg="meta.updated" data-cfg-fmt="date">${d}</time>. Pueden cambiar.`,
  cta: c => `  <div class="cta">
    <h3>Haz tus propios números, gratis</h3>
    <p>Introduce tu hashrate para ver pérdidas y ganancias en directo con las cifras de hoy &mdash; y proyéctalo con los supuestos que elijas.</p>
    <p style="margin-top:.6rem">¿Nuevo en GoMining? Usa el código <span class="code">RINGO5</span> para desbloquear tres bonos: +${c.ref.pct} % de TH extra en tu primer minero (hasta ${c.ref.cap} TH), ${c.ref.months} mes de VIP Platinum+ y un bono de cashback con la GoMining Card.</p>
    <a href="${c.consoleHref}" class="btn">Abrir la calculadora →</a>
  </div>`,
  verdict: (c, y) => {
    const r = `un ${c.p1(y)} % anual sobre el capital al precio de hoy`;
    if (y >= 20) return `es decir, ${r}: una tasa alta para la minería en la nube, aunque supone mantener el descuento máximo en comisiones`;
    if (y >= 12) return `es decir, ${r}: una tasa sólida siempre que mantengas el descuento en comisiones`;
    if (y >= 6) return `es decir, ${r}: modesta, y bastante mejor si Bitcoin supera la trayectoria modelada`;
    return `es decir, ${r}: una tasa baja, así que el caso depende sobre todo de que Bitcoin supere la trayectoria modelada aquí`;
  },
  stat: { capital: 'Capital total', net: 'Neto / mes', lock: 'GMT que bloquear', perDay: 'Al día', btc: 'Precio de BTC', btcNow: 'Precio de BTC ahora',
    hashPlusLock: (c, a, b) => `${a} hashrate + ${b} bloqueo de GMT`, hashPlusGmt: (c, a, b) => `${a} hashrate + ${b} GMT`,
    miningPlusStaking: (c, a, b) => `${a} minería + ${b} staking`, forCap: c => `para el descuento del ${c.cap} %`,
    yearOnCap: (c, y) => `${c.p1(y)} % anual sobre el capital`, scenario: 'escenario', live: 'en directo' },
  related: { roi: 'Cómo se calcula el ROI', disc: 'El descuento GMT, explicado', promo: 'Código promocional de GoMining (RINGO5)', calc: 'la calculadora',
    worth: '¿Merece la pena GoMining?', worthFull: '¿Merece la pena GoMining? (guía completa)' },
  hash: {
    title: c => `GoMining ${c.th} TH: lo que gana de verdad (${c.year})`,
    desc: (c, f) => `Lo que ganan ${c.th} TH en GoMining al precio de hoy: ${c.u(f.monthlyUSD)}/mes sobre ${c.u(f.totalCapital)} de capital, contando minería, staking y los GMT que bloqueas para el descuento.`,
    h1: c => `GoMining ${c.th} TH: lo que gana de verdad`,
    lead: c => `Exactamente lo que cuesta y te paga una configuración de ${c.th} TH en GoMining al precio y la dificultad de hoy, contando los GMT que debes bloquear para el descuento y el staking que generan, no solo el hashrate.`,
    updated: c => `Cifras en directo &middot; Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/día &middot; ${c.apr} % TAE de staking de GMT &middot; actualizado el ${c.date}`,
    p1: (c, f, v) => `Aquí se compran dos cosas, y la mayoría de las calculadoras solo cuentan la primera. Acuñas ${c.th} TH por unos <strong>${c.u(f.hashCost)}</strong> y, para mantener el descuento máximo del ${c.cap} % en comisiones, debes bloquear unos <strong>${c.u(f.gmtLockUSD)} en GMT</strong> (360 días de cobertura de comisiones): <strong>${c.u(f.totalCapital)}</strong> de capital comprometido en total. En ingresos, el hashrate deja unos ${c.u(f.miningMonthlyUSD)}/mes tras comisiones y la comisión de conversión BTC→GMT (actualmente del ${c.conv} %, puede cambiar), y los GMT bloqueados generan unos ${c.u(f.stakingMonthlyUSD)}/mes de staking al ${c.apr} % TAE: unos ${c.u(f.monthlyUSD)} en total, ${v}.`,
    h2a: 'Por qué los GMT bloqueados no son un coste normal',
    p2: (c, f, none) => `A diferencia del hashrate, los ${c.u(f.gmtLockUSD)} en GMT no se gastan: sigues siendo dueño de los tokens y puedes desbloquearlos después, así que es capital inmovilizado, no dinero perdido (con el riesgo del precio de GMT mientras está bloqueado). Además cumple doble función: reduce tu comisión un ${c.cap} % <em>y</em> genera un ${c.apr} % de staking. Sin ningún descuento, ${c.th} TH dejan solo unos <strong>${c.u(none.monthlyUSD)}/mes</strong> y no inmovilizan GMT, pero renuncias al ahorro en comisiones y al staking. Ese equilibrio es la principal palanca que controlas.`,
    formula: c => `neto diario = minería neta + staking de GMT = (sats/TH/día × ${c.th} TH × BTC − comisión × (1 − descuento)) × 0,98 + GMT bloqueado × TAE ÷ 365\ncapital total = hashrate + GMT bloqueado para el descuento`,
    h2b: 'Por qué esta página no tiene una previsión a varios años',
    p3: c => `Cada cifra de arriba es de hoy: precio de Bitcoin en directo (${c.btc}), dificultad de la red en directo, comisiones actuales y la TAE de staking del ${c.apr} %. Nada se proyecta al futuro, porque un total a varios años impreso en una página estática es una cifra que no elegiste ni puedes revisar, y se leerá como una promesa la etiquetes como la etiquetes. Lo que pase después depende del precio de Bitcoin, del aumento de la dificultad, del halving de ${c.halving} y de si mantienes financiado el descuento. Esos supuestos los fijas tú: hazlo en la calculadora y mira qué cambia.`,
    faq: (c, f, none, cpt) => [
      { q: `¿Cuánto capital necesitas de verdad para ${c.th} TH en GoMining?`, a: `Unos ${c.u(f.totalCapital)} en total: alrededor de ${c.u(f.hashCost)} por ${c.th} TH al precio de minero nuevo de 15 W/TH (~${c.u2(cpt)}/TH), más unos ${c.u(f.gmtLockUSD)} en GMT bloqueados para mantener el descuento máximo del ${c.cap} % en comisiones. Los GMT se conservan, no se gastan. Con el código promocional RINGO5 obtienes un ${c.ref.pct} % más de hashrate por el mismo gasto.` },
      { q: `¿Cuánto ganan ${c.th} TH al mes?`, a: `Al precio actual de Bitcoin de ${c.btc} y con la dificultad actual, ${c.th} TH dejan unos ${c.u(f.miningMonthlyUSD)} al mes de minería tras comisiones y la comisión de conversión BTC→GMT (actualmente del ${c.conv} %, puede cambiar) (con el descuento GMT del ${c.cap} %), más unos ${c.u(f.stakingMonthlyUSD)} del staking de los GMT bloqueados al ${c.apr} % TAE: unos ${c.u(f.monthlyUSD)} en total. Sin el descuento, la minería sola se queda cerca de ${c.u(none.monthlyUSD)}.` },
      { q: `¿Cuánto ganarán ${c.th} TH dentro de unos años?`, a: `Nadie puede decírtelo, y cualquier página que dé una sola cifra está adivinando. Depende del precio de Bitcoin, de lo rápido que crezca la dificultad de la red, de si mantienes financiado el descuento y del halving de ${c.halving}, que reducirá a la mitad la recompensa por bloque. Esta página te da las cifras de hoy, calculadas con datos en directo. Si quieres una proyección, hazla en la calculadora, donde fijas tú los supuestos y puedes ver exactamente cuáles son.` }
    ]
  },
  price: {
    k: c => `${c.pk}k $`, full: c => `${c.n(c.pk * 1000)} $`,
    title: c => `¿Es rentable GoMining si Bitcoin llega a ${c.pk}k $? (${c.year})`,
    desc: (c, m) => `Rendimientos de GoMining con Bitcoin a ${c.n(c.pk * 1000)} $: una granja de 100 TH (más los GMT bloqueados para el descuento) deja unos ${c.u(m.monthlyUSD)}/mes sobre ${c.u(m.totalCapital)} de capital. Dificultad en directo.`,
    h1: c => `Rentabilidad de GoMining con Bitcoin a ${c.pk}k $`,
    lead: c => `Lo que ganaría una granja de GoMining si Bitcoin cotizara a ${c.n(c.pk * 1000)} $, contando los GMT bloqueados para el descuento y su staking, con una configuración de referencia de 100 TH y la dificultad en directo.`,
    updated: c => `Precio del escenario ${c.n(c.pk * 1000)} $ &middot; dificultad en directo ${c.sats} sats/TH/día &middot; ${c.apr} % TAE de staking de GMT &middot; actualizado el ${c.date}`,
    p1: (c, m, v) => `Las recompensas de minería se pagan en Bitcoin, así que un precio más alto sube el valor en dólares de cada sat mientras las comisiones de electricidad y servicio (en dólares) no cambian. A ${c.n(c.pk * 1000)} $, el hashrate de 100 TH deja unos ${c.u(m.miningMonthlyUSD)}/mes, y los ${c.u(m.gmtLockUSD)} en GMT que bloqueas para el descuento del ${c.cap} % suman unos ${c.u(m.stakingMonthlyUSD)}/mes de staking: unos ${c.u(m.monthlyUSD)} en total sobre ${c.u(m.totalCapital)} de capital comprometido, ${v}.`,
    p2: c => `Por qué ayuda tanto un precio de Bitcoin más alto: tu comisión es una cantidad en dólares, así que al subir el precio pesa menos en tu recompensa. Esa es la palanca, y el riesgo funciona al revés si el precio cae. Mientras tanto, los GMT bloqueados son capital que conservas y que sigue generando staking pase lo que pase con BTC.`,
    faq: (c, m) => [
      { q: `¿Es rentable GoMining con Bitcoin a ${c.pk}k $?`, a: `Con un precio de ${c.n(c.pk * 1000)} $ y la dificultad actual, una granja de 100 TH en GoMining deja unos ${c.u(m.miningMonthlyUSD)}/mes de minería más ${c.u(m.stakingMonthlyUSD)} del staking de los GMT bloqueados para el descuento del ${c.cap} %: unos ${c.u(m.monthlyUSD)} en total sobre ${c.u(m.totalCapital)} de capital. Las ganancias crecen con tu hashrate.` },
      { q: `¿Por qué importa tanto el precio de Bitcoin en GoMining?`, a: `Las recompensas se pagan en Bitcoin, pero las comisiones se cobran en dólares, así que un precio de BTC más alto sube tus ingresos mientras tu coste no cambia: cada dólar de subida va a tu margen. Una bajada hace lo contrario.` },
      { q: `¿La dificultad cambia estas cifras?`, a: `Sí, y esta página la mantiene en su nivel actual en lugar de adivinar adónde irá. Una dificultad creciente reduce poco a poco los sats que gana cada TH, así que una cifra calculada con la dificultad de hoy es una foto, no una previsión. La calculadora te deja proyectar el aumento de la dificultad y ver cuánto te cuesta.` }
    ]
  },
  month: {
    title: c => `¿Merece la pena GoMining en ${c.month} de ${c.year}?`,
    desc: (c, m) => `Foto de ${c.month} de ${c.year}: con Bitcoin a ${c.btc}, una granja de 100 TH en GoMining más los GMT bloqueados para el descuento deja ~${c.u(m.monthlyUSD)}/mes sobre ${c.u(m.totalCapital)} de capital. Cifras en directo.`,
    h1: c => `¿Merece la pena GoMining en ${c.month} de ${c.year}?`,
    lead: c => `Una foto de las condiciones actuales, calculada con el precio de Bitcoin y la dificultad de la red en directo a ${c.date}, contando los GMT que bloqueas para el descuento y su staking.`,
    updated: c => `Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/día &middot; ${c.apr} % TAE de staking de GMT &middot; actualizado el ${c.date}`,
    p1: (c, m, v) => `A ${c.date}, Bitcoin cotiza cerca de ${c.btc} y la red mina unos ${c.sats} sats por TH al día. Con esas cifras, una granja de 100 TH en GoMining deja unos <strong>${c.u(m.miningMonthlyUSD)}/mes</strong> de minería, y los ${c.u(m.gmtLockUSD)} en GMT bloqueados para el descuento del ${c.cap} % suman unos ${c.u(m.stakingMonthlyUSD)}/mes de staking: unos <strong>${c.u(m.monthlyUSD)} en total</strong> sobre ${c.u(m.totalCapital)} de capital comprometido. En resumen, ${v}.`,
    h2: 'Qué cambiaría esto',
    p2: c => `Estas cifras cambian constantemente. Un precio de Bitcoin al alza mejora el margen (las comisiones son fijas en dólares); una dificultad al alza reduce los sats por TH; y dejar caducar tu cobertura de GMT puede borrar el descuento y hundir tu neto. Por eso conviene mirar las cifras actuales en lugar de fiarse de una estimación estática: haz las tuyas abajo.`,
    faq: (c, m, y) => [
      { q: `¿Merece la pena GoMining ahora mismo?`, a: `A ${c.date}, con Bitcoin cerca de ${c.btc}, una granja de 100 TH deja unos ${c.u(m.miningMonthlyUSD)}/mes de minería más ${c.u(m.stakingMonthlyUSD)} del staking de los GMT bloqueados para el descuento: unos ${c.u(m.monthlyUSD)} en total sobre ${c.u(m.totalCapital)} de capital comprometido, es decir, un ${c.p1(y)} % anual. Que eso "merezca la pena" depende de lo que pienses del precio de Bitcoin a partir de aquí, por eso esta página se queda en las cifras de hoy.` },
      { q: `¿Cuánto se puede ganar con GoMining en ${c.year}?`, a: `Las ganancias crecen con el hashrate. En las condiciones actuales, cada 100 TH dejan unos ${c.u(m.miningMonthlyUSD)}/mes de minería más ${c.u(m.stakingMonthlyUSD)} del staking de los GMT que bloqueas para el descuento. Más hashrate gana proporcionalmente más; el descuento, la tasa de staking y el precio de Bitcoin son los principales factores.` },
      { q: `¿GoMining es una estafa?`, a: `GoMining es un servicio real que lleva años pagando a sus usuarios, aunque muchas reseñas negativas vienen de comisiones de mantenimiento disparadas cuando caduca la cobertura de GMT de un usuario y pierde el descuento: un problema de configuración, no una estafa. Entender cómo funcionan las comisiones y el descuento es lo que separa un buen resultado de uno malo.` }
    ]
  },
  live: (c, good, bad, yGood, yBad, effBase) =>
`  <div class="formula">Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/día &middot; actualizado el ${c.date}</div>
  <p>Toma una configuración de 50 TH en un minero nuevo (${effBase} W/TH, la única eficiencia que GoMining vende nueva). Comprar el hashrate cuesta unos
  <strong>${c.u(good.hashCost)}</strong>, y mantener el descuento máximo del ${c.cap} % en comisiones exige bloquear unos
  <strong>${c.u(good.gmtLockUSD)}</strong> en GMT: <strong>${c.u(good.totalCapital)}</strong> de capital en total.
  Eso paga unos <strong>${c.u(good.monthlyUSD)}/mes</strong>, es decir, un <strong>${c.p1(yGood)} % anual</strong>
  sobre el capital comprometido.</p>
  <p>Con los mismos 50 TH <em>sin</em> el descuento GMT, la comisión se come casi todo el margen: el mismo
  hashrate deja unos <strong>${c.u(bad.monthlyUSD)}/mes</strong> sobre ${c.u(bad.totalCapital)} de capital,
  un <strong>${c.p1(yBad)} % anual</strong>. Esa diferencia es toda la respuesta a "¿merece la pena?": no lo decide
  el hardware, lo decide el descuento. Ambas cifras son de hoy, con precio y dificultad en directo; en qué se
  conviertan depende de Bitcoin, del aumento de la dificultad y del ${c.year < 2028 ? 'halving de 2028' : 'próximo halving'},
  y eso lo modelas tú, no lo afirmamos nosotros.</p>`
};

/* ---------------------------------------------------------------- French (vous) */
T.fr = {
  faqTitle: 'Questions fréquentes', readNext: 'À lire aussi :',
  asof: d => `Frais et taux au <time data-cfg="meta.updated" data-cfg-fmt="date">${d}</time>. Ils peuvent changer.`,
  cta: c => `  <div class="cta">
    <h3>Faites vos propres calculs, gratuitement</h3>
    <p>Saisissez votre hashrate pour un résultat en direct aux chiffres du jour &mdash; puis projetez-le avec les hypothèses de votre choix.</p>
    <p style="margin-top:.6rem">Nouveau sur GoMining ? Utilisez le code <span class="code">RINGO5</span> pour débloquer trois bonus : +${c.ref.pct} % de TH en bonus sur votre premier mineur (jusqu'à ${c.ref.cap} TH), ${c.ref.months} mois de VIP Platinum+ et un bonus cashback GoMining Card.</p>
    <a href="${c.consoleHref}" class="btn">Ouvrir le calculateur →</a>
  </div>`,
  verdict: (c, y) => {
    const r = `${c.p1(y)} % par an sur le capital au prix du jour`;
    if (y >= 20) return `soit ${r} : un taux élevé pour du cloud mining, à condition de garder la remise maximale sur les frais`;
    if (y >= 12) return `soit ${r} : un taux solide, tant que vous gardez la remise sur les frais`;
    if (y >= 6) return `soit ${r} : modeste, et nettement meilleur si le Bitcoin dépasse la trajectoire modélisée`;
    return `soit ${r} : un taux faible, donc tout repose surtout sur un Bitcoin qui dépasserait la trajectoire modélisée ici`;
  },
  stat: { capital: 'Capital total', net: 'Net / mois', lock: 'GMT à bloquer', perDay: 'Par jour', btc: 'Prix du BTC', btcNow: 'Prix du BTC maintenant',
    hashPlusLock: (c, a, b) => `${a} de hashrate + ${b} de GMT bloqués`, hashPlusGmt: (c, a, b) => `${a} de hashrate + ${b} de GMT`,
    miningPlusStaking: (c, a, b) => `${a} minage + ${b} staking`, forCap: c => `pour la remise de ${c.cap} %`,
    yearOnCap: (c, y) => `${c.p1(y)} % par an sur le capital`, scenario: 'scénario', live: 'en direct' },
  related: { roi: 'Comment le ROI est calculé', disc: 'La remise GMT expliquée', promo: 'Code promo GoMining (RINGO5)', calc: 'le calculateur',
    worth: 'GoMining vaut-il le coup ?', worthFull: 'GoMining vaut-il le coup ? (guide complet)' },
  hash: {
    title: c => `GoMining ${c.th} TH : ce que ça rapporte vraiment (${c.year})`,
    desc: (c, f) => `Ce que rapportent ${c.th} TH sur GoMining au prix du jour : ${c.u(f.monthlyUSD)}/mois pour ${c.u(f.totalCapital)} de capital, minage, staking et GMT bloqués pour la remise compris.`,
    h1: c => `GoMining ${c.th} TH : ce que ça rapporte vraiment`,
    lead: c => `Exactement ce que coûte et rapporte une configuration GoMining de ${c.th} TH au prix et à la difficulté du jour, en comptant les GMT à bloquer pour la remise et leur staking, pas seulement le hashrate.`,
    updated: c => `Chiffres en direct &middot; Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/jour &middot; APR de staking GMT ${c.apr} % &middot; mis à jour le ${c.date}`,
    p1: (c, f, v) => `On achète ici deux choses, et la plupart des calculateurs ne comptent que la première. Vous créez ${c.th} TH pour environ <strong>${c.u(f.hashCost)}</strong> et, pour garder la remise maximale de ${c.cap} % sur les frais, vous devez bloquer environ <strong>${c.u(f.gmtLockUSD)} de GMT</strong> (360 jours de couverture des frais) : <strong>${c.u(f.totalCapital)}</strong> de capital engagé au total. Côté revenus, le hashrate rapporte environ ${c.u(f.miningMonthlyUSD)}/mois après frais et frais de conversion BTC→GMT (actuellement ${c.conv} %, susceptibles de changer), et les GMT bloqués rapportent environ ${c.u(f.stakingMonthlyUSD)}/mois de staking à ${c.apr} % d'APR : environ ${c.u(f.monthlyUSD)} au total, ${v}.`,
    h2a: 'Pourquoi les GMT bloqués ne sont pas un coût comme un autre',
    p2: (c, f, none) => `Contrairement au hashrate, les ${c.u(f.gmtLockUSD)} de GMT ne sont pas dépensés : vous restez propriétaire des jetons et pouvez les débloquer plus tard, c'est donc du capital immobilisé et non de l'argent perdu (avec le risque lié au prix du GMT pendant le blocage). Ils servent aussi deux fois : ils réduisent vos frais de ${c.cap} % <em>et</em> rapportent ${c.apr} % de staking. Sans aucune remise, ${c.th} TH ne rapportent qu'environ <strong>${c.u(none.monthlyUSD)}/mois</strong> et n'immobilisent aucun GMT, mais vous renoncez à l'économie sur les frais et au staking. Cet arbitrage est le principal levier que vous contrôlez.`,
    formula: c => `net quotidien = minage net + staking GMT = (sats/TH/jour × ${c.th} TH × BTC − frais × (1 − remise)) × 0,98 + GMT bloqués × APR ÷ 365\ncapital total = hashrate + GMT bloqués pour la remise`,
    h2b: 'Pourquoi cette page ne donne pas de prévision sur plusieurs années',
    p3: c => `Chaque chiffre ci-dessus est celui du jour : prix du Bitcoin en direct (${c.btc}), difficulté du réseau en direct, frais actuels et APR de staking de ${c.apr} %. Rien n'est projeté, car un total sur plusieurs années imprimé dans une page statique est un chiffre que vous n'avez pas choisi et ne pouvez pas vérifier, et il sera lu comme une promesse quelle que soit l'étiquette. La suite dépend du prix du Bitcoin, de la hausse de la difficulté, du halving de ${c.halving} et du maintien de votre remise. Ces hypothèses vous appartiennent : fixez-les dans le calculateur et observez ce qui bouge.`,
    faq: (c, f, none, cpt) => [
      { q: `Quel capital faut-il vraiment pour ${c.th} TH sur GoMining ?`, a: `Environ ${c.u(f.totalCapital)} au total : environ ${c.u(f.hashCost)} pour ${c.th} TH au prix d'un mineur neuf à 15 W/TH (~${c.u2(cpt)}/TH), plus environ ${c.u(f.gmtLockUSD)} de GMT bloqués pour garder la remise maximale de ${c.cap} % sur les frais. Les GMT sont conservés, pas dépensés. Avec le code promo RINGO5, vous obtenez ${c.ref.pct} % de hashrate en plus pour la même dépense.` },
      { q: `Combien rapportent ${c.th} TH par mois ?`, a: `Au prix actuel du Bitcoin de ${c.btc} et à la difficulté actuelle, ${c.th} TH rapportent environ ${c.u(f.miningMonthlyUSD)} par mois de minage après frais et frais de conversion BTC→GMT (actuellement ${c.conv} %, susceptibles de changer) (avec la remise GMT de ${c.cap} %), plus environ ${c.u(f.stakingMonthlyUSD)} de staking des GMT bloqués à ${c.apr} % d'APR : environ ${c.u(f.monthlyUSD)} au total. Sans la remise, le minage seul tourne plutôt autour de ${c.u(none.monthlyUSD)}.` },
      { q: `Combien rapporteront ${c.th} TH dans quelques années ?`, a: `Personne ne peut vous le dire, et toute page qui avance un chiffre unique devine. Cela dépend du prix du Bitcoin, de la vitesse de hausse de la difficulté du réseau, du maintien de votre remise et du halving de ${c.halving}, qui divisera par deux la récompense par bloc. Cette page vous donne les chiffres du jour, calculés à partir de données en direct. Pour une projection, utilisez le calculateur : vous y fixez vous-même les hypothèses et voyez exactement lesquelles.` }
    ]
  },
  price: {
    k: c => `${c.pk} k$`, full: c => `${c.n(c.pk * 1000)} $`,
    title: c => `GoMining est-il rentable si le Bitcoin atteint ${c.pk} k$ ? (${c.year})`,
    desc: (c, m) => `Rendements GoMining avec un Bitcoin à ${c.n(c.pk * 1000)} $ : une ferme de 100 TH (plus les GMT bloqués pour la remise) rapporte environ ${c.u(m.monthlyUSD)}/mois pour ${c.u(m.totalCapital)} de capital. Difficulté en direct.`,
    h1: c => `Rentabilité de GoMining avec un Bitcoin à ${c.pk} k$`,
    lead: c => `Ce que rapporterait une ferme GoMining si le Bitcoin valait ${c.n(c.pk * 1000)} $, en comptant les GMT bloqués pour la remise et leur staking, sur une configuration de référence de 100 TH à la difficulté du jour.`,
    updated: c => `Prix du scénario ${c.n(c.pk * 1000)} $ &middot; difficulté en direct ${c.sats} sats/TH/jour &middot; APR de staking GMT ${c.apr} % &middot; mis à jour le ${c.date}`,
    p1: (c, m, v) => `Les récompenses de minage sont payées en Bitcoin : un prix plus élevé augmente la valeur en dollars de chaque sat, tandis que les frais d'électricité et de service (en dollars) restent fixes. À ${c.n(c.pk * 1000)} $, le hashrate de 100 TH rapporte environ ${c.u(m.miningMonthlyUSD)}/mois, et les ${c.u(m.gmtLockUSD)} de GMT bloqués pour la remise de ${c.cap} % ajoutent environ ${c.u(m.stakingMonthlyUSD)}/mois de staking : environ ${c.u(m.monthlyUSD)} au total pour ${c.u(m.totalCapital)} de capital engagé, ${v}.`,
    p2: c => `Pourquoi un Bitcoin plus cher aide autant : vos frais sont un montant en dollars, donc quand le prix monte, ils pèsent moins dans votre récompense. C'est l'effet de levier, et le risque joue dans l'autre sens si le prix baisse. Les GMT bloqués, eux, restent un capital conservé qui continue de rapporter du staking quel que soit le BTC.`,
    faq: (c, m) => [
      { q: `GoMining est-il rentable avec un Bitcoin à ${c.pk} k$ ?`, a: `Avec un prix de ${c.n(c.pk * 1000)} $ et la difficulté actuelle, une ferme GoMining de 100 TH rapporte environ ${c.u(m.miningMonthlyUSD)}/mois de minage plus ${c.u(m.stakingMonthlyUSD)} de staking des GMT bloqués pour la remise de ${c.cap} % : environ ${c.u(m.monthlyUSD)} au total pour ${c.u(m.totalCapital)} de capital. Les gains augmentent avec votre hashrate.` },
      { q: `Pourquoi le prix du Bitcoin compte-t-il autant sur GoMining ?`, a: `Les récompenses sont payées en Bitcoin mais les frais sont facturés en dollars : un BTC plus cher augmente vos revenus alors que votre coût reste fixe, chaque dollar de hausse va dans votre marge. Une baisse fait l'inverse.` },
      { q: `La difficulté change-t-elle ces chiffres ?`, a: `Oui, et cette page la garde à son niveau actuel plutôt que de deviner son évolution. Une difficulté croissante réduit peu à peu les sats gagnés par TH, donc un chiffre calculé à la difficulté du jour est un instantané, pas une prévision. Le calculateur vous permet de projeter la hausse de la difficulté et de voir ce qu'elle vous coûte.` }
    ]
  },
  month: {
    title: c => `GoMining vaut-il le coup en ${c.month} ${c.year} ?`,
    desc: (c, m) => `Instantané de ${c.month} ${c.year} : avec un Bitcoin à ${c.btc}, une ferme GoMining de 100 TH plus les GMT bloqués pour la remise rapporte ~${c.u(m.monthlyUSD)}/mois pour ${c.u(m.totalCapital)} de capital. Chiffres en direct.`,
    h1: c => `GoMining vaut-il le coup en ${c.month} ${c.year} ?`,
    lead: c => `Un instantané des conditions actuelles, calculé à partir du prix du Bitcoin et de la difficulté du réseau en direct au ${c.date}, en comptant les GMT bloqués pour la remise et leur staking.`,
    updated: c => `Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/jour &middot; APR de staking GMT ${c.apr} % &middot; mis à jour le ${c.date}`,
    p1: (c, m, v) => `Au ${c.date}, le Bitcoin s'échange autour de ${c.btc} et le réseau mine environ ${c.sats} sats par TH et par jour. Sur ces chiffres, une ferme GoMining de 100 TH rapporte environ <strong>${c.u(m.miningMonthlyUSD)}/mois</strong> de minage, et les ${c.u(m.gmtLockUSD)} de GMT bloqués pour la remise de ${c.cap} % ajoutent environ ${c.u(m.stakingMonthlyUSD)}/mois de staking : environ <strong>${c.u(m.monthlyUSD)} au total</strong> pour ${c.u(m.totalCapital)} de capital engagé. En bref, ${v}.`,
    h2: 'Ce qui pourrait changer la donne',
    p2: c => `Ces chiffres bougent en permanence. Un Bitcoin en hausse améliore la marge (les frais sont fixes en dollars) ; une difficulté en hausse érode les sats par TH ; et laisser expirer votre couverture GMT peut faire disparaître la remise et plomber votre net. C'est pourquoi il vaut mieux vérifier les chiffres actuels que se fier à une estimation figée : faites les vôtres ci-dessous.`,
    faq: (c, m, y) => [
      { q: `GoMining vaut-il le coup en ce moment ?`, a: `Au ${c.date}, avec un Bitcoin autour de ${c.btc}, une ferme de 100 TH rapporte environ ${c.u(m.miningMonthlyUSD)}/mois de minage plus ${c.u(m.stakingMonthlyUSD)} de staking des GMT bloqués pour la remise : environ ${c.u(m.monthlyUSD)} au total pour ${c.u(m.totalCapital)} de capital engagé, soit ${c.p1(y)} % par an. Savoir si cela « vaut le coup » dépend de votre vision du prix du Bitcoin, c'est pourquoi cette page s'arrête aux chiffres du jour.` },
      { q: `Combien peut-on gagner avec GoMining en ${c.year} ?`, a: `Les gains augmentent avec le hashrate. Aux conditions actuelles, chaque tranche de 100 TH rapporte environ ${c.u(m.miningMonthlyUSD)}/mois de minage plus ${c.u(m.stakingMonthlyUSD)} de staking des GMT bloqués pour la remise. Plus de hashrate rapporte proportionnellement plus ; la remise, le taux de staking et le prix du Bitcoin sont les principaux facteurs.` },
      { q: `GoMining est-il une arnaque ?`, a: `GoMining est un vrai service qui paie ses utilisateurs depuis des années, même si beaucoup d'avis négatifs viennent de frais de maintenance qui s'envolent quand la couverture GMT d'un utilisateur expire et qu'il perd la remise : un problème de configuration, pas une arnaque. Comprendre les frais et la remise fait toute la différence entre un bon et un mauvais résultat.` }
    ]
  },
  live: (c, good, bad, yGood, yBad, effBase) =>
`  <div class="formula">Bitcoin ${c.btc} &middot; ${c.sats} sats/TH/jour &middot; mis à jour le ${c.date}</div>
  <p>Prenez une configuration de 50 TH sur un mineur neuf (${effBase} W/TH, la seule efficacité que GoMining vend en neuf). Acheter le hashrate coûte environ
  <strong>${c.u(good.hashCost)}</strong>, et garder la remise maximale de ${c.cap} % sur les frais impose de bloquer environ
  <strong>${c.u(good.gmtLockUSD)}</strong> de GMT : <strong>${c.u(good.totalCapital)}</strong> de capital au total.
  Cela rapporte environ <strong>${c.u(good.monthlyUSD)}/mois</strong>, soit <strong>${c.p1(yGood)} % par an</strong>
  sur le capital engagé.</p>
  <p>Avec les mêmes 50 TH <em>sans</em> la remise GMT, les frais absorbent l'essentiel de la marge : le même
  hashrate rapporte environ <strong>${c.u(bad.monthlyUSD)}/mois</strong> pour ${c.u(bad.totalCapital)} de capital,
  <strong>${c.p1(yBad)} % par an</strong>. Cet écart résume la réponse à « est-ce que ça vaut le coup » : ce n'est pas
  le matériel qui décide, c'est la remise. Les deux chiffres sont ceux du jour, au prix et à la difficulté en direct ; leur
  évolution dépend du Bitcoin, de la hausse de la difficulté et du ${c.year < 2028 ? 'halving de 2028' : 'prochain halving'},
  et c'est à vous de la modéliser, pas à nous de l'affirmer.</p>`
};

/* ---------------------------------------------------------------- German (du) */
T.de = {
  faqTitle: 'Häufige Fragen', readNext: 'Weiterlesen:',
  asof: d => `Gebühren und Raten Stand <time data-cfg="meta.updated" data-cfg-fmt="date">${d}</time>. Sie können sich ändern.`,
  cta: c => `  <div class="cta">
    <h3>Rechne selbst nach, kostenlos</h3>
    <p>Gib deine Hashrate ein und sieh den Live-Gewinn mit den heutigen Zahlen &mdash; und rechne ihn dann mit selbst gewählten Annahmen hoch.</p>
    <p style="margin-top:.6rem">Neu bei GoMining? Nutze den Code <span class="code">RINGO5</span> und schalte drei Boni frei: +${c.ref.pct} % Bonus-TH auf deinen ersten Miner (bis zu ${c.ref.cap} TH), ${c.ref.months} Monat VIP Platinum+ und einen GoMining-Card-Cashback-Bonus.</p>
    <a href="${c.consoleHref}" class="btn">Rechner öffnen →</a>
  </div>`,
  verdict: (c, y) => {
    const r = `${c.p1(y)} % pro Jahr aufs Kapital zum heutigen Kurs`;
    if (y >= 20) return `das sind ${r}: eine starke Rendite für Cloud-Mining, vorausgesetzt, du hältst den maximalen Gebührenrabatt`;
    if (y >= 12) return `das sind ${r}: eine solide Rendite, solange du den Gebührenrabatt hältst`;
    if (y >= 6) return `das sind ${r}: bescheiden, und deutlich besser, wenn Bitcoin den modellierten Verlauf übertrifft`;
    return `das sind ${r}: eine dünne Rendite, die Rechnung hängt also vor allem davon ab, dass Bitcoin den hier modellierten Verlauf übertrifft`;
  },
  stat: { capital: 'Gesamtkapital', net: 'Netto / Monat', lock: 'Zu sperrende GMT', perDay: 'Pro Tag', btc: 'BTC-Kurs', btcNow: 'BTC-Kurs jetzt',
    hashPlusLock: (c, a, b) => `${a} Hashrate + ${b} GMT-Sperre`, hashPlusGmt: (c, a, b) => `${a} Hashrate + ${b} GMT`,
    miningPlusStaking: (c, a, b) => `${a} Mining + ${b} Staking`, forCap: c => `für den Rabatt von ${c.cap} %`,
    yearOnCap: (c, y) => `${c.p1(y)} % pro Jahr aufs Kapital`, scenario: 'Szenario', live: 'live' },
  related: { roi: 'So wird der ROI berechnet', disc: 'Der GMT-Rabatt erklärt', promo: 'GoMining-Promo-Code (RINGO5)', calc: 'der Rechner',
    worth: 'Lohnt sich GoMining?', worthFull: 'Lohnt sich GoMining? (ganzer Ratgeber)' },
  hash: {
    title: c => `GoMining ${c.th} TH: Was es wirklich verdient (${c.year})`,
    desc: (c, f) => `Was ${c.th} TH bei GoMining zum heutigen Kurs verdienen: ${c.u(f.monthlyUSD)}/Monat auf ${c.u(f.totalCapital)} Kapital, mit Mining, Staking und den GMT, die du für den Rabatt sperrst.`,
    h1: c => `GoMining ${c.th} TH: Was es wirklich verdient`,
    lead: c => `Genau, was ein GoMining-Setup mit ${c.th} TH zu heutigem Kurs und heutiger Difficulty kostet und einbringt, inklusive der GMT, die du für den Rabatt sperren musst, und ihres Stakings, nicht nur die Hashrate.`,
    updated: c => `Live-Zahlen &middot; Bitcoin ${c.btc} &middot; ${c.sats} Sats/TH/Tag &middot; ${c.apr} % GMT-Staking-APR &middot; aktualisiert am ${c.date}`,
    p1: (c, f, v) => `Hier wird zweierlei gekauft, und die meisten Rechner zählen nur das Erste. Du mintest ${c.th} TH für etwa <strong>${c.u(f.hashCost)}</strong>, und um den maximalen Gebührenrabatt von ${c.cap} % zu halten, musst du rund <strong>${c.u(f.gmtLockUSD)} in GMT</strong> sperren (360 Tage Gebührendeckung): insgesamt <strong>${c.u(f.totalCapital)}</strong> eingesetztes Kapital. Auf der Ertragsseite bringt die Hashrate nach Gebühren und der BTC→GMT-Umtauschgebühr (derzeit ${c.conv} %, kann sich ändern) etwa ${c.u(f.miningMonthlyUSD)}/Monat, und die gesperrten GMT bringen rund ${c.u(f.stakingMonthlyUSD)}/Monat Staking bei ${c.apr} % APR: zusammen etwa ${c.u(f.monthlyUSD)}, ${v}.`,
    h2a: 'Warum die gesperrten GMT keine normalen Kosten sind',
    p2: (c, f, none) => `Anders als die Hashrate werden die ${c.u(f.gmtLockUSD)} in GMT nicht ausgegeben: Die Token gehören weiter dir und lassen sich später entsperren, es ist also gebundenes Kapital und kein verlorenes Geld (mit GMT-Kursrisiko, solange es gesperrt ist). Außerdem leisten sie doppelte Arbeit: Sie senken deine Gebühr um ${c.cap} % <em>und</em> bringen ${c.apr} % Staking. Ganz ohne Rabatt bringen ${c.th} TH nur etwa <strong>${c.u(none.monthlyUSD)}/Monat</strong> und binden keine GMT, aber du verschenkst die Gebührenersparnis und das Staking. Dieser Zielkonflikt ist der wichtigste Hebel, den du in der Hand hast.`,
    formula: c => `Netto pro Tag = Mining netto + GMT-Staking = (Sats/TH/Tag × ${c.th} TH × BTC − Gebühr × (1 − Rabatt)) × 0,98 + gesperrte GMT × APR ÷ 365\nGesamtkapital = Hashrate + für den Rabatt gesperrte GMT`,
    h2b: 'Warum diese Seite keine Mehrjahresprognose zeigt',
    p3: c => `Jede Zahl oben ist von heute: Live-Bitcoin-Kurs (${c.btc}), Live-Netzwerk-Difficulty, aktuelle Gebühren und ${c.apr} % Staking-APR. Nichts davon wird hochgerechnet, denn eine Mehrjahressumme auf einer statischen Seite ist eine Zahl, die du weder gewählt hast noch prüfen kannst, und sie wird als Versprechen gelesen, egal wie man sie beschriftet. Was danach passiert, hängt vom Bitcoin-Kurs, dem Difficulty-Anstieg, dem Halving ${c.halving} und davon ab, ob du den Rabatt finanziert hältst. Diese Annahmen triffst du selbst: im Rechner, und dann siehst du, was sich bewegt.`,
    faq: (c, f, none, cpt) => [
      { q: `Wie viel Kapital brauchst du wirklich für ${c.th} TH bei GoMining?`, a: `Insgesamt etwa ${c.u(f.totalCapital)}: rund ${c.u(f.hashCost)} für ${c.th} TH zum Neupreis für 15-W/TH-Miner (~${c.u2(cpt)}/TH), plus etwa ${c.u(f.gmtLockUSD)} in gesperrten GMT für den maximalen Gebührenrabatt von ${c.cap} %. Die GMT bleiben dir, sie werden nicht ausgegeben. Mit dem Promo-Code RINGO5 bekommst du für denselben Betrag ${c.ref.pct} % mehr Hashrate.` },
      { q: `Wie viel verdienen ${c.th} TH pro Monat?`, a: `Zum heutigen Bitcoin-Kurs von ${c.btc} und bei aktueller Difficulty bringen ${c.th} TH nach Gebühren und der BTC→GMT-Umtauschgebühr (derzeit ${c.conv} %, kann sich ändern) (mit dem GMT-Rabatt von ${c.cap} %) etwa ${c.u(f.miningMonthlyUSD)} pro Monat aus Mining, plus rund ${c.u(f.stakingMonthlyUSD)} aus dem Staking der gesperrten GMT bei ${c.apr} % APR: zusammen etwa ${c.u(f.monthlyUSD)}. Ohne Rabatt liegt Mining allein eher bei ${c.u(none.monthlyUSD)}.` },
      { q: `Was verdienen ${c.th} TH in ein paar Jahren?`, a: `Das kann dir niemand sagen, und jede Seite, die eine einzelne Zahl nennt, rät. Es hängt vom Bitcoin-Kurs ab, davon, wie schnell die Netzwerk-Difficulty steigt, ob du den Gebührenrabatt finanziert hältst, und vom Halving ${c.halving}, das die Blocksubvention halbiert. Diese Seite liefert dir die heutigen Zahlen aus Live-Daten. Für eine Prognose nutze den Rechner: Dort legst du die Annahmen selbst fest und siehst genau, welche es sind.` }
    ]
  },
  price: {
    k: c => `${c.pk}k $`, full: c => `${c.n(c.pk * 1000)} $`,
    title: c => `Ist GoMining profitabel, wenn Bitcoin ${c.pk}k $ erreicht? (${c.year})`,
    desc: (c, m) => `GoMining-Erträge bei einem Bitcoin-Kurs von ${c.n(c.pk * 1000)} $: Eine 100-TH-Farm (plus die für den Rabatt gesperrten GMT) bringt etwa ${c.u(m.monthlyUSD)}/Monat auf ${c.u(m.totalCapital)} Kapital. Live-Difficulty.`,
    h1: c => `GoMining-Rentabilität bei ${c.pk}k $ Bitcoin`,
    lead: c => `Was eine GoMining-Farm verdienen würde, wenn Bitcoin bei ${c.n(c.pk * 1000)} $ stünde, mit den für den Rabatt gesperrten GMT und ihrem Staking, für ein Referenz-Setup mit 100 TH bei Live-Difficulty.`,
    updated: c => `Szenariokurs ${c.n(c.pk * 1000)} $ &middot; Live-Difficulty ${c.sats} Sats/TH/Tag &middot; ${c.apr} % GMT-Staking-APR &middot; aktualisiert am ${c.date}`,
    p1: (c, m, v) => `Mining-Belohnungen werden in Bitcoin ausgezahlt, ein höherer Kurs steigert also den Dollarwert jedes Sats, während Strom- und Servicegebühren (in Dollar) gleich bleiben. Bei ${c.n(c.pk * 1000)} $ bringt die 100-TH-Hashrate etwa ${c.u(m.miningMonthlyUSD)}/Monat, und die ${c.u(m.gmtLockUSD)} in GMT, die du für den Rabatt von ${c.cap} % sperrst, bringen rund ${c.u(m.stakingMonthlyUSD)}/Monat Staking: zusammen etwa ${c.u(m.monthlyUSD)} auf ${c.u(m.totalCapital)} eingesetztes Kapital, ${v}.`,
    p2: c => `Warum ein höherer Bitcoin-Kurs so viel hilft: Deine Gebühr ist ein Dollarbetrag, sie fällt bei steigendem Kurs also immer weniger ins Gewicht. Das ist der Hebel, und das Risiko wirkt umgekehrt, wenn der Kurs fällt. Die gesperrten GMT bleiben derweil Kapital, das dir gehört und unabhängig vom BTC weiter Staking bringt.`,
    faq: (c, m) => [
      { q: `Ist GoMining bei ${c.pk}k $ Bitcoin profitabel?`, a: `Bei einem Kurs von ${c.n(c.pk * 1000)} $ und aktueller Difficulty bringt eine 100-TH-GoMining-Farm etwa ${c.u(m.miningMonthlyUSD)}/Monat aus Mining plus ${c.u(m.stakingMonthlyUSD)} aus dem Staking der für den Rabatt von ${c.cap} % gesperrten GMT: zusammen rund ${c.u(m.monthlyUSD)} auf ${c.u(m.totalCapital)} Kapital. Die Erträge wachsen mit deiner Hashrate.` },
      { q: `Warum ist der Bitcoin-Kurs für GoMining so wichtig?`, a: `Belohnungen kommen in Bitcoin, Gebühren werden in Dollar berechnet: Ein höherer BTC-Kurs hebt deine Einnahmen, während deine Kosten gleich bleiben, jeder Dollar Kursanstieg landet in deiner Marge. Ein fallender Kurs bewirkt das Gegenteil.` },
      { q: `Verändert die Difficulty diese Zahlen?`, a: `Ja, und diese Seite hält sie auf dem heutigen Stand, statt zu raten, wohin sie geht. Steigende Difficulty senkt stetig die Sats pro TH, eine Zahl zur heutigen Difficulty ist also eine Momentaufnahme, keine Prognose. Im Rechner kannst du den Difficulty-Anstieg hochrechnen und sehen, was er dich kostet.` }
    ]
  },
  month: {
    title: c => `Lohnt sich GoMining im ${c.month} ${c.year}?`,
    desc: (c, m) => `Momentaufnahme ${c.month} ${c.year}: Bei einem Bitcoin-Kurs von ${c.btc} bringt eine 100-TH-GoMining-Farm plus die für den Rabatt gesperrten GMT ~${c.u(m.monthlyUSD)}/Monat auf ${c.u(m.totalCapital)} Kapital. Live-Zahlen.`,
    h1: c => `Lohnt sich GoMining im ${c.month} ${c.year}?`,
    lead: c => `Eine Momentaufnahme der aktuellen Lage, berechnet aus Live-Bitcoin-Kurs und Netzwerk-Difficulty am ${c.date}, mit den für den Rabatt gesperrten GMT und ihrem Staking.`,
    updated: c => `Bitcoin ${c.btc} &middot; ${c.sats} Sats/TH/Tag &middot; ${c.apr} % GMT-Staking-APR &middot; aktualisiert am ${c.date}`,
    p1: (c, m, v) => `Am ${c.date} steht Bitcoin bei rund ${c.btc}, und das Netzwerk mined etwa ${c.sats} Sats pro TH und Tag. Mit diesen Zahlen bringt eine 100-TH-GoMining-Farm rund <strong>${c.u(m.miningMonthlyUSD)}/Monat</strong> aus Mining, und die ${c.u(m.gmtLockUSD)} in GMT, gesperrt für den Rabatt von ${c.cap} %, bringen etwa ${c.u(m.stakingMonthlyUSD)}/Monat Staking: zusammen rund <strong>${c.u(m.monthlyUSD)}</strong> auf ${c.u(m.totalCapital)} eingesetztes Kapital. Kurz gesagt: ${v}.`,
    h2: 'Was das ändern würde',
    p2: c => `Diese Zahlen bewegen sich ständig. Ein steigender Bitcoin-Kurs verbessert die Marge (Gebühren sind in Dollar fix); steigende Difficulty frisst Sats pro TH; und wenn deine GMT-Deckung ausläuft, kann der Rabatt wegfallen und dein Netto einbrechen. Deshalb lohnt es sich, aktuelle Zahlen zu prüfen, statt einer statischen Schätzung zu trauen: Rechne deine unten durch.`,
    faq: (c, m, y) => [
      { q: `Lohnt sich GoMining gerade?`, a: `Am ${c.date}, bei einem Bitcoin-Kurs um ${c.btc}, bringt eine 100-TH-Farm etwa ${c.u(m.miningMonthlyUSD)}/Monat aus Mining plus ${c.u(m.stakingMonthlyUSD)} aus dem Staking der für den Rabatt gesperrten GMT: zusammen rund ${c.u(m.monthlyUSD)} auf ${c.u(m.totalCapital)} eingesetztes Kapital, also ${c.p1(y)} % pro Jahr. Ob sich das „lohnt“, hängt von deiner Sicht auf den Bitcoin-Kurs ab, deshalb bleibt diese Seite bei den heutigen Zahlen.` },
      { q: `Wie viel kann man ${c.year} mit GoMining verdienen?`, a: `Die Erträge wachsen mit der Hashrate. Unter den aktuellen Bedingungen bringen je 100 TH rund ${c.u(m.miningMonthlyUSD)}/Monat aus Mining plus ${c.u(m.stakingMonthlyUSD)} aus dem Staking der für den Rabatt gesperrten GMT. Mehr Hashrate verdient proportional mehr; Rabatt, Staking-Rate und Bitcoin-Kurs sind die wichtigsten Stellschrauben.` },
      { q: `Ist GoMining Betrug?`, a: `GoMining ist ein echter Dienst, der seine Nutzer seit Jahren auszahlt, auch wenn viele negative Bewertungen auf stark gestiegene Wartungsgebühren zurückgehen, wenn die GMT-Deckung eines Nutzers ausläuft und der Rabatt wegfällt: ein Einstellungsproblem, kein Betrug. Wer Gebühren und Rabatt versteht, landet beim guten statt beim schlechten Ergebnis.` }
    ]
  },
  live: (c, good, bad, yGood, yBad, effBase) =>
`  <div class="formula">Bitcoin ${c.btc} &middot; ${c.sats} Sats/TH/Tag &middot; aktualisiert am ${c.date}</div>
  <p>Nimm ein 50-TH-Setup auf einem neuen Miner (${effBase} W/TH, die einzige Effizienz, die GoMining neu verkauft). Die Hashrate kostet etwa
  <strong>${c.u(good.hashCost)}</strong>, und für den maximalen Gebührenrabatt von ${c.cap} % musst du rund
  <strong>${c.u(good.gmtLockUSD)}</strong> in GMT sperren: insgesamt <strong>${c.u(good.totalCapital)}</strong> Kapital.
  Das bringt etwa <strong>${c.u(good.monthlyUSD)}/Monat</strong>, also <strong>${c.p1(yGood)} % pro Jahr</strong>
  auf das eingesetzte Kapital.</p>
  <p>Dieselben 50 TH <em>ohne</em> GMT-Rabatt: Die Gebühr frisst den Großteil der Marge, dieselbe
  Hashrate bringt etwa <strong>${c.u(bad.monthlyUSD)}/Monat</strong> auf ${c.u(bad.totalCapital)} Kapital,
  <strong>${c.p1(yBad)} % pro Jahr</strong>. Dieser Abstand ist die ganze Antwort auf „Lohnt es sich?“: Nicht die Hardware
  entscheidet, sondern der Rabatt. Beide Zahlen sind von heute, mit Live-Kurs und -Difficulty; was daraus wird, hängt
  von Bitcoin, dem Difficulty-Anstieg und dem ${c.year < 2028 ? 'Halving 2028' : 'nächsten Halving'} ab,
  und das modellierst du, nicht wir.</p>`
};

module.exports = T;
