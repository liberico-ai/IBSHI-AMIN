import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";
import { getISOWeek } from "date-fns";

const MenuItemSchema = z.object({
  weekNumber: z.number().int().min(1).max(53),
  year: z.number().int().min(2020).max(2100),
  dayOfWeek: z.number().int().min(1).max(5), // 1=Mon, 5=Fri
  mainDish: z.string().min(1),
  sideDish: z.string().min(1),
  soup: z.string().min(1),
  dessert: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const weekNumber = searchParams.get("week")
    ? parseInt(searchParams.get("week")!)
    : getISOWeek(now);
  const year = searchParams.get("year")
    ? parseInt(searchParams.get("year")!)
    : now.getFullYear();

  const menus = await prisma.weeklyMenu.findMany({
    where: { weekNumber, year },
    orderBy: { dayOfWeek: "asc" },
  });

  return NextResponse.json({ data: menus, weekNumber, year });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "meals", "manageCosts")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();

  // Accept single item or array
  const items = Array.isArray(body) ? body : [body];

  const results = [];
  for (const item of items) {
    const parsed = MenuItemSchema.safeParse(item);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
    }

    const result = await prisma.weeklyMenu.upsert({
      where: {
        weekNumber_year_dayOfWeek: {
          weekNumber: parsed.data.weekNumber,
          year: parsed.data.year,
          dayOfWeek: parsed.data.dayOfWeek,
        },
      },
      create: parsed.data,
      update: parsed.data,
    });
    results.push(result);
  }

  return NextResponse.json({ data: results }, { status: 201 });
}
