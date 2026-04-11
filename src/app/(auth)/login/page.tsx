"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email hoặc mật khẩu không đúng");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Đã xảy ra lỗi. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ibs-bg)" }}>
      <div
        className="w-full max-w-[400px] p-8 rounded-xl border"
        style={{
          background: "var(--ibs-bg-card)",
          borderColor: "var(--ibs-border)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #00B4D8, #2E75B6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            IBS ONE
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--ibs-text-dim)" }}>
            Admin Platform v1.2
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--ibs-text-dim)" }}
            >
              Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="toannd"
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                background: "var(--ibs-bg)",
                border: "1px solid var(--ibs-border)",
                color: "var(--ibs-text)",
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--ibs-text-dim)" }}
            >
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                background: "var(--ibs-bg)",
                border: "1px solid var(--ibs-border)",
                color: "var(--ibs-text)",
              }}
            />
          </div>

          {error && (
            <div
              className="text-xs p-3 rounded-lg"
              style={{
                background: "rgba(239,68,68,0.1)",
                color: "var(--ibs-danger)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: "var(--ibs-accent)",
            }}
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--ibs-text-dim)" }}
        >
          IBS Heavy Industry JSC © 2026
        </p>
      </div>
    </div>
  );
}
