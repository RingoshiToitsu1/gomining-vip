import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAppraisal } from '@/lib/auctionwriter';

// ============================================
// POST /api/appraisal - Get AI appraisal for images
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
    const { images, category, additionalContext } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one image is required' },
        { status: 400 }
      );
    }

    if (images.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Maximum 10 images allowed' },
        { status: 400 }
      );
    }

    const appraisal = await getAppraisal({
      images,
      category,
      additionalContext,
    });

    return NextResponse.json({
      success: true,
      data: appraisal,
    });
  } catch (error) {
    console.error('POST /api/appraisal error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get appraisal. Please try again.' },
      { status: 500 }
    );
  }
}
