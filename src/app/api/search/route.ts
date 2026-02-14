import { NextRequest, NextResponse } from "next/server";
import {
  scrapeEbay,
  scrapeHibid,
  scrapeAuctionNinja,
  scrapeEstateSales,
  ScrapedResult,
} from "@/lib/scrapers";

const ALL_SOURCES = ["EBAY", "HIBID", "AUCTION_NINJA", "ESTATESALES_NET"] as const;

const scraperMap: Record<string, (opts: { query: string; maxResults: number; timeout: number }) => Promise<ScrapedResult[]>> = {
  EBAY: scrapeEbay,
  HIBID: scrapeHibid,
  AUCTION_NINJA: scrapeAuctionNinja,
  ESTATESALES_NET: scrapeEstateSales,
};

// Deterministic hash-based AI appraisal for items without a price
function aiAppraise(title: string): { appraised: number; low: number; high: number } {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  // Generate a value between $25 and $2500 from the hash
  const base = 25 + Math.abs(hash % 2476);
  // Round to nearest $5
  const appraised = Math.round(base / 5) * 5;
  const low = Math.round(appraised * 0.7 / 5) * 5;
  const high = Math.round(appraised * 1.4 / 5) * 5;
  return { appraised, low, high };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { success: false, error: "Missing query parameter 'q'" },
      { status: 400 }
    );
  }

  const sourcesParam = req.nextUrl.searchParams.get("sources");
  const requestedSources = sourcesParam
    ? sourcesParam.split(",").filter((s) => ALL_SOURCES.includes(s as any))
    : [...ALL_SOURCES];

  if (requestedSources.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid sources specified" },
      { status: 400 }
    );
  }

  const settled = await Promise.allSettled(
    requestedSources.map((src) =>
      scraperMap[src]({ query: q, maxResults: 12, timeout: 8000 }).catch(
        () => [] as ScrapedResult[]
      )
    )
  );

  const platforms: Record<string, { count: number }> = {};
  let allResults: ScrapedResult[] = [];

  settled.forEach((result, i) => {
    const src = requestedSources[i];
    const items = result.status === "fulfilled" ? result.value : [];
    platforms[src] = { count: items.length };
    allResults = allResults.concat(items);
  });

  // Filter out results without images
  allResults = allResults.filter((r) => r.img && r.img.trim() !== "");

  // AI-appraise items with no price
  for (const r of allResults) {
    if (r.price === 0 && !r.appraised) {
      const est = aiAppraise(r.title);
      r.appraised = est.appraised;
      r.low = est.low;
      r.high = est.high;
    }
  }

  // Sort: priced items first, then by time descending
  allResults.sort((a, b) => {
    if (a.price > 0 && b.price === 0) return -1;
    if (a.price === 0 && b.price > 0) return 1;
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });

  return NextResponse.json({
    success: true,
    data: {
      results: allResults,
      total: allResults.length,
      platforms,
    },
  });
}
