import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const maxDuration = 15;

const ALLOWED_HOSTS = [
  "ebay.com", "www.ebay.com",
  "hibid.com", "www.hibid.com",
  "auctionninja.com", "www.auctionninja.com",
  "estatesales.net", "www.estatesales.net",
];

function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

function dedupe(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter(u => {
    if (!u || u.length < 10 || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

// Filter out tiny icons, tracking pixels, logos, etc.
function isItemImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (/logo|icon|avatar|badge|sprite|pixel|tracking|spacer|blank|favicon/i.test(lower)) return false;
  if (/1x1|\.gif$/i.test(lower)) return false;
  // Must look like an image URL
  if (/\.(jpg|jpeg|png|webp)/i.test(lower)) return true;
  // CDN URLs that serve images without extensions
  if (/ebayimg\.com|cloudfront\.net|amazonaws\.com|auctionninja\.com.*upload|estatesales\.net.*photo/i.test(lower)) return true;
  return false;
}

// Extract image URLs from raw HTML text using regex patterns (catches JS-rendered URLs in script blocks)
function extractUrlsFromText(html: string, host: string): string[] {
  const images: string[] = [];

  if (host.includes("ebay.com")) {
    // eBay embeds high-res image URLs in scripts and JSON
    const ebayPattern = /https?:\/\/i\.ebayimg\.com\/images\/g\/[^\s"',}]+/g;
    const matches = html.match(ebayPattern) || [];
    for (let m of matches) {
      m = m.replace(/\\u002F/g, "/").replace(/\\/g, "");
      // Upgrade to large size
      m = m.replace(/s-l\d+/, "s-l800");
      if (!m.includes("s-l64") && !m.includes("s-l96") && !m.includes("s-l140")) {
        images.push(m);
      }
    }
  }

  if (host.includes("hibid.com")) {
    // HiBid uses cloudfront/S3 for images
    const hibidPattern = /https?:\/\/[a-z0-9.-]*(?:cloudfront\.net|amazonaws\.com|hibid\.com)[^\s"',}]*?(?:\.jpg|\.jpeg|\.png|\.webp)[^\s"',}]*/gi;
    const matches = html.match(hibidPattern) || [];
    for (let m of matches) {
      m = m.replace(/\\/g, "");
      if (isItemImage(m)) images.push(m);
    }
    // Also look for image URLs in JSON data embedded in page
    const jsonImgPattern = /"(?:imageUrl|thumbnailUrl|imagePath|photoUrl|src)"\s*:\s*"(https?:\/\/[^"]+)"/g;
    let match;
    while ((match = jsonImgPattern.exec(html)) !== null) {
      const u = match[1].replace(/\\/g, "");
      if (isItemImage(u)) images.push(u);
    }
  }

  if (host.includes("auctionninja.com")) {
    const anPattern = /https?:\/\/(?:www\.)?auctionninja\.com[^\s"',}]*?(?:\.jpg|\.jpeg|\.png|\.webp)[^\s"',}]*/gi;
    const matches = html.match(anPattern) || [];
    for (let m of matches) {
      m = m.replace(/\\/g, "");
      if (isItemImage(m)) images.push(m);
    }
    // Also look for relative image paths in uploads
    const relPattern = /(?:\/uploads\/[^\s"',}]*?(?:\.jpg|\.jpeg|\.png|\.webp))/gi;
    const relMatches = html.match(relPattern) || [];
    for (const rm of relMatches) {
      images.push(`https://www.auctionninja.com${rm}`);
    }
  }

  if (host.includes("estatesales.net")) {
    // Extract all image URLs from the raw HTML/JSON
    const esPattern = /https?:\/\/[^\s"',}]*estatesales[^\s"',}]*?(?:\.jpg|\.jpeg|\.png|\.webp)[^\s"',}]*/gi;
    const matches = html.match(esPattern) || [];
    for (let m of matches) {
      m = m.replace(/\\/g, "").replace(/\\u002F/g, "/");
      if (isItemImage(m)) images.push(m);
    }
    // Also look for any CDN image URLs
    const cdnPattern = /https?:\/\/[^\s"',}]*(?:cloudfront\.net|amazonaws\.com|cloudinary\.com)[^\s"',}]*?(?:\.jpg|\.jpeg|\.png|\.webp)[^\s"',}]*/gi;
    const cdnMatches = html.match(cdnPattern) || [];
    for (let m of cdnMatches) {
      m = m.replace(/\\/g, "");
      if (isItemImage(m)) images.push(m);
    }
  }

  return images;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json(
      { success: false, error: "Missing url parameter" },
      { status: 400 }
    );
  }

  if (!isAllowedUrl(url)) {
    return NextResponse.json(
      { success: false, error: "URL not from a supported platform" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch listing (${res.status})` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const images: string[] = [];
    const host = new URL(url).hostname;

    // 1. Extract from JSON-LD structured data (works on most platforms)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "");
        const extract = (obj: any) => {
          if (!obj || typeof obj !== "object") return;
          if (typeof obj === "string" && isItemImage(obj)) { images.push(obj); return; }
          if (obj.image) {
            const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
            for (const im of imgs) {
              const u = typeof im === "string" ? im : im?.url || im?.contentUrl;
              if (u && isItemImage(u)) images.push(u);
            }
          }
          if (obj.contentUrl && isItemImage(obj.contentUrl)) images.push(obj.contentUrl);
          if (obj.thumbnailUrl && isItemImage(obj.thumbnailUrl)) images.push(obj.thumbnailUrl);
          for (const val of Object.values(obj)) {
            if (Array.isArray(val)) val.forEach(extract);
            else if (typeof val === "object") extract(val);
          }
        };
        extract(data);
      } catch { /* ignore */ }
    });

    // 2. Extract from OpenGraph / meta tags
    $('meta[property="og:image"], meta[name="og:image"], meta[property="twitter:image"]').each((_, el) => {
      const src = $(el).attr("content") || "";
      if (src && isItemImage(src)) images.push(src);
    });

    // 3. Extract from img tags (cheerio)
    $("img").each((_, el) => {
      for (const attr of ["src", "data-src", "data-zoom-src", "data-large", "data-original"]) {
        const src = $(el).attr(attr) || "";
        if (src && isItemImage(src)) {
          images.push(src.startsWith("http") ? src : src.startsWith("//") ? `https:${src}` : "");
        }
      }
    });

    // 4. Extract from srcset attributes
    $("img[srcset], source[srcset]").each((_, el) => {
      const srcset = $(el).attr("srcset") || "";
      const parts = srcset.split(",").map(s => s.trim().split(/\s+/)[0]);
      for (const src of parts) {
        if (src && isItemImage(src)) {
          images.push(src.startsWith("http") ? src : src.startsWith("//") ? `https:${src}` : "");
        }
      }
    });

    // 5. Regex scan raw HTML for image URLs in scripts/JSON (catches SPA-embedded data)
    const textImages = extractUrlsFromText(html, host);
    images.push(...textImages);

    // eBay-specific: upgrade all ebayimg URLs to large
    const processed = images.map(u => {
      if (u.includes("ebayimg.com")) return u.replace(/s-l\d+/, "s-l800");
      return u;
    }).filter(u => u.startsWith("http"));

    const unique = dedupe(processed).slice(0, 20);

    return NextResponse.json({ success: true, images: unique });
  } catch (error) {
    console.error("GET /api/listing-images error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch listing images" },
      { status: 500 }
    );
  }
}
