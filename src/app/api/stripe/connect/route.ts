import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import {
  createConnectedAccount,
  createOnboardingLink,
  createDirectSaleCheckout,
  createFinderseFeeCheckout,
  constructWebhookEvent,
  calculateFindersFee,
} from '@/lib/stripe';

// ============================================
// POST /api/stripe/connect - Start seller onboarding
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

    const userId = (session.user as any).id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    let stripeAccountId = user.stripeAccountId;

    // Create Stripe Connect account if doesn't exist
    if (!stripeAccountId) {
      const account = await createConnectedAccount(user.email);
      stripeAccountId = account.id;

      await prisma.user.update({
        where: { id: userId },
        data: {
          stripeAccountId: account.id,
          role: user.role === 'BUYER' ? 'BOTH' : user.role,
        },
      });
    }

    // Create onboarding link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const onboardingUrl = await createOnboardingLink(
      stripeAccountId,
      `${baseUrl}/dashboard?onboarding=complete`,
      `${baseUrl}/dashboard?onboarding=refresh`
    );

    return NextResponse.json({
      success: true,
      data: { url: onboardingUrl },
    });
  } catch (error) {
    console.error('POST /api/stripe/connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start onboarding' },
      { status: 500 }
    );
  }
}
