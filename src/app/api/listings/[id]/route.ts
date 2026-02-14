import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listing = await prisma.listing.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        images: { orderBy: { order: 'asc' } },
        seller: { select: { id: true, name: true, image: true } },
        offers: { where: { status: 'PENDING' }, select: { id: true, amount: true, createdAt: true }, orderBy: { amount: 'desc' } },
      },
    });
    if (!listing) {
      return NextResponse.json({ success: false, error: 'Listing not found' }, { status: 404 });
    }
    await prisma.listing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } });
    return NextResponse.json({ success: true, data: listing });
  } catch (error) {
    console.error('GET /api/listings/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch listing' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return NextResponse.json({ success: false, error: 'Listing not found' }, { status: 404 });
    if (listing.sellerId !== (session.user as any).id) return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    const body = await request.json();
    const updated = await prisma.listing.update({
      where: { id },
      data: { title: body.title, description: body.description, category: body.category, condition: body.condition, priceAsk: body.priceAsk, location: body.location, tags: body.tags },
      include: { images: true, seller: { select: { id: true, name: true, image: true } } },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update listing' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return NextResponse.json({ success: false, error: 'Listing not found' }, { status: 404 });
    const userId = (session.user as any).id;
    const userRole = (session.user as any).role;
    if (listing.sellerId !== userId && userRole !== 'ADMIN') return NextResponse.json({ success: false, error: 'Not authorized' }, { status: 403 });
    await prisma.listing.update({ where: { id }, data: { status: 'REMOVED' } });
    return NextResponse.json({ success: true, message: 'Listing removed' });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete listing' }, { status: 500 });
  }
}
