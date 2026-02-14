import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ============================================
// Tailwind Class Merge Helper
// ============================================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================
// Slug Generator
// ============================================

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 60) + '-' + Math.random().toString(36).substring(2, 8);
}

// ============================================
// Price Formatter
// ============================================

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}

// ============================================
// Date Formatter
// ============================================

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

// ============================================
// Relative Time (e.g., "2 hours ago")
// ============================================

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(date);
}

// ============================================
// Image URL helpers
// ============================================

export function getImageUrl(url: string, width?: number): string {
  // If using UploadThing or similar, you can add transformation params
  if (width && url.includes('uploadthing')) {
    return `${url}?w=${width}`;
  }
  return url;
}

// ============================================
// Excluded Words Check
// ============================================

const DEFAULT_EXCLUDED_WORDS = [
  // Add prohibited words here
  'replica',
  'counterfeit',
  'fake',
  'knockoff',
];

export function checkExcludedWords(
  text: string,
  customExcludedWords: string[] = []
): { hasExcluded: boolean; foundWords: string[] } {
  const allExcluded = [...DEFAULT_EXCLUDED_WORDS, ...customExcludedWords];
  const words = text.toLowerCase().split(/\s+/);
  const foundWords = allExcluded.filter((excluded) =>
    words.some((word) => word.includes(excluded.toLowerCase()))
  );

  return {
    hasExcluded: foundWords.length > 0,
    foundWords,
  };
}

// ============================================
// Truncate Text
// ============================================

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + '...';
}

// ============================================
// Condition Display Labels
// ============================================

export const conditionLabels: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like New',
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  FOR_PARTS: 'For Parts',
};

// ============================================
// Category Display Labels
// ============================================

export const categoryLabels: Record<string, string> = {
  FURNITURE: 'Furniture',
  ELECTRONICS: 'Electronics',
  CLOTHING: 'Clothing',
  JEWELRY: 'Jewelry',
  ART: 'Art',
  COLLECTIBLES: 'Collectibles',
  ANTIQUES: 'Antiques',
  TOOLS: 'Tools',
  KITCHENWARE: 'Kitchenware',
  BOOKS: 'Books',
  TOYS: 'Toys',
  SPORTS: 'Sports',
  AUTOMOTIVE: 'Automotive',
  HOME_DECOR: 'Home Decor',
  MUSICAL_INSTRUMENTS: 'Musical Instruments',
  COINS_CURRENCY: 'Coins & Currency',
  WATCHES: 'Watches',
  OTHER: 'Other',
};

// ============================================
// Source Display Labels
// ============================================

export const sourceLabels: Record<string, string> = {
  DIRECT: 'Look4it',
  HIBID: 'HiBid',
  AUCTION_NINJA: 'Auction Ninja',
  ESTATESALES_NET: 'EstateSales.net',
  EBAY: 'eBay',
};
