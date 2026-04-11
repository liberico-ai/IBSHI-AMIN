import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  incidentDate: z.string(),
  type: z.enum(["INJURY", "LTI", "NEAR_MISS", "FIRST_AID", "PROPERTY_DAMAGE", "OBSERVATION", "ENVIRONMENTAL"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  location: z.string().min(2),
  description: z.string().min(5),
  injuredPerson: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
  photos: z.array(z.string().url()).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const severity = searchParams.get("severity") || "";

  const where: any = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const data = await prisma.hSEIncident.findMany({
    where,
    include: { reporter: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: { incidentDate: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }

  // Find employee record for current user
  const emp = await prisma.employee.findFirst({ where: { userId: (session.user as any).id } });
  if (!emp) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ nhân viên" } }, { status: 404 });

  const { photos, ...rest } = parsed.data;
  const incident = await prisma.hSEIncident.create({
    data: {
      ...rest,
      incidentDate: new Date(rest.incidentDate),
      reportedBy: emp.id,
      photos: photos && photos.length > 0 ? JSON.stringify(photos) : undefined,
    },
    include: { reporter: { select: { id: true, code: true, fullName: true } } },
  });

  // Notify HR_ADMIN and BOM
  const admins = await prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "BOM"] }, isActive: true } });
  await Promise.all(admins.map((u) =>
    prisma.notification.create({
      data: {
        userId: u.id,
        title: `Sự cố HSE: ${parsed.data.type}`,
        message: `${emp.fullName} báo cáo sự cố tại ${parsed.data.location}. Mức độ: ${parsed.data.severity}`,
        type: "HSE_ALERT",
        referenceType: "hse",
        referenceId: incident.id,
      },
    })
  ));

  return NextResponse.json({ data: incident }, { status: 201 });
}
