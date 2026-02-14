import * as cheerio from "cheerio";
import { ScrapedResult, ScraperOptions } from "./types";

export async function scrapeEbay({
  query,
  maxResults = 12,
  timeout = 8000,
}: ScraperOptions): Promise<ScrapedResult[]> {
  // eBay aggressively blocks server-side scraping with CAPTCHA.
  // Try multiple approaches in order of reliability.

  // Approach 1: eBay API-like endpoint (public search suggestions + items)
  try {
    const apiUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(query)}&paginationInput.entriesPerPage=${maxResults}`;

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (res.ok) {
      const json = await res.json();
      const items =
        json?.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
      const results: ScrapedResult[] = [];

      for (const item of items) {
        if (results.length >= maxResults) break;
        const title = item.title?.[0] || "";
        if (!title) continue;

        const price = parseFloat(
          item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0"
        );
        const img = item.galleryURL?.[0] || "";
        const link = item.viewItemURL?.[0] || "";
        const condition = item.condition?.[0]?.conditionDisplayName?.[0] || "";
        const location = item.location?.[0] || "";
        const itemId = item.itemId?.[0] || `${results.length}`;

        results.push({
          id: `ebay-${itemId}`,
          title,
          desc: "",
          category: "OTHER",
          condition,
          img: img.replace(/s-l\d+/, "s-l600"),
          images: [img.replace(/s-l\d+/, "s-l600")],
          price,
          appraised: null,
          low: null,
          high: null,
          source: "EBAY",
          loc: location,
          tags: query.toLowerCase().split(/\s+/).filter(Boolean),
          views: 0,
          seller: "eBay Seller",
          time: item.listingInfo?.[0]?.startTime?.[0] || new Date().toISOString(),
          extUrl: link,
        });
      }

      if (results.length > 0) return results;
    }
  } catch {
    // Fall through to HTML scraping
  }

  // Approach 2: Direct HTML scraping (works when not blocked by CAPTCHA)
  try {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) return [];
    const html = await res.text();
    if (html.includes("Pardon Our Interruption") || html.length < 50000) return [];

    const $ = cheerio.load(html);
    const results: ScrapedResult[] = [];

    // New eBay card structure (2025+)
    $("ul.srp-results > li.s-card").each((i, el) => {
      if (results.length >= maxResults) return false;
      const $el = $(el);
      const title = $el.find(".s-card__title .su-styled-text").first().text().trim();
      if (!title || title === "Shop on eBay") return;

      const priceText = $el.find("span.s-card__price").first().text().trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;
      const img = $el.find("img").first().attr("src") || "";
      const itemUrl = $el.find("a.s-card__link").attr("href") || "";
      const condition = $el.find(".s-card__subtitle .su-styled-text").first().text().trim();
      const itemId = itemUrl.match(/\/(\d+)\?/)?.[1] || `${i}`;

      results.push({
        id: `ebay-${itemId}`,
        title,
        desc: "",
        category: "OTHER",
        condition: condition || "",
        img: img.replace(/s-l\d+/, "s-l600"),
        images: [img.replace(/s-l\d+/, "s-l600")],
        price,
        appraised: null,
        low: null,
        high: null,
        source: "EBAY",
        loc: "",
        tags: query.toLowerCase().split(/\s+/).filter(Boolean),
        views: 0,
        seller: "eBay Seller",
        time: new Date().toISOString(),
        extUrl: itemUrl,
      });
    });

    // Legacy eBay structure fallback
    if (results.length === 0) {
      $("div.s-item__wrapper").each((i, el) => {
        if (results.length >= maxResults) return false;
        const $el = $(el);
        const title = $el.find(".s-item__title span").first().text().trim();
        if (!title || title === "Shop on eBay") return;

        const priceText = $el.find(".s-item__price").first().text().trim();
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : 0;
        const img = $el.find(".s-item__image-wrapper img").attr("src") || "";
        const itemUrl = $el.find("a.s-item__link").attr("href") || "";
        const itemId = itemUrl.match(/\/(\d+)\?/)?.[1] || `${i}`;

        results.push({
          id: `ebay-${itemId}`,
          title,
          desc: "",
          category: "OTHER",
          condition: "",
          img: img.replace(/s-l\d+/, "s-l600"),
          images: [img.replace(/s-l\d+/, "s-l600")],
          price,
          appraised: null,
          low: null,
          high: null,
          source: "EBAY",
          loc: "",
          tags: query.toLowerCase().split(/\s+/).filter(Boolean),
          views: 0,
          seller: "eBay Seller",
          time: new Date().toISOString(),
          extUrl: itemUrl,
        });
      });
    }

    return results;
  } catch {
    return [];
  }
}
