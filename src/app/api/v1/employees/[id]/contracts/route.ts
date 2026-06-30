import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { z } from "zod";

const createContractSchema = z.object({
  contractNumber: z.string().min(1, "Số hợp đồng không được để trống"),
  contractType: z.enum(["PROBATION", "DEFINITE_12M", "DEFINITE_24M", "DEFINITE_36M", "INDEFINITE"]),
  position: z.string().optional().nullable(),
  startDate: z.string().min(1, "Ngày bắt đầu không được để trống"),
  endDate: z.string().optional().nullable(),
  baseSalary: z.number().int().positive("Lương cơ bản phải > 0").max(2_000_000_000, "Lương cơ bản vượt quá giới hạn cho phép (tối đa 2 tỷ)"),
  insuranceSalary: z.number().int().min(0).max(2_000_000_000, "Lương đóng BHXH vượt quá giới hạn cho phép (tối đa 2 tỷ)").optional().nullable(),
  allowance: z.number().int().min(0).max(2_000_000_000, "Phụ cấp vượt quá giới hạn cho phép").optional().nullable(),
  allowances: z.record(z.string(), z.number()).optional().nullable(),
  documentHtml: z.string().optional().nullable(),   // nội dung HĐ đã soạn (để tải lại Word/PDF)
  skillLevel: z.string().optional().nullable(),      // bậc thợ — cập nhật vào hồ sơ NV
  fileUrl: z.string().optional().nullable(),
  // "WAITING_SIGN" = PHÁT HÀNH (đợi NV ký ngoài) → chưa hiệu lực, KHÔNG gia hạn HĐ cũ.
  // Bỏ trống / "ACTIVE" = tạo HĐ hiệu lực ngay (luồng cũ: gia hạn HĐ cũ).
  status: z.enum(["ACTIVE", "WAITING_SIGN"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (!canDo(userRole, "employees", "readAll")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id: employeeId } = await params;

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createContractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
      { status: 422 }
    );
  }

  const { contractNumber, contractType, position, startDate, endDate, baseSalary, insuranceSalary, allowance, allowances, documentHtml, skillLevel, fileUrl } = parsed.data;
  const isPublish = parsed.data.status === "WAITING_SIGN"; // PHÁT HÀNH (đợi ký) — chưa hiệu lực

  // Check duplicate contract number
  const existing = await prisma.contract.findFirst({ where: { contractNumber } });
  if (existing) {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "Số hợp đồng đã tồn tại" } },
      { status: 409 }
    );
  }

  try {
    const newStart = new Date(startDate);
    // Ngày kết thúc tự gán cho HĐ cũ = ngày bắt đầu HĐ mới − 1 ngày.
    const supersedeEnd = new Date(newStart);
    supersedeEnd.setDate(supersedeEnd.getDate() - 1);

    const contract = await prisma.$transaction(async (tx) => {
      // CHỈ khi tạo HĐ HIỆU LỰC NGAY (không phải phát hành đợi ký): HĐ cũ (ACTIVE/EXPIRING_SOON) → RENEWED.
      // PHÁT HÀNH (WAITING_SIGN) → GIỮ NGUYÊN HĐ cũ; chỉ gia hạn khi NV xác nhận đã ký (confirm-sign).
      let supersededCount = 0;
      if (!isPublish) {
        const oldActive = await tx.contract.findMany({
          where: { employeeId, status: { in: ["ACTIVE", "EXPIRING_SOON"] } },
          select: { id: true, startDate: true, endDate: true },
        });
        supersededCount = oldActive.length;
        for (const old of oldActive) {
          // Chỉ đặt ngày kết thúc nếu hợp lệ (không sớm hơn ngày bắt đầu HĐ cũ) và HĐ cũ chưa có ngày KT, hoặc KT muộn hơn.
          const setEnd = supersedeEnd >= new Date(old.startDate) && (!old.endDate || new Date(old.endDate) > supersedeEnd);
          await tx.contract.update({
            where: { id: old.id },
            data: { status: "RENEWED", ...(setEnd ? { endDate: supersedeEnd } : {}) },
          });
        }
      }

      const created = await tx.contract.create({
        data: {
          employeeId,
          contractNumber,
          contractType: contractType as any,
          position: position || null,
          startDate: newStart,
          endDate: endDate ? new Date(endDate) : null,
          baseSalary,
          insuranceSalary: insuranceSalary ?? null,
          allowance: allowance ?? null,
          allowances: (allowances as any) ?? undefined,
          documentHtml: documentHtml || null,
          fileUrl: fileUrl || null,
          status: isPublish ? "WAITING_SIGN" : "ACTIVE",
        },
      });

      // Cập nhật thông tin công việc lên hồ sơ NV (hiển thị ở Thông tin cá nhân).
      const empData: any = {};
      if (position) empData.jobRole = position;            // Chức vụ
      if (skillLevel != null && skillLevel !== "") empData.skillLevel = skillLevel; // Bậc thợ
      if (Object.keys(empData).length > 0) {
        await tx.employee.update({ where: { id: employeeId }, data: empData });
      }

      await tx.auditLog.create({
        data: {
          userId: (session.user as any).id,
          action: "CREATE",
          entityType: "Contract",
          entityId: created.id,
          newValue: JSON.stringify({ contractNumber, contractType, baseSalary, status: isPublish ? "WAITING_SIGN" : "ACTIVE", supersededCount }),
        },
      });

      return created;
    });

    return NextResponse.json({ data: contract }, { status: 201 });
  } catch (err: any) {
    console.error("[contracts.POST] create failed:", err?.message || err);
    return NextResponse.json(
      { error: { code: "CREATE_FAILED", message: "Không lưu được hợp đồng. Kiểm tra lại dữ liệu (đặc biệt mức lương)." } },
      { status: 400 }
    );
  }
}
