"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, ShieldAlert } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Có lỗi xảy ra");
        return;
      }
      setSuccess(true);
      // Reload session by navigating to home — next-auth will re-fetch the session
      setTimeout(() => router.push("/"), 1500);
    } catch {
      setError("Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full pl-10 pr-4 py-2.5 rounded-xl text-[14px] outline-none transition-colors";
  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#fff",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "rgba(30,41,59,0.95)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(239,68,68,0.15)" }}
          >
            <ShieldAlert size={24} color="#ef4444" />
          </div>
          <h1 className="text-[22px] font-bold text-white mb-1">Đổi mật khẩu</h1>
          <p className="text-[13px]" style={{ color: "rgba(148,163,184,0.8)" }}>
            Tài khoản của bạn yêu cầu đổi mật khẩu trước khi tiếp tục.
            <br />
            Mật khẩu mặc định là <strong>6 số cuối CCCD</strong>.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
          {error && (
            <div
              className="text-[13px] px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5" }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="text-[13px] px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(16,185,129,0.12)", color: "#6ee7b7" }}
            >
              Đổi mật khẩu thành công! Đang chuyển hướng...
            </div>
          )}

          {/* Current password */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "rgba(148,163,184,0.8)" }}>
              Mật khẩu hiện tại
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(148,163,184,0.5)" }} />
              <input
                required
                type={showCurrent ? "text" : "password"}
                value={form.currentPassword}
                onChange={(e) => handleChange("currentPassword", e.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                className={inputCls}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "rgba(148,163,184,0.5)" }}
              >
                {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "rgba(148,163,184,0.8)" }}>
              Mật khẩu mới
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(148,163,184,0.5)" }} />
              <input
                required
                type={showNew ? "text" : "password"}
                value={form.newPassword}
                onChange={(e) => handleChange("newPassword", e.target.value)}
                placeholder="Ít nhất 8 ký tự"
                minLength={8}
                className={inputCls}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "rgba(148,163,184,0.5)" }}
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "rgba(148,163,184,0.8)" }}>
              Xác nhận mật khẩu mới
            </label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(148,163,184,0.5)" }} />
              <input
                required
                type="password"
                value={form.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || success}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white transition-all mt-2 disabled:opacity-60"
            style={{ background: saving || success ? "rgba(0,180,216,0.5)" : "var(--ibs-accent, #00b4d8)" }}
          >
            {saving ? "Đang lưu..." : success ? "Thành công!" : "Đổi mật khẩu"}
          </button>
        </form>
      </div>
    </div>
  );
}
