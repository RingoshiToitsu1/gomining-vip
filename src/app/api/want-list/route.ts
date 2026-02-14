import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { z } from 'zod';

const postSchema = z.object({
  query: z.string().min(1).max(200),
});

const deleteSchema = z.object({
  id: z.string(),
});

// ============================================
// GET /api/want-list - Fetch user's want list
// ============================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id;

    const items = await prisma.wantListItem.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('GET /api/want-list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch want list' },
      { status: 500 }
    );
  }
}

// ============================================
// POST /api/want-list - Save a new search
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
    const validated = postSchema.parse(body);
    const userId = (session.user as any).id;

    // Check for existing item with same query (case-insensitive)
    const existing = await prisma.wantListItem.findFirst({
      where: {
        userId,
        query: { equals: validated.query, mode: 'insensitive' },
      },
    });

    if (existing) {
      // Reactivate if soft-deleted, otherwise return existing
      if (!existing.isActive) {
        const reactivated = await prisma.wantListItem.update({
          where: { id: existing.id },
          data: { isActive: true, createdAt: new Date() },
        });
        return NextResponse.json({ success: true, data: reactivated }, { status: 200 });
      }
      return NextResponse.json({ success: true, data: existing }, { status: 200 });
    }

    const item = await prisma.wantListItem.create({
      data: {
        query: validated.query,
        userId,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/want-list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save search' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE /api/want-list - Soft-delete an item
// ============================================

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = deleteSchema.parse(body);
    const userId = (session.user as any).id;

    // Ensure the item belongs to this user
    const item = await prisma.wantListItem.findFirst({
      where: { id: validated.id, userId },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Item not found' },
        { status: 404 }
      );
    }

    await prisma.wantListItem.update({
      where: { id: validated.id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('DELETE /api/want-list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete item' },
      { status: 500 }
    );
  }
}
