import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const data = await prisma.meetingRoom.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ data });
}
