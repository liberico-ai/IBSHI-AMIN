import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// Chuẩn hoá 1 số về dạng "0xxxxxxxxx": bỏ ký tự thừa, +84/84 -> 0.
function canonPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length > 10) return "0" + digits.slice(2);
  return digits;
}
// 1 nhân sự có thể lưu NHIỀU SĐT chung 1 ô (ngăn bởi "/", "," ";"), nhưng
// CHỈ số ĐẦU TIÊN được dùng để đăng nhập. Số sau chỉ để lưu liên hệ.
function primaryPhone(stored: string): string {
  return canonPhone((stored || "").split(/[/,;]/)[0]);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Số điện thoại", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        // Đăng nhập bằng SỐ ĐIỆN THOẠI (Employee.phone). Không còn dùng mã NV / email.
        const input = canonPhone(credentials.username as string);
        if (!input) return null;

        // Quét NV đang hoạt động, so khớp theo TỪNG SĐT (tách nếu 1 người nhiều số).
        const actives = await prisma.employee.findMany({
          where: { user: { isActive: true } },
          select: { userId: true, phone: true },
        });
        const matchedUserIds = actives
          .filter((e) => primaryPhone(e.phone) === input)
          .map((e) => e.userId);

        // 0 hoặc >1 khớp → không xác định được người dùng (SĐT trùng) → từ chối an toàn.
        if (matchedUserIds.length !== 1) return null;

        const user = await prisma.user.findUnique({
          where: { id: matchedUserIds[0] },
          include: { employee: true },
        });

        if (!user || !user.isActive) return null;

        const isPasswordValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) return null;

        // Log đăng nhập thành công (fire-and-forget)
        try {
          const hdrs = (request as any)?.headers;
          const xff = hdrs?.get?.("x-forwarded-for") || "";
          const ip = (xff.split(",")[0] || hdrs?.get?.("x-real-ip") || "").trim() || undefined;
          logAudit({
            userId: user.id,
            action: "LOGIN",
            entityType: "Auth",
            entityId: user.id,
            newValue: { employeeCode: user.employeeCode, name: user.employee?.fullName || user.employeeCode },
            ipAddress: ip,
          });
        } catch {}

        return {
          id: user.id,
          email: user.email,
          name: user.employee?.fullName || user.employeeCode,
          role: user.role,
          employeeCode: user.employeeCode,
          forcePasswordChange: user.forcePasswordChange,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.employeeCode = (user as any).employeeCode;
        token.forcePasswordChange = (user as any).forcePasswordChange;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).employeeCode = token.employeeCode;
        (session.user as any).forcePasswordChange = token.forcePasswordChange;
      }
      return session;
    },
  },
});
