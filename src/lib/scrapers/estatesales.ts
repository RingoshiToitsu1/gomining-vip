import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeEstateSales({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  const url = `https://www.estatesales.net/find-sales?searchKeyword=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: ScrapedResult[] = [];

  // Try embedded NGRX state
  const scriptContent = $("script")
    .toArray()
    .map((s) => $(s).html() || "")
    .find((s) => s.includes("NGRX_STATE") || s.includes("__INITIAL_STATE__"));

  if (scriptContent) {
    try {
      const jsonMatch = scriptContent.match(
        /(?:NGRX_STATE|__INITIAL_STATE__)\s*=\s*({[\s\S]*?});/
      );
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        const sales = (data?.sales?.list || data?.sales || []) as any[];
        for (const sale of sales.slice(0, maxResults)) {
          results.push({
            id: `esnet-${sale.id || sale.saleId || results.length}`,
            title: sale.title || sale.name || "",
            desc: sale.description || sale.highlights || "",
            category: "OTHER",
            condition: "",
            img: sale.imageUrl || sale.mainPicUrl || sale.thumbUrl || "",
            price: 0,
            appraised: null,
            low: null,
            high: null,
            source: "ESTATESALES_NET",
            loc: sale.address
              ? `${sale.address.city || ""}, ${sale.address.state || ""}`.trim()
              : sale.location || "",
            tags: query.toLowerCase().split(/\s+/).filter(Boolean),
            views: 0,
            seller: sale.company?.name || sale.companyName || "Estate Sale",
            time: sale.dates?.[0]?.startDate || sale.startDate || new Date().toISOString(),
            extUrl: sale.url
              ? sale.url.startsWith("http")
                ? sale.url
                : `https://www.estatesales.net${sale.url}`
              : `https://www.estatesales.net/find-sales?searchKeyword=${encodeURIComponent(query)}`,
          });
        }
        if (results.length > 0) return results;
      }
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Fallback: parse HTML sale rows
  $(".sale-row, .sale-card, .sale-item, [class*='sale']")
    .filter((_, el) => {
      const $el = $(el);
      return !!$el.find("a[href*='/sale/'], a[href*='estatesales.net']").length ||
        !!$el.find("h2, h3, .sale-title").length;
    })
    .each((i, el) => {
      if (results.length >= maxResults) return false;

      const $el = $(el);
      const title =
        $el.find("h2, h3, .sale-title, .title").first().text().trim() ||
        $el.find("a").first().text().trim();

      if (!title || title.length < 5) return;

      const img =
        $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";
      const link =
        $el.find("a[href*='/sale/'], a").first().attr("href") || "";
      const location =
        $el.find(".location, .address, .sale-location").first().text().trim();
      const dateText =
        $el.find(".dates, .sale-dates, .date").first().text().trim();
      const company =
        $el.find(".company, .sale-company, .hosted-by").first().text().trim();

      results.push({
        id: `esnet-${i}`,
        title,
        desc: "",
        category: "OTHER",
        condition: "",
        img: img.startsWith("http")
          ? img
          : img
            ? `https://www.estatesales.net${img}`
            : "",
        price: 0,
        appraised: null,
        low: null,
        high: null,
        source: "ESTATESALES_NET",
        loc: location || "",
        tags: query.toLowerCase().split(/\s+/).filter(Boolean),
        views: 0,
        seller: company || "Estate Sale",
        time: dateText
          ? new Date(dateText).toISOString()
          : new Date().toISOString(),
        extUrl: link.startsWith("http")
          ? link
          : link
            ? `https://www.estatesales.net${link}`
            : url,
      });
    });

  return results;
}
