import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent, calculateFindersFee } from '@/lib/stripe';
import prisma from '@/lib/db';

// ============================================
// POST /api/stripe/webhook - Handle Stripe events
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const event = constructWebhookEvent(body, signature);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const { listingId, type } = session.metadata;

        if (type === 'direct_sale') {
          const { findersFee, sellerPayout } = calculateFindersFee(
            session.amount_total / 100
          );

          // Record transaction
          await prisma.transaction.create({
            data: {
              type: 'DIRECT_SALE',
              amount: session.amount_total / 100,
              findersFee,
              sellerPayout,
              stripePaymentId: session.payment_intent,
              status: 'COMPLETED',
              buyerId: session.client_reference_id || '', // Set via checkout
              sellerId: '', // Resolved from listing
              listingId,
            },
          });

          // Mark listing as sold
          await prisma.listing.update({
            where: { id: listingId },
            data: { status: 'SOLD' },
          });

          // TODO: Send notifications to buyer and seller
        }

        if (type === 'finders_fee') {
          // Record finders fee transaction
          await prisma.transaction.create({
            data: {
              type: 'FINDERS_FEE',
              amount: session.amount_total / 100,
              findersFee: session.amount_total / 100,
              sellerPayout: 0,
              stripePaymentId: session.payment_intent,
              status: 'COMPLETED',
              buyerId: session.client_reference_id || '',
              sellerId: '', // Platform revenue
              listingId,
            },
          });

          // TODO: Send notification with unlocked link
        }

        break;
      }

      case 'account.updated': {
        // Seller Stripe Connect account updated
        const account = event.data.object as any;

        if (account.charges_enabled && account.payouts_enabled) {
          await prisma.user.updateMany({
            where: { stripeAccountId: account.id },
            data: { onboardingComplete: true },
          });
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;

        if (subscription.status === 'active') {
          await prisma.user.updateMany({
            where: { stripeCustomerId: subscription.customer },
            data: {
              subscriptionTier: 'PRO',
              subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
            },
          });
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;

        await prisma.user.updateMany({
          where: { stripeCustomerId: subscription.customer },
          data: {
            subscriptionTier: 'FREE',
            subscriptionExpiresAt: null,
          },
        });

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

