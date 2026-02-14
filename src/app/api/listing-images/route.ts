import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const maxDuration = 15;

const ALLOWED_HOSTS = [
  "ebay.com", "www.ebay.com", "i.ebayimg.com",
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
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
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

    if (host.includes("ebay.com")) {
      // eBay: gallery images in the picture panel
      $('img[src*="ebayimg.com"]').each((_, el) => {
        let src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && !src.includes("s-l64") && !src.includes("s-l96")) {
          src = src.replace(/s-l\d+/, "s-l800");
          images.push(src);
        }
      });
      // Also check image URLs in JSON-LD or data attributes
      $('img[data-zoom-src]').each((_, el) => {
        const src = $(el).attr("data-zoom-src") || "";
        if (src) images.push(src);
      });
    } else if (host.includes("hibid.com")) {
      $("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && (src.includes("cloudfront") || src.includes("hibid") || src.includes("amazonaws")) && !src.includes("logo") && !src.includes("icon")) {
          images.push(src);
        }
      });
    } else if (host.includes("auctionninja.com")) {
      $("img").each((_, el) => {
        let src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && !src.includes("logo") && !src.includes("icon") && !src.includes("avatar")) {
          if (!src.startsWith("http")) src = `https://www.auctionninja.com${src}`;
          images.push(src);
        }
      });
    } else if (host.includes("estatesales.net")) {
      // Try embedded JSON state first
      const scriptMatch = html.match(/window\['NGRX_STATE'\]\s*=\s*({[\s\S]*?});?\s*<\/script/);
      if (scriptMatch) {
        try {
          const state = JSON.parse(scriptMatch[1]);
          const walk = (obj: any) => {
            if (!obj || typeof obj !== "object") return;
            if (obj.url && typeof obj.url === "string" && /\.(jpg|jpeg|png|webp)/i.test(obj.url)) {
              images.push(obj.url);
            }
            if (obj.thumbnailUrl && typeof obj.thumbnailUrl === "string" && /\.(jpg|jpeg|png|webp)/i.test(obj.thumbnailUrl)) {
              images.push(obj.thumbnailUrl);
            }
            for (const val of Object.values(obj)) {
              if (Array.isArray(val)) val.forEach(walk);
              else if (typeof val === "object") walk(val);
            }
          };
          walk(state);
        } catch { /* fall through to img tags */ }
      }
      if (images.length === 0) {
        $("img").each((_, el) => {
          const src = $(el).attr("src") || $(el).attr("data-src") || "";
          if (src && /\.(jpg|jpeg|png|webp)/i.test(src) && !src.includes("logo") && !src.includes("icon")) {
            images.push(src);
          }
        });
      }
    } else {
      // Generic: grab all reasonable images
      $("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && /\.(jpg|jpeg|png|webp)/i.test(src) && !src.includes("logo") && !src.includes("icon")) {
          images.push(src);
        }
      });
    }

    const unique = dedupe(images).slice(0, 20);

    return NextResponse.json({ success: true, images: unique });
  } catch (error) {
    console.error("GET /api/listing-images error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch listing images" },
      { status: 500 }
    );
  }
}
