import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeAuctionNinja({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  const urls = [
    `https://www.auctionninja.com/search-result/?keyword=${encodeURIComponent(query)}`,
    `https://www.auctionninja.com/search/?q=${encodeURIComponent(query)}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);
      const results: ScrapedResult[] = [];

      $(
        ".auction-iteam-detail, .auction-item-detail, .item-card, .lot-item"
      ).each((i, el) => {
        if (results.length >= maxResults) return false;

        const $el = $(el);
        const title =
          $el.find("h3, h4, .item-title, .lot-title").first().text().trim() ||
          $el.find("a").first().text().trim();

        if (!title) return;

        const priceText =
          $el.find(".price, .bid, .current-bid").first().text().trim() || "";
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        const price = priceMatch
          ? parseFloat(priceMatch[0].replace(/,/g, ""))
          : 0;

        const img =
          $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";
        const link =
          $el.find("a").attr("href") || $el.closest("a").attr("href") || "";

        const location = $el.find(".location, .loc").first().text().trim();

        results.push({
          id: `aucninja-${i}`,
          title,
          desc: "",
          category: "OTHER",
          condition: "",
          img: img.startsWith("http")
            ? img
            : img
              ? `https://www.auctionninja.com${img}`
              : "",
          price,
          appraised: null,
          low: null,
          high: null,
          source: "AUCTION_NINJA",
          loc: location || "",
          tags: query.toLowerCase().split(/\s+/).filter(Boolean),
          views: 0,
          seller: "Auction Ninja",
          time: new Date().toISOString(),
          extUrl: link.startsWith("http")
            ? link
            : link
              ? `https://www.auctionninja.com${link}`
              : url,
        });
      });

      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }

  return [];
}
