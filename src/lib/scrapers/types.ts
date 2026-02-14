export interface ScrapedResult {
  id: string;
  title: string;
  desc: string;
  category: string;
  condition: string;
  img: string;
  price: number;
  appraised: number | null;
  low: number | null;
  high: number | null;
  source: "EBAY" | "HIBID" | "AUCTION_NINJA" | "ESTATESALES_NET";
  loc: string;
  tags: string[];
  views: number;
  seller: string;
  time: string;
  extUrl: string;
}

export interface ScraperOptions {
  query: string;
  maxResults?: number;
  timeout?: number;
}
