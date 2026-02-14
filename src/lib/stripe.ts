import Stripe from 'stripe';

// ============================================
// Stripe Server-Side Client
// ============================================

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
  typescript: true,
});

// ============================================
// Finders Fee Calculation
// ============================================

const FINDERS_FEE_PERCENTAGE = parseInt(process.env.FINDERS_FEE_PERCENTAGE || '10');

export function calculateFindersFee(price: number): {
  findersFee: number;
  sellerPayout: number;
  total: number;
} {
  const findersFee = Math.round(price * (FINDERS_FEE_PERCENTAGE / 100) * 100) / 100;
  const sellerPayout = Math.round((price - findersFee) * 100) / 100;
  return {
    findersFee,
    sellerPayout,
    total: price,
  };
}

// ============================================
// Stripe Connect: Create Connected Account
// ============================================

export async function createConnectedAccount(email: string): Promise<Stripe.Account> {
  const account = await stripe.accounts.create({
    type: 'standard',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account;
}

// ============================================
// Stripe Connect: Create Onboarding Link
// ============================================

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return accountLink.url;
}

// ============================================
// Create Checkout Session for Direct Sale
// ============================================

export async function createDirectSaleCheckout(params: {
  listingId: string;
  listingTitle: string;
  amount: number; // in dollars
  sellerStripeAccountId: string;
  buyerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { findersFee } = calculateFindersFee(params.amount);
  const applicationFeeAmount = Math.round(findersFee * 100); // Convert to cents

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: params.buyerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: params.listingTitle,
            metadata: {
              listingId: params.listingId,
            },
          },
          unit_amount: Math.round(params.amount * 100), // Convert to cents
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: params.sellerStripeAccountId,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      listingId: params.listingId,
      type: 'direct_sale',
    },
  });

  return session;
}

// ============================================
// Create Checkout Session for Finders Fee (External Listings)
// ============================================

export async function createFinderseFeeCheckout(params: {
  listingId: string;
  listingTitle: string;
  appraisedValue: number;
  buyerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { findersFee } = calculateFindersFee(params.appraisedValue);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: params.buyerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Finder's Fee: ${params.listingTitle}`,
            description: `Access fee to purchase this item (10% of $${params.appraisedValue.toFixed(2)} appraised value)`,
            metadata: {
              listingId: params.listingId,
            },
          },
          unit_amount: Math.round(findersFee * 100),
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      listingId: params.listingId,
      type: 'finders_fee',
    },
  });

  return session;
}

// ============================================
// Create Subscription for Pro Tier
// ============================================

export async function createSubscriptionCheckout(params: {
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  // You'll create this price in Stripe Dashboard
  const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID!;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: params.customerEmail,
    line_items: [
      {
        price: PRO_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return session;
}

// ============================================
// Verify Webhook Signature
// ============================================

export function constructWebhookEvent(
  body: string,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}
