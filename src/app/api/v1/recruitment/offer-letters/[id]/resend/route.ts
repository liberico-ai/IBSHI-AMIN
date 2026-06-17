import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { presignFileUrl } from "@/lib/minio";

// Gửi lại email (dùng PDF đã render trước đó nếu có; nếu không có pdfUrl → báo lỗi)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const userRole = (session.user as any).role;
  if (!["MANAGER", "HR_ADMIN", "BOM"].includes(userRole)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const offer = await prisma.offerLetter.findUnique({
    where: { id: params.id },
    include: { candidate: { select: { fullName: true, email: true } } },
  });
  if (!offer) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!["APPROVED", "SENT"].includes(offer.status)) {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: "Chỉ resend khi đã duyệt" } }, { status: 409 });
  }
  if (!offer.candidate.email) {
    return NextResponse.json({ error: { code: "NO_EMAIL" } }, { status: 400 });
  }
  if (!offer.pdfUrl) {
    return NextResponse.json({ error: { code: "NO_PDF", message: "PDF chưa được render — hãy reject + duyệt lại" } }, { status: 400 });
  }
  // Throttle: chặn resend liên tục trong vòng 5 phút để tránh spam ứng viên
  // (FE double-click, bug loop, hoặc bị abuse khi credential HR bị lộ).
  if (offer.sentAt && Date.now() - offer.sentAt.getTime() < 5 * 60 * 1000) {
    const waitSec = Math.ceil((5 * 60 * 1000 - (Date.now() - offer.sentAt.getTime())) / 1000);
    return NextResponse.json({
      error: { code: "RATE_LIMITED", message: `Vừa gửi cách đây ít phút. Vui lòng chờ ${waitSec}s.` },
    }, { status: 429 });
  }

  // Tải PDF từ MinIO. Bucket HR là PRIVATE → phải ký URL (presigned), KHÔNG fetch URL thô (sẽ 403).
  const signedUrl = await presignFileUrl(offer.pdfUrl);
  const r = signedUrl ? await fetch(signedUrl) : null;
  if (!r || !r.ok) {
    return NextResponse.json({ error: { code: "PDF_FETCH_FAILED", message: "Không tải được file PDF thư mời từ kho lưu trữ" } }, { status: 500 });
  }
  const pdfBuf = Buffer.from(await r.arrayBuffer());

  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + 7);

  await sendMail({
    to: offer.candidate.email,
    subject: `[IBS HI] (Gửi lại) Thư mời nhận việc số ${offer.letterNumber}`,
    html: `
      <p>Kính gửi <strong>${offer.candidate.fullName}</strong>,</p>
      <p>Đây là email <strong>gửi lại</strong> Thư mời nhận việc của Anh/Chị (file PDF đính kèm).</p>
      <p>Vui lòng phản hồi trước ngày <strong>${expiresAt.toLocaleDateString("vi-VN")}</strong>.</p>
      <p>Trân trọng,<br/><strong>Phòng HCNS — IBS HI</strong></p>
    `,
    attachments: [
      {
        filename: `Thu_moi_${offer.letterNumber.replace(/\//g, "_")}.pdf`,
        content: pdfBuf,
        contentType: "application/pdf",
      },
    ],
  });

  const updated = await prisma.offerLetter.update({
    where: { id: params.id },
    data: { status: "SENT", sentToEmail: offer.candidate.email, sentAt, expiresAt },
  });

  return NextResponse.json({ data: updated });
}
