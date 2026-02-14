import { AuctionWriterResponse } from '@/types';

// ============================================
// AuctionWriter API Client
// ============================================

const API_URL = process.env.AUCTIONWRITER_API_URL || 'https://api.auctionwriter.com/v1';
const API_KEY = process.env.AUCTIONWRITER_API_KEY || '';

interface AppraisalOptions {
  images: string[]; // Base64 encoded images or URLs
  category?: string;
  additionalContext?: string;
}

/**
 * Send images to AuctionWriter API and get back a full listing description,
 * category, condition assessment, and price appraisal.
 *
 * NOTE: You'll need to adjust this to match AuctionWriter's actual API
 * contract once you have access. This is structured based on common
 * patterns for these types of APIs.
 */
export async function getAppraisal(options: AppraisalOptions): Promise<AuctionWriterResponse> {
  try {
    const response = await fetch(`${API_URL}/appraise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        images: options.images,
        category: options.category,
        additional_context: options.additionalContext,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `AuctionWriter API error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();

    // Map AuctionWriter response to our internal format
    // Adjust field names based on actual API response structure
    return {
      title: data.title || data.name || 'Untitled Item',
      description: data.description || data.listing_description || '',
      category: mapCategory(data.category || data.item_category || ''),
      condition: mapCondition(data.condition || data.item_condition || ''),
      estimatedValue: {
        low: data.price_range?.low || data.estimated_low || 0,
        mid: data.price_range?.mid || data.estimated_mid || 0,
        high: data.price_range?.high || data.estimated_high || 0,
      },
      tags: data.tags || data.keywords || [],
    };
  } catch (error) {
    console.error('AuctionWriter API error:', error);
    throw error;
  }
}

// ============================================
// Category Mapping
// ============================================

function mapCategory(apiCategory: string): string {
  const categoryMap: Record<string, string> = {
    'furniture': 'FURNITURE',
    'electronics': 'ELECTRONICS',
    'clothing': 'CLOTHING',
    'jewelry': 'JEWELRY',
    'art': 'ART',
    'collectibles': 'COLLECTIBLES',
    'antiques': 'ANTIQUES',
    'tools': 'TOOLS',
    'kitchen': 'KITCHENWARE',
    'kitchenware': 'KITCHENWARE',
    'books': 'BOOKS',
    'toys': 'TOYS',
    'sports': 'SPORTS',
    'automotive': 'AUTOMOTIVE',
    'home decor': 'HOME_DECOR',
    'home': 'HOME_DECOR',
    'musical instruments': 'MUSICAL_INSTRUMENTS',
    'music': 'MUSICAL_INSTRUMENTS',
    'coins': 'COINS_CURRENCY',
    'currency': 'COINS_CURRENCY',
    'watches': 'WATCHES',
  };

  const normalized = apiCategory.toLowerCase().trim();
  return categoryMap[normalized] || 'OTHER';
}

// ============================================
// Condition Mapping
// ============================================

function mapCondition(apiCondition: string): string {
  const conditionMap: Record<string, string> = {
    'new': 'NEW',
    'like new': 'LIKE_NEW',
    'excellent': 'EXCELLENT',
    'good': 'GOOD',
    'fair': 'FAIR',
    'poor': 'POOR',
    'for parts': 'FOR_PARTS',
    'parts only': 'FOR_PARTS',
  };

  const normalized = apiCondition.toLowerCase().trim();
  return conditionMap[normalized] || 'GOOD';
}

// ============================================
// Fallback: Local AI Description (if AuctionWriter is unavailable)
// ============================================

export async function generateFallbackDescription(
  imageUrls: string[]
): Promise<Partial<AuctionWriterResponse>> {
  // This would call OpenAI Vision or similar as a fallback
  // For now, return a placeholder
  return {
    title: '',
    description: 'Description pending - please add manually.',
    category: 'OTHER',
    condition: 'GOOD',
    estimatedValue: { low: 0, mid: 0, high: 0 },
    tags: [],
  };
}
