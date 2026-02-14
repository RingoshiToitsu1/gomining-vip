import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  createDirectSaleCheckout,
  createFinderseFeeCheckout,
} from '@/lib/stripe';

// ============================================
// POST /api/stripe/checkout - Create checkout session
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
    const { listingId, type } = body; // type: 'direct_sale' | 'finders_fee'

    if (!listingId || !type) {
      return NextResponse.json(
        { success: false, error: 'listingId and type are required' },
        { status: 400 }
      );
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        seller: { select: { stripeAccountId: true } },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'This listing is no longer active' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const userEmail = session.user.email!;

    let checkoutSession;

    if (type === 'direct_sale') {
      // Direct purchase on Look4it
      if (!listing.seller.stripeAccountId) {
        return NextResponse.json(
          { success: false, error: 'Seller has not completed payment setup' },
          { status: 400 }
        );
      }

      checkoutSession = await createDirectSaleCheckout({
        listingId: listing.id,
        listingTitle: listing.title,
        amount: listing.priceAsk,
        sellerStripeAccountId: listing.seller.stripeAccountId,
        buyerEmail: userEmail,
        successUrl: `${baseUrl}/listing/${listing.slug}?purchased=true`,
        cancelUrl: `${baseUrl}/listing/${listing.slug}?cancelled=true`,
      });
    } else if (type === 'finders_fee') {
      // Finders fee to unlock external link
      const appraisedValue = listing.priceAppraised || listing.priceAsk;

      checkoutSession = await createFinderseFeeCheckout({
        listingId: listing.id,
        listingTitle: listing.title,
        appraisedValue,
        buyerEmail: userEmail,
        successUrl: `${baseUrl}/listing/${listing.slug}?unlocked=true`,
        cancelUrl: `${baseUrl}/listing/${listing.slug}?cancelled=true`,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid checkout type' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { url: checkoutSession.url },
    });
  } catch (error) {
    console.error('POST /api/stripe/checkout error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
