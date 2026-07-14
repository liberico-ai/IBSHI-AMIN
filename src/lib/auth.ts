import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { effectivePerms } from "@/lib/permission-catalog";

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
        // QUAN TRỌNG (chống 502): KHÔNG nhồi mảng quyền lớn vào JWT — cookie phình vượt
        // giới hạn header của proxy (nginx) → 502. Dính các role có gói mẫu lớn (ADMIN 210 quyền,
        // HR_ADMIN/BOM…). Cơ chế:
        //  - ADMIN = toàn quyền theo role (canUser/useCan tự nhận ADMIN) → để rỗng, không lưu gì.
        //  - Account CÓ ma trận riêng → chỉ lưu ĐÚNG bộ quyền riêng đó.
        //  - Account KHÔNG tùy chỉnh → KHÔNG lưu perms; canUser/useCan tự fallback gói mẫu của role
        //    (kết quả y hệt) → cookie nhỏ gọn.
        if ((user as any).role === "ADMIN") {
          token.perms = [];
        } else {
          try {
            const grant = await prisma.accessGrant.findUnique({ where: { userId: (user as any).id } });
            token.perms = grant ? Array.from(effectivePerms((user as any).role, grant.perms)) : undefined;
          } catch {
            token.perms = undefined; // lỗi đọc (vd thiếu bảng) → fallback gói mẫu, KHÔNG khóa nhầm
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).employeeCode = token.employeeCode;
        (session.user as any).forcePasswordChange = token.forcePasswordChange;
        // Giữ nguyên: mảng (kể cả []) → dùng đúng nó; undefined (không tùy chỉnh) → để undefined
        // cho canUser/useCan tự fallback gói mẫu của role. KHÔNG ép thành [] (sẽ khóa nhầm).
        (session.user as any).perms = Array.isArray((token as any).perms) ? (token as any).perms : undefined;
      }
      return session;
    },
  },
});
