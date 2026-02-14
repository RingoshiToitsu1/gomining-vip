import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeAuctionNinja({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  const url = `https://www.auctionninja.com/marketplace-items?keyword=${encodeURIComponent(query)}`;

  try {
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

    $(".iteam-result-box").each((i, el) => {
      if (results.length >= maxResults) return false;

      const $el = $(el);
      const title = $el.find(".hot-items-title a").first().text().trim();
      if (!title) return;

      const priceText = $el.find(".hot-items-bottoms p").first().text().trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;

      const img = $el.find(".single-item img").attr("src") || "";
      const link = $el.find(".hot-items-title a").attr("href") || "";
      const seller = $el.find(".hi-auction-company-title a").first().text().trim();
      const location = $el.find(".hi-auction-company > p").first().text().trim();

      results.push({
        id: `aucninja-${i}`,
        title,
        desc: "",
        category: "OTHER",
        condition: "",
        img: img.startsWith("http") ? img : img ? `https://www.auctionninja.com${img}` : "",
        images: [(img.startsWith("http") ? img : img ? `https://www.auctionninja.com${img}` : "")].filter(Boolean),
        price,
        appraised: null,
        low: null,
        high: null,
        source: "AUCTION_NINJA",
        loc: location || "",
        tags: query.toLowerCase().split(/\s+/).filter(Boolean),
        views: 0,
        seller: seller || "Auction Ninja",
        time: new Date().toISOString(),
        extUrl: link.startsWith("http") ? link : link ? `https://www.auctionninja.com${link}` : url,
      });
    });

    return results;
  } catch {
    return [];
  }
}
