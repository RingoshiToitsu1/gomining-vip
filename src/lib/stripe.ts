import Stripe from 'stripe';

const FINDERS_FEE_PERCENTAGE = parseInt(process.env.FINDERS_FEE_PERCENTAGE || '10');

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-01-28.clover' as any,
      typescript: true,
    });
  }
  return _stripe;
}

export function calculateFindersFee(price: number) {
  const findersFee = Math.round(price * (FINDERS_FEE_PERCENTAGE / 100) * 100) / 100;
  const sellerPayout = Math.round((price - findersFee) * 100) / 100;
  return { findersFee, sellerPayout, total: price };
}

export async function createConnectedAccount(email: string) {
  const stripe = getStripe();
  return stripe.accounts.create({
    type: 'standard',
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
}

export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const stripe = getStripe();
  const accountLink = await stripe.accountLinks.create({
    account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding',
  });
  return accountLink.url;
}

export async function createDirectSaleCheckout(params: {
  listingId: string; listingTitle: string; amount: number;
  sellerStripeAccountId: string; buyerEmail: string; successUrl: string; cancelUrl: string;
}) {
  const stripe = getStripe();
  const { findersFee } = calculateFindersFee(params.amount);
  return stripe.checkout.sessions.create({
    mode: 'payment', customer_email: params.buyerEmail,
    line_items: [{ price_data: { currency: 'usd', product_data: { name: params.listingTitle, metadata: { listingId: params.listingId } }, unit_amount: Math.round(params.amount * 100) }, quantity: 1 }],
    payment_intent_data: { application_fee_amount: Math.round(findersFee * 100), transfer_data: { destination: params.sellerStripeAccountId } },
    success_url: params.successUrl, cancel_url: params.cancelUrl, metadata: { listingId: params.listingId, type: 'direct_sale' },
  });
}

export async function createFinderseFeeCheckout(params: {
  listingId: string; listingTitle: string; appraisedValue: number;
  buyerEmail: string; successUrl: string; cancelUrl: string;
}) {
  const stripe = getStripe();
  const { findersFee } = calculateFindersFee(params.appraisedValue);
  return stripe.checkout.sessions.create({
    mode: 'payment', customer_email: params.buyerEmail,
    line_items: [{ price_data: { currency: 'usd', product_data: { name: `Finder's Fee: ${params.listingTitle}`, metadata: { listingId: params.listingId } }, unit_amount: Math.round(findersFee * 100) }, quantity: 1 }],
    success_url: params.successUrl, cancel_url: params.cancelUrl, metadata: { listingId: params.listingId, type: 'finders_fee' },
  });
}

export function constructWebhookEvent(body: string, signature: string) {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
