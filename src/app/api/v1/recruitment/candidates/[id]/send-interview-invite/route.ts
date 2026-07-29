import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { sendMail } from "@/lib/mail";
import { interviewInviteHtml, INTERVIEW_DEFAULT_LOCATION } from "@/lib/recruitment-letters";
import { z } from "zod";

const Schema = z.object({
  interviewDate: z.string().min(1),
  interviewTime: z.string().min(1, "Vui lòng nhập giờ phỏng vấn"),
  interviewLocation: z.string().optional().nullable(),
  interviewContact: z.string().optional().nullable(),
  interviewNote: z.string().optional().nullable(),
  preview: z.boolean().optional(),            // true → chỉ TRẢ nội dung thư (không gửi, không đổi trạng thái)
  bodyHtml: z.string().optional().nullable(), // nội dung thư ĐÃ SỬA (HCNS chỉnh trong ô xem trước) → gửi nội dung này
});

const DEFAULT_LOCATION = INTERVIEW_DEFAULT_LOCATION;

// POST — soạn & gửi THƯ MỜI PHỎNG VẤN cho ứng viên (email), đồng thời chuyển sang trạng thái Hẹn PV.
//   ?preview: chỉ trả HTML để HCNS xem trước + sửa (không gửi). Gửi kèm bodyHtml = dùng nội dung đã sửa.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canUser(session.user as any, "m4.ungvien:edit")) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } }, { status: 422 });
  }
  const d = parsed.data;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { recruitment: { include: { department: true } } },
  });
  if (!candidate) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!candidate.email) {
    return NextResponse.json({ error: { code: "NO_EMAIL", message: "Ứng viên chưa có email — không gửi được thư mời" } }, { status: 400 });
  }

  const location = d.interviewLocation?.trim() || DEFAULT_LOCATION;
  const position = candidate.recruitment.positionName;
  const deptName = candidate.recruitment.department?.name || "";

  // Nội dung thư: dùng bản HCNS đã sửa (bodyHtml) nếu có, không thì sinh từ mẫu.
  const generated = interviewInviteHtml({
    fullName: candidate.fullName, position, deptName,
    interviewDate: d.interviewDate, interviewTime: d.interviewTime,
    location, contact: d.interviewContact, note: d.interviewNote,
  });

  // XEM TRƯỚC: chỉ trả nội dung, KHÔNG gửi + KHÔNG đổi trạng thái.
  if (d.preview) {
    return NextResponse.json({ data: { html: generated } });
  }

  const html = d.bodyHtml?.trim() ? d.bodyHtml : generated;

  // Gửi email thư mời phỏng vấn TRƯỚC — lỗi thì không đổi trạng thái (HCNS thử lại được).
  try {
    await sendMail({
      to: candidate.email,
      subject: `[IBS HI] Thư mời phỏng vấn — vị trí ${position}`,
      html,
    });
  } catch (e: any) {
    return NextResponse.json({ error: { code: "MAIL_FAILED", message: `Gửi email thư mời thất bại: ${e?.message || "không rõ"}. Lịch chưa được lưu.` } }, { status: 502 });
  }

  // Email đã gửi → lưu thông tin lịch PV + chuyển trạng thái INTERVIEW.
  const updated = await prisma.candidate.update({
    where: { id },
    data: {
      status: "INTERVIEW",
      interviewDate: new Date(d.interviewDate),
      interviewTime: d.interviewTime?.trim() || null,
      interviewLocation: location,
      interviewContact: d.interviewContact?.trim() || null,
      interviewNote: d.interviewNote?.trim() || null,
      interviewInviteSentAt: new Date(),
    },
  });

  return NextResponse.json({ data: updated });
}
