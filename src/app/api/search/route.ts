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
