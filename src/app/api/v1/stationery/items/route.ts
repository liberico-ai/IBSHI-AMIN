import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Normalize tên item để fuzzy match (tránh duplicate "Giấy A4" vs "giấy a4").
export function normalizeItemName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const where = q ? { normalizedName: { contains: normalizeItemName(q) } } : {};
  const data = await prisma.stationeryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: q ? 20 : 500,
  });
  return NextResponse.json({ data });
}
