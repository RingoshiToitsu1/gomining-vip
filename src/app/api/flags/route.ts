import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { z } from 'zod';

const flagSchema = z.object({
  listingId: z.string(),
  reason: z.enum([
    'DUPLICATE',
    'INAPPROPRIATE',
    'SCAM',
    'WRONG_CATEGORY',
    'MISLEADING',
    'PROHIBITED_ITEM',
    'OTHER',
  ]),
  description: z.string().max(500).optional(),
});

// ============================================
// POST /api/flags - Flag a listing
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
    const validated = flagSchema.parse(body);
    const userId = (session.user as any).id;

    // Check listing exists
    const listing = await prisma.listing.findUnique({
      where: { id: validated.listingId },
    });

    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'Listing not found' },
        { status: 404 }
      );
    }

    // Check if user already flagged this listing
    const existingFlag = await prisma.flag.findFirst({
      where: {
        userId,
        listingId: validated.listingId,
        status: 'PENDING',
      },
    });

    if (existingFlag) {
      return NextResponse.json(
        { success: false, error: 'You have already flagged this listing' },
        { status: 400 }
      );
    }

    // Create flag
    const flag = await prisma.flag.create({
      data: {
        reason: validated.reason as any,
        description: validated.description,
        userId,
        listingId: validated.listingId,
      },
    });

    // Increment flag count on listing
    const updatedListing = await prisma.listing.update({
      where: { id: validated.listingId },
      data: { flagCount: { increment: 1 } },
    });

    // If flag count reaches threshold, put under review
    const FLAG_THRESHOLD = 3;
    if (updatedListing.flagCount >= FLAG_THRESHOLD) {
      await prisma.listing.update({
        where: { id: validated.listingId },
        data: { status: 'PENDING_REVIEW' },
      });

      // TODO: Trigger AI review process
      // The AI review would check the listing content, images,
      // and flag reasons to make an initial determination
    }

    return NextResponse.json(
      { success: true, data: flag, message: 'Thank you for your report. We will review this listing.' },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/flags error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to flag listing' },
      { status: 500 }
    );
  }
}
