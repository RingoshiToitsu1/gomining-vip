import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

// GET /api/favorites - list user's favorites
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: favorites.map((f) => ({ id: f.id, itemId: f.itemId, item: f.itemData, createdAt: f.createdAt })),
  });
}

// POST /api/favorites - add a favorite
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const { itemId, item } = await req.json();
  if (!itemId || !item) {
    return NextResponse.json({ success: false, error: "itemId and item are required" }, { status: 400 });
  }

  const favorite = await prisma.favorite.upsert({
    where: { userId_itemId: { userId: user.id, itemId } },
    create: { userId: user.id, itemId, itemData: item },
    update: { itemData: item },
  });

  return NextResponse.json({ success: true, data: { id: favorite.id, itemId: favorite.itemId } });
}

// DELETE /api/favorites - remove a favorite
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const { itemId } = await req.json();
  if (!itemId) {
    return NextResponse.json({ success: false, error: "itemId is required" }, { status: 400 });
  }

  await prisma.favorite.deleteMany({ where: { userId: user.id, itemId } });

  return NextResponse.json({ success: true });
}
