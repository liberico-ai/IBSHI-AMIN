import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Tên đăng nhập", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const login = (credentials.username as string).trim().toLowerCase();

        // Look up by employeeCode (username) first, fallback to email
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { employeeCode: { equals: login, mode: "insensitive" } },
              { email: { equals: login, mode: "insensitive" } },
            ],
          },
          include: { employee: true },
        });

        if (!user || !user.isActive) return null;

        const isPasswordValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) return null;

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
