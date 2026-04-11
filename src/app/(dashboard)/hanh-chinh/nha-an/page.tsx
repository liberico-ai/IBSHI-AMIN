"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { formatDate } from "@/lib/utils";
import { Plus, RefreshCw, X, Star } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type CostItem = { departmentId: string; departmentName: string; lunchCount: number; dinnerCount: number; guestCount: number; totalMeals: number; totalCost: number; unitPrice: number };
type CostMeta = { grandTotal: number; unitPrice: number; month: number; year: number; guestMeals?: number; guestMealCost?: number };
type Department = { id: string; code: string; name: string };
type MealReg = {
  id: string; departmentId: string; date: string;
  lunchCount: number; dinnerCount: number; guestCount: number; specialNote?: string | null;
  department: { id: string; name: string };
};
type MealFeedback = {
  id: string; employeeId: string; date: string; rating: number; comment: string | null;
  employee: { code: string; fullName: string };
};
type FeedbackMeta = { total: number; avgRating: number | null; distribution: { star: number; count: number }[] };
type WeeklyMenuItem = { id: string; weekNumber: number; year: number; dayOfWeek: number; mainDish: string; sideDish: string; soup: string; dessert: string | null };

const DOW_LABELS = ["", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6"];

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default function NhaAnPage() {
  const [tab, setTab] = useState<"registrations" | "feedback" | "cost" | "menu">("registrations");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [registrations, setRegistrations] = useState<MealReg[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [feedbacks, setFeedbacks] = useState<MealFeedback[]>([]);
  const [feedbackMeta, setFeedbackMeta] = useState<FeedbackMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const now = new Date();
  const [costMonth, setCostMonth] = useState(now.getMonth() + 1);
  const [costYear, setCostYear] = useState(now.getFullYear());
  const [costData, setCostData] = useState<CostItem[]>([]);
  const [costMeta, setCostMeta] = useState<CostMeta | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<WeeklyMenuItem[]>([]);
  const [menuWeek, setMenuWeek] = useState(getISOWeek(new Date()));
  const [menuYear, setMenuYear] = useState(new Date().getFullYear());
  const [menuLoading, setMenuLoading] = useState(false);
  const [editMenu, setEditMenu] = useState<WeeklyMenuItem | null>(null);
  const [menuForm, setMenuForm] = useState({ mainDish: "", sideDish: "", soup: "", dessert: "" });
  const [menuDayOfWeek, setMenuDayOfWeek] = useState(1);
  const [showMenuForm, setShowMenuForm] = useState(false);

  function fetchMenu(wk?: number, yr?: number) {
    const w = wk ?? menuWeek; const y = yr ?? menuYear;
    setMenuLoading(true);
    fetch(`/api/v1/meals/menu?week=${w}&year=${y}`)
      .then((r) => r.json()).then((res) => setMenuItems(res.data || []))
      .finally(() => setMenuLoading(false));
  }

  async function saveMenuItem() {
    const payload = { weekNumber: menuWeek, year: menuYear, dayOfWeek: menuDayOfWeek, ...menuForm };
    if (editMenu) {
      await fetch(`/api/v1/meals/menu/${editMenu.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(menuForm) });
    } else {
      await fetch("/api/v1/meals/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowMenuForm(false); setEditMenu(null); setMenuForm({ mainDish: "", sideDish: "", soup: "", dessert: "" });
    fetchMenu();
  }

  async function deleteMenuItem(id: string) {
    if (!confirm("Xóa thực đơn này?")) return;
    await fetch(`/api/v1/meals/menu/${id}`, { method: "DELETE" });
    fetchMenu();
  }

  function fetchRegs() {
    setLoading(true);
    fetch(`/api/v1/meals?date=${selectedDate}`)
      .then((r) => r.json()).then((res) => setRegistrations(res.data || []))
      .finally(() => setLoading(false));
  }

  function fetchCostReport(month?: number, year?: number) {
    const m = month ?? costMonth;
    const y = year ?? costYear;
    setCostLoading(true);
    fetch(`/api/v1/meals?type=cost-report&month=${m}&year=${y}`)
      .then((r) => r.json())
      .then((res) => { setCostData(res.data || []); setCostMeta(res.meta || null); })
      .finally(() => setCostLoading(false));
  }

  function fetchFeedbacks() {
    fetch(`/api/v1/meals/feedback?date=${selectedDate}`)
      .then((r) => r.json()).then((res) => { setFeedbacks(res.data || []); setFeedbackMeta(res.meta || null); });
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      setUserRole(res.data?.role || "");
      setMyEmployeeId(res.data?.employeeId || null);
    });
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
  }, []);

  useEffect(() => { fetchRegs(); fetchFeedbacks(); }, [selectedDate]);

  const totalLunch  = registrations.reduce((s, r) => s + r.lunchCount, 0);
  const totalDinner = registrations.reduce((s, r) => s + r.dinnerCount, 0);
  const totalGuest  = registrations.reduce((s, r) => s + r.guestCount, 0);

  async function handleDelete(departmentId: string) {
    await fetch(`/api/v1/meals?departmentId=${departmentId}&date=${selectedDate}`, { method: "DELETE" });
    fetchRegs();
  }

  const isHRAdmin = userRole === "HR_ADMIN" || userRole === "BOM";

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link href="/hanh-chinh" className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>← Hành chính</Link>
      </div>
      <PageTitle title="Nhà ăn" description="Đăng ký suất ăn hàng ngày theo phòng ban" />

      {/* Date picker + tabs toolbar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Ngày:</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-[13px] border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
        </div>
        <button onClick={() => { fetchRegs(); fetchFeedbacks(); }} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
        {tab === "registrations" && isHRAdmin && (
          <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Plus size={14} /> Đăng ký suất ăn
          </button>
        )}
        {tab === "feedback" && myEmployeeId && (
          <button onClick={() => setShowFeedback(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Star size={14} /> Đánh giá
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {(["registrations", "feedback", "cost", "menu"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === "cost") fetchCostReport(); if (t === "menu") fetchMenu(); }}
            className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "registrations" ? "Đăng ký suất ăn" : t === "feedback" ? "Khảo sát chất lượng" : t === "cost" ? "Chi phí" : "Thực đơn tuần"}
          </button>
        ))}
      </div>

      {tab === "registrations" && <>
        {/* Summary — per meal category */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Bữa trưa</div>
            <div className="text-[32px] font-bold" style={{ color: "var(--ibs-accent)" }}>{totalLunch}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>suất ăn</div>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Bữa tối OT</div>
            <div className="text-[32px] font-bold" style={{ color: "#8b5cf6" }}>{totalDinner}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>suất ăn</div>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Suất khách</div>
            <div className="text-[32px] font-bold" style={{ color: "var(--ibs-warning)" }}>{totalGuest}</div>
            <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>suất ăn</div>
          </div>
        </div>

        {/* Registration table per department */}
        {registrations.length > 0 ? (
          <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="px-5 py-3 border-b text-[14px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
              Đăng ký suất ăn ngày {formatDate(selectedDate)}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>PHÒNG BAN</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRƯA</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỐI OT</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>KHÁCH</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỔNG</th>
                  {isHRAdmin && <th className="px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <td className="px-5 py-2.5 font-medium">{r.department.name}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-accent)" }}>{r.lunchCount}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "#8b5cf6" }}>{r.dinnerCount}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-warning)" }}>{r.guestCount}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{r.lunchCount + r.dinnerCount + r.guestCount}</td>
                    {isHRAdmin && (
                      <td className="px-5 py-2.5 text-right">
                        <button onClick={() => handleDelete(r.departmentId)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa</button>
                      </td>
                    )}
                  </tr>
                ))}
                <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                  <td className="px-5 py-2.5 font-bold text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>TỔNG CỘNG</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{totalLunch}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "#8b5cf6" }}>{totalDinner}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "var(--ibs-warning)" }}>{totalGuest}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{totalLunch + totalDinner + totalGuest}</td>
                  {isHRAdmin && <td />}
                </tr>
              </tbody>
            </table>
            </div>
            {registrations.some((r) => r.specialNote) && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>GHI CHÚ ĐẶC BIỆT</div>
                {registrations.filter((r) => r.specialNote).map((r) => (
                  <div key={r.id} className="text-[12px] mb-1">
                    <span className="font-medium">{r.department.name}:</span>{" "}
                    <span style={{ color: "var(--ibs-text-dim)" }}>{r.specialNote}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          !loading && (
            <div className="rounded-xl border flex items-center justify-center py-16" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có đăng ký suất ăn cho ngày này</div>
            </div>
          )
        )}
      </>}

      {tab === "feedback" && <>
        {feedbackMeta && feedbackMeta.total > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-3">
            <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Tổng phản hồi</div>
              <div className="text-[32px] font-bold" style={{ color: "var(--ibs-accent)" }}>{feedbackMeta.total}</div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>Điểm trung bình</div>
              <div className="flex items-center gap-1">
                <span className="text-[32px] font-bold" style={{ color: "#f59e0b" }}>{feedbackMeta.avgRating ?? "—"}</span>
                <Star size={20} fill="#f59e0b" color="#f59e0b" />
              </div>
            </div>
            <div className="rounded-xl border p-4 md:col-span-1 col-span-2" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>Phân bố đánh giá</div>
              <div className="flex flex-col gap-1">
                {[...feedbackMeta.distribution].reverse().map(({ star, count }) => (
                  <div key={star} className="flex items-center gap-2 text-[11px]">
                    <span className="w-4 text-right" style={{ color: "var(--ibs-text-dim)" }}>{star}★</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ibs-border)" }}>
                      <div className="h-full rounded-full" style={{ background: "#f59e0b", width: `${feedbackMeta.total > 0 ? (count / feedbackMeta.total) * 100 : 0}%` }} />
                    </div>
                    <span style={{ color: "var(--ibs-text-dim)" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-3 border-b text-[14px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
            Phản hồi ngày {formatDate(selectedDate)}
          </div>
          {feedbacks.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có phản hồi cho ngày này</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
              {feedbacks.map((f) => (
                <div key={f.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">{f.employee.fullName}</div>
                    {f.comment && <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>{f.comment}</div>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={14} fill={s <= f.rating ? "#f59e0b" : "transparent"} color={s <= f.rating ? "#f59e0b" : "var(--ibs-border)"} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}

      {tab === "cost" && (
        <div>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Tháng:</label>
              <select value={costMonth} onChange={(e) => { const m = parseInt(e.target.value); setCostMonth(m); fetchCostReport(m, costYear); }}
                className="rounded-lg px-3 py-1.5 text-[13px] border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Năm:</label>
              <select value={costYear} onChange={(e) => { const y = parseInt(e.target.value); setCostYear(y); fetchCostReport(costMonth, y); }}
                className="rounded-lg px-3 py-1.5 text-[13px] border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
                {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => fetchCostReport()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {costMeta && (
              <div className="ml-auto text-[13px]">
                Tổng tháng {costMonth}/{costYear}:{" "}
                <span className="font-bold" style={{ color: "var(--ibs-accent)" }}>{(costMeta.grandTotal).toLocaleString("vi-VN")}đ</span>
              </div>
            )}
          </div>

          {costLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : costData.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có dữ liệu</div>
          ) : (
            <>
              <div className="rounded-xl border p-5 mb-5" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="text-[14px] font-semibold mb-4">
                  Tổng hợp chi phí suất ăn theo phòng ban — Tháng {costMonth}/{costYear}
                </div>
                <ResponsiveContainer width="100%" height={Math.max(200, costData.length * 40)}>
                  <BarChart data={costData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ibs-border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                      tick={{ fill: "var(--ibs-text-dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="departmentName" width={90}
                      tick={{ fill: "var(--ibs-text)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString("vi-VN")}đ`, "Chi phí"]}
                      contentStyle={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="totalCost" fill="var(--ibs-accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                      <th className="text-left px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>PHÒNG BAN</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRƯA</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỐI OT</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>KHÁCH</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SỐ SUẤT</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>ĐƠN GIÁ</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>THÀNH TIỀN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.map((row) => (
                      <tr key={row.departmentId} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                        <td className="px-5 py-2.5 font-medium">{row.departmentName}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: "var(--ibs-accent)" }}>{row.lunchCount}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: "#8b5cf6" }}>{row.dinnerCount}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: "var(--ibs-warning)" }}>{row.guestCount}</td>
                        <td className="px-4 py-2.5 text-right">{row.totalMeals.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-text-dim)" }}>{row.unitPrice.toLocaleString("vi-VN")}đ</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-accent)" }}>{row.totalCost.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    ))}
                    {costMeta && (costMeta.guestMeals ?? 0) > 0 && (
                      <tr className="border-b" style={{ borderColor: "var(--ibs-border)", background: "rgba(234,179,8,0.06)" }}>
                        <td className="px-5 py-2.5 font-medium" colSpan={4} style={{ color: "var(--ibs-warning)" }}>Khách / Đối tác (check-in)</td>
                        <td className="px-4 py-2.5 text-right">{costMeta.guestMeals!.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-text-dim)" }}>{costMeta.unitPrice.toLocaleString("vi-VN")}đ</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-warning)" }}>{costMeta.guestMealCost!.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    )}
                    {costMeta && (
                      <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                        <td className="px-5 py-3 font-bold" colSpan={6}>Tổng cộng</td>
                        <td className="px-5 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{costMeta.grandTotal.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "menu" && (
        <div>
          {/* Week navigator */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button
              onClick={() => {
                let w = menuWeek - 1; let y = menuYear;
                if (w < 1) { y -= 1; w = getISOWeek(new Date(y, 11, 28)); }
                setMenuWeek(w); setMenuYear(y); fetchMenu(w, y);
              }}
              className="px-3 py-1.5 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              ← Tuần trước
            </button>
            <div className="text-[14px] font-semibold" style={{ color: "var(--ibs-text)" }}>
              Tuần {menuWeek} — {menuYear}
            </div>
            <button
              onClick={() => {
                let w = menuWeek + 1; let y = menuYear;
                const maxWeek = getISOWeek(new Date(y, 11, 28));
                if (w > maxWeek) { y += 1; w = 1; }
                setMenuWeek(w); setMenuYear(y); fetchMenu(w, y);
              }}
              className="px-3 py-1.5 rounded-lg border text-[13px]"
              style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              Tuần sau →
            </button>
            <button onClick={() => fetchMenu()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
          </div>

          {menuLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : (
            <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                      <th className="text-left px-5 py-3 text-[11px] font-semibold w-28" style={{ color: "var(--ibs-text-dim)" }}>NGÀY</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>MÓN CHÍNH</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>MÓN PHỤ</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CANH / SOUP</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRÁNG MIỆNG</th>
                      {isHRAdmin && <th className="px-5 py-3 w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map((dow) => {
                      const item = menuItems.find((m) => m.dayOfWeek === dow);
                      return (
                        <tr key={dow} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                          <td className="px-5 py-3 font-semibold" style={{ color: "var(--ibs-accent)" }}>{DOW_LABELS[dow]}</td>
                          {item ? (
                            <>
                              <td className="px-4 py-3">{item.mainDish}</td>
                              <td className="px-4 py-3">{item.sideDish}</td>
                              <td className="px-4 py-3">{item.soup}</td>
                              <td className="px-4 py-3" style={{ color: "var(--ibs-text-dim)" }}>{item.dessert || "—"}</td>
                              {isHRAdmin && (
                                <td className="px-5 py-3 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button
                                      onClick={() => {
                                        setEditMenu(item);
                                        setMenuForm({ mainDish: item.mainDish, sideDish: item.sideDish, soup: item.soup, dessert: item.dessert || "" });
                                        setMenuDayOfWeek(dow);
                                        setShowMenuForm(true);
                                      }}
                                      className="text-[12px]" style={{ color: "var(--ibs-accent)" }}>Sửa</button>
                                    <button onClick={() => deleteMenuItem(item.id)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa</button>
                                  </div>
                                </td>
                              )}
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3" style={{ color: "var(--ibs-text-dim)" }}>—</td>
                              <td className="px-4 py-3" style={{ color: "var(--ibs-text-dim)" }}>—</td>
                              <td className="px-4 py-3" style={{ color: "var(--ibs-text-dim)" }}>—</td>
                              <td className="px-4 py-3" style={{ color: "var(--ibs-text-dim)" }}>—</td>
                              {isHRAdmin && (
                                <td className="px-5 py-3 text-right">
                                  <button
                                    onClick={() => {
                                      setEditMenu(null);
                                      setMenuForm({ mainDish: "", sideDish: "", soup: "", dessert: "" });
                                      setMenuDayOfWeek(dow);
                                      setShowMenuForm(true);
                                    }}
                                    className="text-[12px] flex items-center gap-1 ml-auto" style={{ color: "var(--ibs-accent)" }}>
                                    <Plus size={12} /> Thêm
                                  </button>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Add/Edit form modal */}
          {showMenuForm && isHRAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
              <div className="rounded-2xl border p-6 w-full max-w-md" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[15px] font-semibold">
                    {editMenu ? "Sửa thực đơn" : "Thêm thực đơn"} — {DOW_LABELS[menuDayOfWeek]}
                  </div>
                  <button onClick={() => { setShowMenuForm(false); setEditMenu(null); }} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
                </div>
                <div className="flex flex-col gap-3">
                  {(["mainDish", "sideDish", "soup", "dessert"] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>
                        {field === "mainDish" ? "Món chính *" : field === "sideDish" ? "Món phụ *" : field === "soup" ? "Canh / Soup *" : "Tráng miệng"}
                      </label>
                      <input
                        value={menuForm[field]}
                        onChange={(e) => setMenuForm((f) => ({ ...f, [field]: e.target.value }))}
                        placeholder={field === "dessert" ? "Tuỳ chọn" : "Nhập tên món..."}
                        className="w-full rounded-lg px-3 py-2 text-[13px] border"
                        style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-5 justify-end">
                  <button onClick={() => { setShowMenuForm(false); setEditMenu(null); }}
                    className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Hủy</button>
                  <button
                    onClick={saveMenuItem}
                    disabled={!menuForm.mainDish || !menuForm.sideDish || !menuForm.soup}
                    className="px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: "var(--ibs-accent)", color: "#fff", opacity: (!menuForm.mainDish || !menuForm.sideDish || !menuForm.soup) ? 0.5 : 1 }}>
                    {editMenu ? "Lưu thay đổi" : "Thêm thực đơn"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showRegister && (
        <RegisterMealModal departments={departments} selectedDate={selectedDate}
          onClose={() => setShowRegister(false)} onSuccess={() => { setShowRegister(false); fetchRegs(); }} />
      )}
      {showFeedback && myEmployeeId && (
        <FeedbackModal employeeId={myEmployeeId} selectedDate={selectedDate}
          onClose={() => setShowFeedback(false)} onSuccess={() => { setShowFeedback(false); fetchFeedbacks(); }} />
      )}
    </div>
  );
}

function RegisterMealModal({ departments, selectedDate, onClose, onSuccess }: {
  departments: Department[]; selectedDate: string; onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    departmentId: "",
    date: selectedDate,
    lunchCount: 0,
    dinnerCount: 0,
    guestCount: 0,
    specialNote: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/v1/meals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        specialNote: form.specialNote || null,
      }),
    });
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Đăng ký suất ăn theo phòng ban</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Phòng ban *</label>
            <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>
              <option value="">Chọn phòng ban...</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Bữa trưa</label>
              <input type="number" min={0} max={500} value={form.lunchCount} onChange={(e) => setForm({ ...form, lunchCount: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Bữa tối OT</label>
              <input type="number" min={0} max={500} value={form.dinnerCount} onChange={(e) => setForm({ ...form, dinnerCount: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Suất khách</label>
              <input type="number" min={0} max={500} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ghi chú đặc biệt</label>
            <input type="text" value={form.specialNote} onChange={(e) => setForm({ ...form, specialNote: e.target.value })}
              placeholder="Ví dụ: suất chay, dị ứng..." className="w-full rounded-lg px-3 py-2 text-[13px] border" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang lưu..." : "Đăng ký"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeedbackModal({ employeeId, selectedDate, onClose, onSuccess }: {
  employeeId: string; selectedDate: string; onClose: () => void; onSuccess: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await fetch("/api/v1/meals/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, date: selectedDate, rating, comment: comment || null }),
    });
    setSaving(false); onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-sm mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Đánh giá chất lượng bữa ăn</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-[12px] font-medium mb-2 block" style={{ color: "var(--ibs-text-dim)" }}>Đánh giá sao *</label>
            <div className="flex items-center gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRating(s)} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}>
                  <Star size={32} fill={(hovered || rating) >= s ? "#f59e0b" : "transparent"} color={(hovered || rating) >= s ? "#f59e0b" : "var(--ibs-border)"} />
                </button>
              ))}
            </div>
            <div className="text-center text-[12px] mt-1" style={{ color: "var(--ibs-text-dim)" }}>
              {["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Rất tốt"][rating]}
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Nhận xét (tùy chọn)</label>
            <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Chia sẻ ý kiến..."
              className="w-full rounded-lg px-3 py-2 text-[13px] border resize-none" style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              {saving ? "Đang gửi..." : "Gửi đánh giá"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
