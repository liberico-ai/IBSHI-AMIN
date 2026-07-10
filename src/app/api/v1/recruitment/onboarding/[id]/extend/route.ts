import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { z } from "zod";

const ExtendSchema = z.object({
  extendedUntil: z.string().datetime(),
  extensionReason: z.string().min(5, "Cần ghi rõ lý do gia hạn (≥5 ký tự)"),
  extensionDocUrl: z.string().min(1, "Cần upload file scan đã ký"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ExtendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  const updated = await prisma.onboardingChecklist.update({
    where: { id: params.id },
    data: {
      isExtended: true,
      status: "EXTENDED",
      extendedUntil: new Date(parsed.data.extendedUntil),
      extensionReason: parsed.data.extensionReason,
      extensionDocUrl: parsed.data.extensionDocUrl,
      extensionGrantedAt: new Date(),
    },
  });

  return NextResponse.json({ data: updated });
}
