import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/v1/visitors/:id/badge/qr
// Returns the QR code SVG for the visitor's badge (inline image)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const badge = await prisma.visitorBadge.findFirst({
    where: { registrationId: id },
    select: { qrData: true, badgeNumber: true },
  });

  if (!badge?.qrData) {
    return new NextResponse("QR not found", { status: 404 });
  }

  // qrData is stored as data:image/svg+xml;base64,<base64>
  if (badge.qrData.startsWith("data:image/svg+xml;base64,")) {
    const svgBase64 = badge.qrData.replace("data:image/svg+xml;base64,", "");
    const svgBuffer = Buffer.from(svgBase64, "base64");
    return new NextResponse(svgBuffer, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json({ data: { qrData: badge.qrData } });
}
