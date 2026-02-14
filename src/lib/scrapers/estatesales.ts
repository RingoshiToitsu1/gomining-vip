import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeEstateSales({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  // EstateSales.net search is client-side only; the marketplace page
  // server-renders popular items via NGRX_STATE that we can extract
  const url = `https://www.estatesales.net/marketplace`;

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

  // Extract NGRX_STATE from the embedded JSON script tag
  const stateScript = $("script#estatesales-net-state").html();
  if (stateScript) {
    try {
      const state = JSON.parse(stateScript);
      const items =
        state?.NGRX_STATE?.ui?.marketplace?.marketplaceLanding?.popularItems || [];

      const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

      for (const item of (items as any[])) {
        if (results.length >= maxResults) break;

        const name = item.name || "";
        const desc = item.plainTextDescription || "";

        // Filter by query terms if possible (since server doesn't filter for us)
        const text = `${name} ${desc}`.toLowerCase();
        const matches = queryWords.length === 0 || queryWords.some((w) => text.includes(w));
        if (!matches) continue;

        const imgUrl =
          item.mainPicture?.url ||
          item.mainPicture?.thumbnailUrl ||
          "";

        results.push({
          id: `esnet-${item.id || results.length}`,
          title: name,
          desc,
          category: "OTHER",
          condition: "",
          img: imgUrl,
          price: item.currentPrice || item.currentBidPrice || 0,
          appraised: null,
          low: null,
          high: null,
          source: "ESTATESALES_NET",
          loc: item.cityName && item.stateCode
            ? `${item.cityName}, ${item.stateCode}`
            : "",
          tags: queryWords,
          views: item.numberOfBids || 0,
          seller: item.orgName || "Estate Sale",
          time: new Date().toISOString(),
          extUrl: `https://www.estatesales.net/marketplace/items/${item.id}`,
        });
      }

      if (results.length > 0) return results;
    } catch {
      // Fall through
    }
  }

  // If no NGRX items matched, return popular items unfiltered
  if (results.length === 0 && stateScript) {
    try {
      const state = JSON.parse(stateScript);
      const items =
        state?.NGRX_STATE?.ui?.marketplace?.marketplaceLanding?.popularItems || [];

      for (const item of (items as any[]).slice(0, maxResults)) {
        const imgUrl =
          item.mainPicture?.url ||
          item.mainPicture?.thumbnailUrl ||
          "";
        if (!imgUrl) continue;

        results.push({
          id: `esnet-${item.id || results.length}`,
          title: item.name || "",
          desc: item.plainTextDescription || "",
          category: "OTHER",
          condition: "",
          img: imgUrl,
          price: item.currentPrice || item.currentBidPrice || 0,
          appraised: null,
          low: null,
          high: null,
          source: "ESTATESALES_NET",
          loc: item.cityName && item.stateCode
            ? `${item.cityName}, ${item.stateCode}`
            : "",
          tags: query.toLowerCase().split(/\s+/).filter(Boolean),
          views: item.numberOfBids || 0,
          seller: item.orgName || "Estate Sale",
          time: new Date().toISOString(),
          extUrl: `https://www.estatesales.net/marketplace/items/${item.id}`,
        });
      }
    } catch {
      // Fall through
    }
  }

  return results;
}
