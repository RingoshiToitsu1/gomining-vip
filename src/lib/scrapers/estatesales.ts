import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeEstateSales({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  // EstateSales.net search is client-side only (Angular SPA).
  // We extract popular marketplace items from server-rendered NGRX_STATE
  // and filter to Michigan / Detroit metro area only.
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

  const stateScript = $("script#estatesales-net-state").html();
  if (!stateScript) return [];

  try {
    const state = JSON.parse(stateScript);
    const items =
      state?.NGRX_STATE?.ui?.marketplace?.marketplaceLanding?.popularItems || [];

    for (const item of items as any[]) {
      if (results.length >= maxResults) break;

      const stateCode = (item.stateCode || "").toUpperCase();

      // Only include Michigan listings
      if (stateCode !== "MI") continue;

      const name = item.name || "";
      const imgUrl =
        item.mainPicture?.url ||
        item.mainPicture?.thumbnailUrl ||
        "";

      if (!imgUrl) continue;

      results.push({
        id: `esnet-${item.id || results.length}`,
        title: name,
        desc: item.plainTextDescription || "",
        category: "OTHER",
        condition: "",
        img: imgUrl,
        images: [imgUrl],
        price: item.currentPrice || item.currentBidPrice || 0,
        appraised: null,
        low: null,
        high: null,
        source: "ESTATESALES_NET",
        loc: item.cityName && stateCode
          ? `${item.cityName}, ${stateCode}`
          : "",
        tags: query.toLowerCase().split(/\s+/).filter(Boolean),
        views: item.numberOfBids || 0,
        seller: item.orgName || "Estate Sale",
        time: new Date().toISOString(),
        extUrl: `https://www.estatesales.net/marketplace/items/${item.id}`,
      });
    }
  } catch {
    // Parse failed
  }

  return results;
}
