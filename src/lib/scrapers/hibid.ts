import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeHibid({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  const url = `https://www.hibid.com/lots?q=${encodeURIComponent(query)}`;

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

  // Try embedded JSON state first
  const scriptContent = $("script")
    .toArray()
    .map((s) => $(s).html() || "")
    .find((s) => s.includes("__APOLLO_STATE__") || s.includes("window.__data"));

  if (scriptContent) {
    try {
      const jsonMatch = scriptContent.match(
        /(?:__APOLLO_STATE__|window\.__data)\s*=\s*({[\s\S]*?});/
      );
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        const lots = Object.values(data).filter(
          (v: any) => v?.__typename === "Lot" || v?.lotNumber
        ) as any[];
        for (const lot of lots.slice(0, maxResults)) {
          results.push({
            id: `hibid-${lot.id || lot.lotId || results.length}`,
            title: lot.title || lot.name || "",
            desc: lot.description || "",
            category: "OTHER",
            condition: "",
            img: lot.imageUrl || lot.thumbnailUrl || "",
            price: lot.currentBid || lot.startingBid || 0,
            appraised: null,
            low: null,
            high: null,
            source: "HIBID",
            loc: lot.location || "",
            tags: query.toLowerCase().split(/\s+/).filter(Boolean),
            views: 0,
            seller: lot.auctioneerName || "HiBid Auction",
            time: lot.endDate || new Date().toISOString(),
            extUrl: lot.url
              ? `https://www.hibid.com${lot.url}`
              : `https://www.hibid.com/lots?q=${encodeURIComponent(query)}`,
          });
        }
        if (results.length > 0) return results;
      }
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Fallback: parse HTML lot cards
  $(".lot-tile, .lot-card, a[href*='/lot/']").each((i, el) => {
    if (results.length >= maxResults) return false;

    const $el = $(el);
    const link = $el.is("a") ? $el.attr("href") : $el.find("a").first().attr("href");
    const title =
      $el.find(".lot-title, .title, h3, h4").first().text().trim() ||
      $el.text().trim().slice(0, 80);

    if (!title) return;

    const priceText =
      $el.find(".current-bid, .price, .bid-amount").first().text().trim() || "";
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;

    const img =
      $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";

    results.push({
      id: `hibid-${i}`,
      title,
      desc: "",
      category: "OTHER",
      condition: "",
      img,
      price,
      appraised: null,
      low: null,
      high: null,
      source: "HIBID",
      loc: "",
      tags: query.toLowerCase().split(/\s+/).filter(Boolean),
      views: 0,
      seller: "HiBid Auction",
      time: new Date().toISOString(),
      extUrl: link
        ? link.startsWith("http")
          ? link
          : `https://www.hibid.com${link}`
        : url,
    });
  });

  return results;
}
