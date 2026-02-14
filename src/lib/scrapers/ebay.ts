import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeEbay({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0`;

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

  $("div.s-item__wrapper").each((i, el) => {
    if (results.length >= maxResults) return false;

    const $el = $(el);
    const title = $el.find(".s-item__title span").first().text().trim();
    if (!title || title === "Shop on eBay") return;

    const priceText = $el.find(".s-item__price").first().text().trim();
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;

    const img =
      $el.find(".s-item__image-wrapper img").attr("src") ||
      $el.find(".s-item__image-wrapper img").attr("data-src") ||
      "";

    const condition = $el.find(".SECONDARY_INFO").text().trim();
    const itemUrl = $el.find("a.s-item__link").attr("href") || "";
    const location = $el.find(".s-item__location").text().replace("from ", "").trim();
    const seller = $el.find(".s-item__seller-info-text").text().trim();

    const itemId = itemUrl.match(/\/(\d+)\?/)?.[1] || `${i}`;

    results.push({
      id: `ebay-${itemId}`,
      title,
      desc: "",
      category: "OTHER",
      condition: condition || "",
      img: img.replace(/s-l\d+/, "s-l600"),
      price,
      appraised: null,
      low: null,
      high: null,
      source: "EBAY",
      loc: location || "",
      tags: query.toLowerCase().split(/\s+/).filter(Boolean),
      views: 0,
      seller: seller || "eBay Seller",
      time: new Date().toISOString(),
      extUrl: itemUrl,
    });
  });

  return results;
}
