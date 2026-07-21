import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { getToken } from "next-auth/jwt";

// Các path KHÔNG log tác vụ (nhiễu / hệ thống / tránh vòng lặp).
const NO_LOG_PREFIX = [
  "/api/v1/activity-log",
  "/api/v1/auth",
  "/api/v1/telegram",
  "/api/v1/cron",
  "/api/v1/notifications",
];

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  // Auth.js v5: khi chạy HTTPS (sau reverse proxy), cookie phiên có tên
  // "__Secure-authjs.session-token"; tên cookie cũng là "salt" để giải mã token.
  // getToken mặc định `secureCookie ?? false` -> tìm tên "authjs.session-token"
  // (KHÔNG đọc NEXTAUTH_URL) nên trên HTTPS sẽ không thấy cookie -> token null.
  // Đọc tường minh: thử tên "__Secure-" (HTTPS) trước, fallback tên thường (HTTP/dev).
  // Dùng ĐÚNG secret mà Auth.js ký cookie (AUTH_SECRET), fallback NEXTAUTH_SECRET —
  // để không lệch với auth()/`/api/auth/session` (vốn dùng AUTH_SECRET) trên prod.
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const token =
    (await getToken({ req: request, secret, secureCookie: true, cookieName: "__Secure-authjs.session-token" })) ||
    (await getToken({ req: request, secret, secureCookie: false, cookieName: "authjs.session-token" }));

  const { pathname } = request.nextUrl;

  // Allow auth routes and public assets
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/change-password") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname.startsWith("/api/v1/activity-log") || // endpoint tự kiểm tra quyền
    pathname.startsWith("/api/v1/cron") ||         // cron: tự bảo vệ bằng x-cron-secret
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Redirect to login if no token
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to change-password page if forced
  if ((token as any).forcePasswordChange && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // ── Phase 2: log mọi tác vụ GHI qua API (fire-and-forget) ──
  const method = request.method;
  if (
    (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") &&
    pathname.startsWith("/api/v1/") &&
    !NO_LOG_PREFIX.some((p) => pathname.startsWith(p)) &&
    token.sub
  ) {
    const xff = request.headers.get("x-forwarded-for") || "";
    const ip = (xff.split(",")[0] || request.headers.get("x-real-ip") || "").trim();
    event.waitUntil(
      fetch(`${request.nextUrl.origin}/api/v1/activity-log`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-log": process.env.NEXTAUTH_SECRET || "",
        },
        body: JSON.stringify({ userId: token.sub, method, path: pathname, ip }),
      }).catch(() => {})
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
