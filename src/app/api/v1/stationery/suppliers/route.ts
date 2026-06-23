import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const data = await prisma.stationerySupplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ data });
}

const CreateSchema = z.object({ name: z.string().min(2), contactInfo: z.string().optional().nullable() });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!["HR_ADMIN", "BOM", "ADMIN"].includes((session.user as any).role))
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  const body = CreateSchema.parse(await request.json());
  const ex = await prisma.stationerySupplier.findUnique({ where: { name: body.name } });
  if (ex) return NextResponse.json({ error: { code: "DUPLICATE", message: "NCC đã tồn tại" } }, { status: 400 });
  const data = await prisma.stationerySupplier.create({ data: body });
  return NextResponse.json({ data }, { status: 201 });
}
