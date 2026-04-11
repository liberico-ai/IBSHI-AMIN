import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const CalculateSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

// POST /api/v1/salary/calculate — spec-compliant endpoint
// Body: { month: number, year: number }
// Finds or creates the PayrollPeriod, then delegates to PUT /payroll/:id?action=CALCULATE
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "payroll", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = CalculateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const { month, year } = parsed.data;

  // Find or create the PayrollPeriod
  let period = await prisma.payrollPeriod.findUnique({
    where: { month_year: { month, year } },
  });
  if (!period) {
    period = await prisma.payrollPeriod.create({ data: { month, year, status: "DRAFT" } });
  }

  // Delegate to the calculate logic via internal fetch
  const baseUrl = request.nextUrl.origin;
  const calcResponse = await fetch(`${baseUrl}/api/v1/payroll/${period.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") || "",
    },
    body: JSON.stringify({ action: "CALCULATE" }),
  });

  const result = await calcResponse.json();
  return NextResponse.json(result, { status: calcResponse.status });
}
