// nft-lookup — reads one GoMining marketplace miner for the /gomining-marketplace-checker page.
//
// GoMining's NFT endpoint is public (no login) but sends no CORS header, so a browser on
// gmt-optimizer.com can't read it directly. This function is the smallest possible bridge:
// it takes a numeric miner id (the number in app.gomining.com/nft/view/<id>), fetches that one
// record, and returns only the fields the checker prices from. It is deliberately NOT a general
// proxy — one upstream URL, a digits-only id, and an origin allowlist.
//
// Deploy (JWT check off: the page calls it anonymously, the origin allowlist is the gate):
//   npx supabase functions deploy nft-lookup --no-verify-jwt --project-ref cbatlxqlmeyuhwqpczpv

const UPSTREAM = "https://api.gomining.com/api/nft/get-by-external-url-id";
const ALLOWED = new Set([
  "https://gmt-optimizer.com",
  "https://www.gmt-optimizer.com",
  "https://ringoshitoitsu1.github.io",
]);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.has(origin) ? origin : "https://gmt-optimizer.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": cache },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, origin);
  if (origin && !ALLOWED.has(origin)) return json({ error: "origin_not_allowed" }, 403, origin);

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return json({ error: "bad_id" }, 400, origin);

  let r: Response;
  try {
    r = await fetch(`${UPSTREAM}?externalUrlId=${id}`, {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (gmt-optimizer.com marketplace checker)" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (_) {
    return json({ error: "upstream_unreachable" }, 502, origin);
  }
  if (r.status === 404) return json({ error: "not_found" }, 404, origin);
  if (!r.ok) return json({ error: "upstream_" + r.status }, 502, origin);

  let d: Record<string, any> | undefined;
  try { d = (await r.json())?.data; } catch (_) { /* fall through */ }
  if (!d || typeof d !== "object") return json({ error: "not_found" }, 404, origin);

  // Only what the checker needs. GoMining's own ROI block is dropped on purpose: the page
  // prices from the site's calibrated model, not the seller-facing payback estimate.
  return json({
    id: String(d.externalUrlId ?? id),
    name: d.name ?? null,
    image: d.smallImageUrl ?? d.imageUrl ?? null,
    power: Number(d.power) || 0,
    efficiency: Number(d.energyEfficiency) || 0,
    price: d.price == null ? null : Number(d.price),
    priceUsdt: d.priceUsdt == null ? null : Number(d.priceUsdt),
    status: d.status ?? null,
    marketplace: d.marketplace ?? null,
    saleType: d.marketplaceOrderSaleType ?? null,
    auction: d.auction ?? null,
    level: d.level ?? null,
    network: d.network ?? null,
    type: d.type?.name ?? null,
    updatedAt: d.updatedAt ?? null,
  }, 200, origin, "public, max-age=60");
});
