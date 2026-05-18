import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { renderOfferLetterPdf } from "@/lib/offer-letter-pdf";
import { sendMail } from "@/lib/mail";
import { getMinioClient, ensureBucket, getFileUrl } from "@/lib/minio";
import { BUCKETS } from "@/lib/minio-constants";

// POST /api/v1/recruitment/offer-letters/[id]/approve
// MANAGER (TP HCNS) hoặc HR_ADMIN duyệt → auto:
//   1. Render PDF từ template + auto-fill thông tin
//   2. Upload PDF lên MinIO
//   3. Gửi email cho ứng viên (kèm PDF attachment)
//   4. Update status = SENT, sentAt, expiresAt = sentAt + 7 ngày
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!["MANAGER", "HR_ADMIN", "BOM"].includes(userRole)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Chỉ TP HCNS / HR_ADMIN / BGĐ duyệt được" } }, { status: 403 });
  }

  const approver = await prisma.employee.findFirst({
    where: { userId: (session.user as any).id },
    select: { id: true, fullName: true },
  });
  if (!approver) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const offer = await prisma.offerLetter.findUnique({
    where: { id: params.id },
    include: { candidate: { select: { id: true, fullName: true, email: true } } },
  });
  if (!offer) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (offer.status !== "PENDING_HR_MGR") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ duyệt khi đang ở trạng thái chờ duyệt" } }, { status: 409 });
  }
  if (!offer.candidate.email) {
    return NextResponse.json({ error: { code: "NO_EMAIL", message: "Ứng viên không có email — không gửi được" } }, { status: 400 });
  }

  // ── 1. Render PDF ──
  const pdfBuf = await renderOfferLetterPdf({
    letterNumber: offer.letterNumber,
    candidateFullName: offer.candidate.fullName,
    // Candidate schema chưa có gender → fallback "Anh/Chị" (formal neutral).
    // Khi cần đúng kính ngữ: thêm OfferLetter.gender + form select cho HR.
    candidateGender: "Anh/Chị",
    position: offer.position,
    departmentName: offer.departmentName || "",
    workLocation: offer.workLocation,
    officialSalary: Number(offer.officialSalary),
    probationarySalary: Number(offer.probationarySalary),
    probationDays: offer.probationDays,
    startDate: offer.startDate,
    probationEndDate: offer.probationEndDate,
    benefits: offer.benefits || "",
    hrManagerName: approver.fullName,
    issuedDate: new Date(),
  });

  // ── 2. Upload to MinIO ──
  await ensureBucket(BUCKETS.HR_DOCUMENTS);
  const safeNum = offer.letterNumber.replace(/\//g, "_");
  const objectName = `offer-letters/${safeNum}_${Date.now()}.pdf`;
  const minio = getMinioClient();
  await minio.putObject(BUCKETS.HR_DOCUMENTS, objectName, pdfBuf, pdfBuf.length, {
    "Content-Type": "application/pdf",
  });
  const pdfUrl = getFileUrl(BUCKETS.HR_DOCUMENTS, objectName);

  // ── 3. Send email ──
  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + 7);

  let mailErr: string | null = null;
  try {
    await sendMail({
      to: offer.candidate.email,
      subject: `[IBS HI] Thư mời nhận việc số ${offer.letterNumber}`,
      html: `
        <p>Kính gửi <strong>${offer.candidate.fullName}</strong>,</p>
        <p>Công ty Cổ phần Công nghiệp Nặng IBS trân trọng gửi <strong>Thư mời nhận việc</strong> tới Anh/Chị (file PDF đính kèm).</p>
        <p>Vị trí: <strong>${offer.position}</strong> — Bộ phận: <strong>${offer.departmentName || "—"}</strong></p>
        <p>Ngày bắt đầu làm việc dự kiến: <strong>${offer.startDate.toLocaleDateString("vi-VN")}</strong></p>
        <p>Vui lòng phản hồi xác nhận trước ngày <strong>${expiresAt.toLocaleDateString("vi-VN")}</strong> (7 ngày kể từ hôm nay).</p>
        <p>Trân trọng,<br/><strong>Phòng Hành Chính Nhân Sự — IBS HI</strong></p>
      `,
      attachments: [
        {
          filename: `Thu_moi_${offer.letterNumber.replace(/\//g, "_")}.pdf`,
          content: pdfBuf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e: any) {
    mailErr = e.message || "Lỗi gửi email";
  }

  // ── 4. Update status + sync candidate.status = OFFERED (nếu mail đã gửi) ──
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.offerLetter.update({
      where: { id: params.id },
      data: {
        status: mailErr ? "APPROVED" : "SENT", // Nếu mail lỗi → để APPROVED, HCNS resend tay
        approvedBy: approver.id,
        approvedAt: new Date(),
        pdfUrl,
        sentToEmail: mailErr ? null : offer.candidate.email,
        sentAt: mailErr ? null : sentAt,
        expiresAt: mailErr ? null : expiresAt,
      },
    });
    if (!mailErr) {
      await tx.candidate.update({
        where: { id: offer.candidate.id },
        data: { status: "OFFERED" },
      });
    }
    return u;
  });

  return NextResponse.json({
    data: updated,
    warning: mailErr ? `Đã duyệt + tạo PDF nhưng gửi email thất bại: ${mailErr}. Vui lòng dùng nút "Gửi lại".` : null,
  });
}
