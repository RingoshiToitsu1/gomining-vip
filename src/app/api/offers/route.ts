import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { z } from 'zod';

const offerSchema = z.object({
  listingId: z.string(),
  amount: z.number().positive(),
  message: z.string().max(500).optional(),
});

// ============================================
// POST /api/offers - Create an offer
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
    const validated = offerSchema.parse(body);
    const userId = (session.user as any).id;

    // Check listing exists and is active
    const listing = await prisma.listing.findUnique({
      where: { id: validated.listingId },
      include: { seller: { select: { id: true } } },
    });

    if (!listing || listing.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Listing not found or not active' },
        { status: 404 }
      );
    }

    // Can't offer on your own listing
    if (listing.sellerId === userId) {
      return NextResponse.json(
        { success: false, error: 'Cannot make an offer on your own listing' },
        { status: 400 }
      );
    }

    // Check for existing pending offer
    const existingOffer = await prisma.offer.findFirst({
      where: {
        buyerId: userId,
        listingId: validated.listingId,
        status: 'PENDING',
      },
    });

    if (existingOffer) {
      return NextResponse.json(
        { success: false, error: 'You already have a pending offer on this item' },
        { status: 400 }
      );
    }

    const offer = await prisma.offer.create({
      data: {
        amount: validated.amount,
        message: validated.message,
        buyerId: userId,
        listingId: validated.listingId,
      },
    });

    // Create notification for seller
    await prisma.notification.create({
      data: {
        type: 'OFFER_RECEIVED',
        title: 'New Offer Received',
        message: `You received an offer of $${validated.amount.toFixed(2)} on "${listing.title}"`,
        data: { offerId: offer.id, listingId: listing.id },
        userId: listing.sellerId,
      },
    });

    return NextResponse.json(
      { success: true, data: offer },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/offers error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create offer' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/offers - Accept/Decline offer
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { offerId, action } = body; // action: 'accept' | 'decline'

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        listing: { select: { sellerId: true, title: true } },
        buyer: { select: { id: true } },
      },
    });

    if (!offer) {
      return NextResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Only seller can accept/decline
    if (offer.listing.sellerId !== (session.user as any).id) {
      return NextResponse.json(
        { success: false, error: 'Not authorized' },
        { status: 403 }
      );
    }

    const newStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';

    const updated = await prisma.offer.update({
      where: { id: offerId },
      data: { status: newStatus },
    });

    // Notify buyer
    await prisma.notification.create({
      data: {
        type: action === 'accept' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
        title: `Offer ${action === 'accept' ? 'Accepted' : 'Declined'}`,
        message: `Your offer of $${offer.amount.toFixed(2)} on "${offer.listing.title}" was ${action === 'accept' ? 'accepted' : 'declined'}.`,
        data: { offerId: offer.id, listingId: offer.listingId },
        userId: offer.buyerId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /api/offers error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update offer' },
      { status: 500 }
    );
  }
}
