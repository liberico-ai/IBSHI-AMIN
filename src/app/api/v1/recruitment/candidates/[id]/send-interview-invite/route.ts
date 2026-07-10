import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canDo } from "@/lib/permissions";
import { canUser } from "@/lib/permission-catalog";
import { sendMail } from "@/lib/mail";
import { z } from "zod";

const Schema = z.object({
  interviewDate: z.string().min(1),
  interviewTime: z.string().min(1, "Vui lòng nhập giờ phỏng vấn"),
  interviewLocation: z.string().optional().nullable(),
  interviewContact: z.string().optional().nullable(),
  interviewNote: z.string().optional().nullable(),
});

const DEFAULT_LOCATION = "Km 6 Quốc lộ 5, Phường Hồng Bàng, TP. Hải Phòng";

function fmtDate(d: string) {
  return d.split("-").reverse().join("/");
}

// POST — soạn & gửi THƯ MỜI PHỎNG VẤN cho ứng viên (email), đồng thời chuyển sang trạng thái Hẹn PV.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const role = (session.user as any).role;
  if (!canUser(session.user as any, "m4.tuyendung:edit")) {
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

  // Gửi email thư mời phỏng vấn TRƯỚC — lỗi thì không đổi trạng thái (HCNS thử lại được).
  const when = `${d.interviewTime?.trim() ? d.interviewTime.trim() + ", " : ""}ngày ${fmtDate(d.interviewDate)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.6">
      <p>Kính gửi Anh/Chị <b>${candidate.fullName}</b>,</p>
      <p><b>CÔNG TY CỔ PHẦN CÔNG NGHIỆP NẶNG IBS</b> trân trọng cảm ơn Anh/Chị đã quan tâm và ứng tuyển.
      Chúng tôi trân trọng kính mời Anh/Chị tham gia buổi <b>phỏng vấn</b> cho vị trí
      <b>${position}</b>${deptName ? ` – ${deptName}` : ""} với thông tin như sau:</p>
      <ul>
        <li><b>Thời gian:</b> ${when}</li>
        <li><b>Địa điểm:</b> ${location}</li>
        ${d.interviewContact?.trim() ? `<li><b>Người liên hệ / phỏng vấn:</b> ${d.interviewContact.trim()}</li>` : ""}
      </ul>
      ${d.interviewNote?.trim() ? `<p><b>Lưu ý:</b> ${d.interviewNote.trim().replace(/\n/g, "<br/>")}</p>` : ""}
      <p>Đề nghị Anh/Chị mang theo CMND/CCCD và đến đúng giờ. Nếu cần thay đổi lịch, vui lòng phản hồi email này.</p>
      <p>Trân trọng,<br/><b>Phòng Hành chính – Nhân sự</b><br/>Công ty CP Công nghiệp nặng IBS</p>
    </div>`;

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
