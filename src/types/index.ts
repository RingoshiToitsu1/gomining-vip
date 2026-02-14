// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// AuctionWriter API Types
// ============================================

export interface AuctionWriterRequest {
  images: string[]; // Base64 or URLs
}

export interface AuctionWriterResponse {
  title: string;
  description: string;
  category: string;
  condition: string;
  estimatedValue: {
    low: number;
    mid: number;
    high: number;
  };
  tags: string[];
}

// ============================================
// Listing Types
// ============================================

export interface ListingFormData {
  title: string;
  description: string;
  category: string;
  condition: string;
  priceAsk: number;
  images: File[];
  location: string;
  zipCode: string;
  tags: string[];
}

export interface ListingWithSeller {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  images: { id: string; url: string; alt: string | null; order: number }[];
  priceAsk: number;
  priceAppraised: number | null;
  priceRangeLow: number | null;
  priceRangeHigh: number | null;
  status: string;
  source: string;
  externalUrl: string | null;
  externalPlatform: string | null;
  location: string | null;
  tags: string[];
  aiDescription: string | null;
  viewCount: number;
  createdAt: string;
  seller: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

// ============================================
// Search Types
// ============================================

export interface SearchFilters {
  query: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  source?: string;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'oldest';
  page?: number;
  pageSize?: number;
}

// ============================================
// Offer Types
// ============================================

export interface OfferFormData {
  amount: number;
  message?: string;
  listingId: string;
}

// ============================================
// Stripe Types
// ============================================

export interface StripeOnboardingResponse {
  url: string;
}

export interface CheckoutSessionData {
  listingId: string;
  type: 'direct_sale' | 'finders_fee';
}

// ============================================
// Want List Types
// ============================================

export interface WantListFormData {
  query: string;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  condition?: string;
}

// ============================================
// Notification Types
// ============================================

export interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}
