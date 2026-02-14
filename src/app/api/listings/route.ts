import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { generateSlug, checkExcludedWords } from '@/lib/utils';
import { z } from 'zod';

// ============================================
// Validation Schema
// ============================================

const createListingSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.string(),
  condition: z.string(),
  priceAsk: z.number().positive(),
  priceAppraised: z.number().optional(),
  priceRangeLow: z.number().optional(),
  priceRangeHigh: z.number().optional(),
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().optional(),
    order: z.number().default(0),
  })).min(1),
  location: z.string().optional(),
  zipCode: z.string().optional(),
  tags: z.array(z.string()).default([]),
  aiDescription: z.string().optional(),
});

// ============================================
// GET /api/listings - List/Search listings
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category');
    const condition = searchParams.get('condition');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const source = searchParams.get('source');
    const sortBy = searchParams.get('sortBy') || 'newest';

    // Build where clause
    const where: any = {
      status: 'ACTIVE',
    };

    // Full-text search
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: query.toLowerCase().split(' ') } },
      ];
    }

    if (category) where.category = category;
    if (condition) where.condition = condition;
    if (source) where.source = source;
    if (minPrice || maxPrice) {
      where.priceAsk = {};
      if (minPrice) where.priceAsk.gte = parseFloat(minPrice);
      if (maxPrice) where.priceAsk.lte = parseFloat(maxPrice);
    }

    // Sort
    let orderBy: any = { createdAt: 'desc' };
    switch (sortBy) {
      case 'price_asc': orderBy = { priceAsk: 'asc' }; break;
      case 'price_desc': orderBy = { priceAsk: 'desc' }; break;
      case 'oldest': orderBy = { createdAt: 'asc' }; break;
      case 'newest': orderBy = { createdAt: 'desc' }; break;
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { orderBy: { order: 'asc' } },
          seller: {
            select: { id: true, name: true, image: true },
          },
        },
      }),
      prisma.listing.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: listings,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('GET /api/listings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// ============================================
// POST /api/listings - Create a new listing
// ============================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = createListingSchema.parse(body);

    // Check for excluded words
    const titleCheck = checkExcludedWords(validated.title);
    const descCheck = checkExcludedWords(validated.description);

    if (titleCheck.hasExcluded || descCheck.hasExcluded) {
      const allFound = [...new Set([...titleCheck.foundWords, ...descCheck.foundWords])];
      return NextResponse.json(
        {
          success: false,
          error: 'Your listing contains excluded words',
          excludedWords: allFound,
          message: `Please remove the following words from your listing: ${allFound.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Generate unique slug
    const slug = generateSlug(validated.title);

    // Create listing with images
    const listing = await prisma.listing.create({
      data: {
        slug,
        title: validated.title,
        description: validated.description,
        category: validated.category as any,
        condition: validated.condition as any,
        priceAsk: validated.priceAsk,
        priceAppraised: validated.priceAppraised,
        priceRangeLow: validated.priceRangeLow,
        priceRangeHigh: validated.priceRangeHigh,
        location: validated.location,
        zipCode: validated.zipCode,
        tags: validated.tags,
        aiDescription: validated.aiDescription,
        sellerId: (session.user as any).id,
        source: 'DIRECT',
        images: {
          create: validated.images.map((img, index) => ({
            url: img.url,
            alt: img.alt || validated.title,
            order: img.order ?? index,
          })),
        },
      },
      include: {
        images: true,
        seller: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    // TODO: Check want list matches and send notifications

    return NextResponse.json(
      { success: true, data: listing },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/listings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create listing' },
      { status: 500 }
    );
  }
}
