import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// Sinh các biến thể SĐT để tra cứu (dữ liệu có thể lưu "0912...", "+84912...", "84912...").
function phoneCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, ""); // chỉ giữ chữ số
  let local = digits;
  if (local.startsWith("84")) local = "0" + local.slice(2); // +84xxx / 84xxx -> 0xxx
  else if (!local.startsWith("0") && local.length === 9) local = "0" + local; // thiếu số 0 đầu
  const set = new Set<string>([trimmed, digits, local]);
  if (local.startsWith("0")) {
    set.add("84" + local.slice(1));
    set.add("+84" + local.slice(1));
  }
  return Array.from(set).filter((s) => s.length > 0);
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
        const candidates = phoneCandidates(credentials.username as string);
        if (candidates.length === 0) return null;

        const employees = await prisma.employee.findMany({
          where: { phone: { in: candidates } },
          include: { user: true },
        });

        // Chỉ tính các tài khoản đang hoạt động. Nếu 0 hoặc >1 → không xác định
        // được người dùng (SĐT trùng) → từ chối an toàn, không đăng nhập nhầm.
        const matches = employees.filter((e) => e.user && e.user.isActive);
        if (matches.length !== 1) return null;

        const employee = matches[0];
        const user = { ...employee.user, employee };

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
