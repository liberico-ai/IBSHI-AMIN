"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, RefreshCw, X, Star } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DateInput } from "@/components/shared/date-input";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";

type CostItem = { departmentId: string; departmentName: string; lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; totalMeals: number; totalCost: number };
type CostMeta = { grandTotal: number; unitPrice: number; month: number; year: number; guestMeals?: number; guestMealCost?: number; feedback?: { avgRating: number | null; count: number } };
type Department = { id: string; code: string; name: string };
type MealReg = {
  id: string; departmentId: string; date: string;
  lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; subcontractorName?: string | null; specialNote?: string | null;
  department: { id: string; name: string };
};
type SupplementaryReq = {
  id: string; departmentId: string; date: string;
  mealType: string; personType: string; quantity: number;
  guestUnitPrice: number; subcontractorName?: string | null;
  reason: string; specialNote?: string | null;
  status: string; rejectedReason?: string | null; createdAt: string;
  department: { id: string; name: string };
  requester: { id: string; email: string; employee?: { fullName: string; code: string } | null };
  approver?: { id: string; employee?: { fullName: string } | null } | null;
};
type MealFeedback = {
  id: string; employeeId: string; date: string; rating: number; comment: string | null;
  employee: { code: string; fullName: string };
};
type FeedbackMeta = { total: number; avgRating: number | null; distribution: { star: number; count: number }[] };
type FoodPurchase = { id: string; date: string; name: string; unit: string; quantity: number; unitPrice: number };

// Thứ trong tuần theo ngày dương lịch (0 = Chủ nhật).
function vnDow(d: Date): string {
  const day = d.getDay();
  return day === 0 ? "Chủ nhật" : `Thứ ${day + 1}`;
}
const fmtNum = (n: number) => n.toLocaleString("vi-VN");

const today = () => new Date().toISOString().slice(0, 10);

export default function NhaAnPage() {
  const [tab, setTab] = useState<"registrations" | "supplementary" | "feedback" | "cost" | "food">("registrations");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  // Backward-compat: selectedDate = dateFrom (dùng cho UI hiển thị "ngày X" khi chọn 1 ngày)
  const selectedDate = dateFrom;
  const isRange = dateFrom !== dateTo;
  const [registrations, setRegistrations] = useState<MealReg[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [feedbacks, setFeedbacks] = useState<MealFeedback[]>([]);
  const [feedbackMeta, setFeedbackMeta] = useState<FeedbackMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showSupplementary, setShowSupplementary] = useState(false);
  const [suppReqs, setSuppReqs] = useState<SupplementaryReq[]>([]);
  const [suppCanApprove, setSuppCanApprove] = useState(false);
  const [suppLoading, setSuppLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const now = new Date();
  const [costMonth, setCostMonth] = useState(now.getMonth() + 1);
  const [costYear, setCostYear] = useState(now.getFullYear());
  const [costData, setCostData] = useState<CostItem[]>([]);
  const [costMeta, setCostMeta] = useState<CostMeta | null>(null);
  const [costFoodTotal, setCostFoodTotal] = useState(0);
  const [costLoading, setCostLoading] = useState(false);
  const [costView, setCostView] = useState<"by-dept" | "by-day">("by-dept");
  type DayCostRow = { date: string; lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; totalMeals: number; mealCost: number; foodCost: number; diff: number };
  const [costByDay, setCostByDay] = useState<DayCostRow[]>([]);
  const [foodMonth, setFoodMonth] = useState(now.getMonth() + 1);
  const [foodYear, setFoodYear] = useState(now.getFullYear());
  const [foodRows, setFoodRows] = useState<FoodPurchase[]>([]);
  const [foodTotal, setFoodTotal] = useState(0);
  const [foodCanManage, setFoodCanManage] = useState(false);
  const [foodLoading, setFoodLoading] = useState(false);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [foodFormDate, setFoodFormDate] = useState(new Date().toISOString().slice(0, 10));

  function fetchFood(month?: number, year?: number) {
    const m = month ?? foodMonth; const y = year ?? foodYear;
    setFoodLoading(true);
    fetch(`/api/v1/meals/food-purchases?month=${m}&year=${y}`)
      .then((r) => r.json())
      .then((res) => { setFoodRows(res.data || []); setFoodTotal(res.meta?.total || 0); setFoodCanManage(!!res.meta?.canManage); })
      .finally(() => setFoodLoading(false));
  }

  async function deleteFoodDay(date: string) {
    if (!(await confirmDialog({ message: "Xóa toàn bộ thực phẩm mua ngày này?", tone: "danger", confirmText: "Xóa" }))) return;
    await fetch(`/api/v1/meals/food-purchases?date=${date}`, { method: "DELETE" });
    fetchFood();
  }

  function fetchRegs() {
    setLoading(true);
    fetch(`/api/v1/meals?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json()).then((res) => setRegistrations(res.data || []))
      .finally(() => setLoading(false));
  }

  function fetchSupplementary() {
    setSuppLoading(true);
    fetch(`/api/v1/meals/supplementary?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json())
      .then((res) => { setSuppReqs(res.data || []); setSuppCanApprove(!!res.canApprove); })
      .finally(() => setSuppLoading(false));
  }

  async function approveSupp(id: string) {
    const res = await fetch(`/api/v1/meals/supplementary/${id}/approve`, { method: "POST" });
    if (!res.ok) { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); return; }
    fetchSupplementary();
  }
  async function rejectSupp(id: string) {
    if (!(await confirmDialog({ message: "Từ chối phiếu đăng ký bổ sung này?", tone: "danger", confirmText: "Từ chối" }))) return;
    const res = await fetch(`/api/v1/meals/supplementary/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    if (!res.ok) { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); return; }
    fetchSupplementary();
  }

  function fetchCostReport(month?: number, year?: number) {
    const m = month ?? costMonth;
    const y = year ?? costYear;
    setCostLoading(true);
    Promise.all([
      fetch(`/api/v1/meals?type=cost-report&month=${m}&year=${y}`).then((r) => r.json()),
      fetch(`/api/v1/meals/food-purchases?month=${m}&year=${y}`).then((r) => r.json()),
      fetch(`/api/v1/meals?type=cost-by-day&month=${m}&year=${y}`).then((r) => r.json()),
    ])
      .then(([cost, food, byDay]) => {
        setCostData(cost.data || []); setCostMeta(cost.meta || null);
        setCostFoodTotal(food.meta?.total || 0);
        setCostByDay(byDay.data || []);
      })
      .finally(() => setCostLoading(false));
  }

  function fetchFeedbacks() {
    fetch(`/api/v1/meals/feedback?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json()).then((res) => { setFeedbacks(res.data || []); setFeedbackMeta(res.meta || null); });
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      setUserRole(res.data?.role || "");
      setMyEmployeeId(res.data?.employeeId || null);
    });
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
  }, []);

  useEffect(() => { fetchRegs(); fetchFeedbacks(); fetchSupplementary(); }, [dateFrom, dateTo]);

  const totalLunch  = registrations.reduce((s, r) => s + r.lunchCount, 0);
  const totalDinner = registrations.reduce((s, r) => s + r.dinnerCount, 0);
  const totalGuest  = registrations.reduce((s, r) => s + r.guestCount, 0);
  const totalSub    = registrations.reduce((s, r) => s + (r.subcontractorCount || 0), 0);

  // ── Tổng hợp gộp (đăng ký thường + bổ sung đã duyệt) cho khoảng ngày đang chọn ──
  // suppReqs đã được API filter theo from-to, chỉ cần lọc thêm status=APPROVED
  const approvedSuppInRange = suppReqs.filter((s) => s.status === "APPROVED");
  const suppLunch = approvedSuppInRange.filter((s) => s.personType === "EMPLOYEE" && s.mealType !== "DINNER").reduce((sum, s) => sum + s.quantity, 0);
  const suppDinner = approvedSuppInRange.filter((s) => s.personType === "EMPLOYEE" && s.mealType === "DINNER").reduce((sum, s) => sum + s.quantity, 0);
  const suppGuest = approvedSuppInRange.filter((s) => s.personType === "GUEST").reduce((sum, s) => sum + s.quantity, 0);
  const suppSub = approvedSuppInRange.filter((s) => s.personType === "SUBCONTRACTOR").reduce((sum, s) => sum + s.quantity, 0);

  const combinedLunch = totalLunch + suppLunch;
  const combinedDinner = totalDinner + suppDinner;
  const combinedGuest = totalGuest + suppGuest;
  const combinedSub = totalSub + suppSub;
  const combinedTotal = combinedLunch + combinedDinner + combinedGuest + combinedSub;
  const hasSupp = suppLunch > 0 || suppDinner > 0 || suppGuest > 0 || suppSub > 0;

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

      {/* Date range picker + tabs toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Từ:</label>
          <DateInput
            value={dateFrom}
            onChange={(e) => {
              const v = e.target.value;
              setDateFrom(v);
              if (v > dateTo) setDateTo(v); // auto đẩy "đến" theo nếu "từ" lớn hơn
            }}
            max={dateTo}
            className="rounded-lg px-3 py-1.5 text-[13px] border"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
          <label className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>đến:</label>
          <DateInput
            value={dateTo}
            onChange={(e) => {
              const v = e.target.value;
              setDateTo(v);
              if (v < dateFrom) setDateFrom(v);
            }}
            min={dateFrom}
            className="rounded-lg px-3 py-1.5 text-[13px] border"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}
          />
        </div>
        <button
          onClick={() => { const t = today(); setDateFrom(t); setDateTo(t); }}
          className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border"
          style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)" }}
        >
          Hôm nay
        </button>
        <button onClick={() => { fetchRegs(); fetchFeedbacks(); fetchSupplementary(); }} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
        {tab === "registrations" && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setShowSupplementary(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
              <Plus size={14} /> Đăng ký bổ sung
            </button>
            <button onClick={() => setShowRegister(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
              <Plus size={14} /> Đăng ký suất ăn
            </button>
          </div>
        )}
        {tab === "supplementary" && (
          <button onClick={() => setShowSupplementary(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Plus size={14} /> Đăng ký bổ sung
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
        {(["registrations", "supplementary", "feedback", "food", "cost"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === "supplementary") fetchSupplementary(); if (t === "cost") fetchCostReport(); if (t === "food") fetchFood(); }}
            className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "registrations" ? "Đăng ký suất ăn" : t === "supplementary" ? "Đăng ký bổ sung" : t === "feedback" ? "Khảo sát chất lượng" : t === "food" ? "Chi phí mua thực phẩm" : "Chi phí"}
          </button>
        ))}
      </div>

      {tab === "registrations" && <>
        {/* Tổng hợp số suất ăn cuối cùng — gộp đăng ký thường + bổ sung đã duyệt */}
        <CombinedMealSummary
          dateFrom={dateFrom} dateTo={dateTo}
          lunch={combinedLunch} dinner={combinedDinner} guest={combinedGuest} sub={combinedSub} total={combinedTotal}
          baseLunch={totalLunch} baseDinner={totalDinner} baseGuest={totalGuest} baseSub={totalSub}
          suppLunch={suppLunch} suppDinner={suppDinner} suppGuest={suppGuest} suppSub={suppSub}
          hasSupp={hasSupp}
        />

        {/* Registration table per department — gom theo phòng ban khi xem nhiều ngày */}
        {registrations.length > 0 ? (() => {
          // Gom: 1 phòng ban × nhiều ngày → cộng dồn counts
          type AggRow = {
            departmentId: string;
            departmentName: string;
            lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number;
            subcontractorNames: string[];
            notes: string[];
            singleDayId?: string; // chỉ có khi range = 1 ngày → cho phép xoá
          };
          const aggMap = new Map<string, AggRow>();
          for (const r of registrations) {
            let agg = aggMap.get(r.departmentId);
            if (!agg) {
              agg = { departmentId: r.departmentId, departmentName: r.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0, subcontractorCount: 0, subcontractorNames: [], notes: [] };
              aggMap.set(r.departmentId, agg);
            }
            agg.lunchCount += r.lunchCount;
            agg.dinnerCount += r.dinnerCount;
            agg.guestCount += r.guestCount;
            agg.subcontractorCount += r.subcontractorCount || 0;
            if (r.subcontractorName && !agg.subcontractorNames.includes(r.subcontractorName)) agg.subcontractorNames.push(r.subcontractorName);
            if (r.specialNote) agg.notes.push(r.specialNote);
            if (!isRange) agg.singleDayId = r.id;
          }
          const aggRows = Array.from(aggMap.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
          return (
          <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <div className="px-5 py-3 border-b text-[14px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
              Đăng ký suất ăn {isRange ? `từ ${dateFrom.split("-").reverse().join("/")} đến ${dateTo.split("-").reverse().join("/")}` : `ngày ${formatDate(selectedDate)}`}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>PHÒNG BAN</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRƯA</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỐI OT</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>KHÁCH</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>THẦU PHỤ</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỔNG</th>
                  {isHRAdmin && !isRange && <th className="px-5 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {aggRows.map((r) => (
                  <tr key={r.departmentId} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <td className="px-5 py-2.5 font-medium">{r.departmentName}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-accent)" }}>{r.lunchCount}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "#8b5cf6" }}>{r.dinnerCount}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-warning)" }}>{r.guestCount}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "#10b981" }}>{r.subcontractorCount}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{r.lunchCount + r.dinnerCount + r.guestCount + r.subcontractorCount}</td>
                    {isHRAdmin && !isRange && (
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
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "#10b981" }}>{totalSub}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{totalLunch + totalDinner + totalGuest + totalSub}</td>
                  {isHRAdmin && !isRange && <td />}
                </tr>
              </tbody>
            </table>
            </div>
            {aggRows.some((r) => r.subcontractorNames.length > 0) && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>THẦU PHỤ</div>
                {aggRows.filter((r) => r.subcontractorNames.length > 0).map((r) => (
                  <div key={r.departmentId} className="text-[12px] mb-1">
                    <span className="font-medium">{r.departmentName}:</span>{" "}
                    <span style={{ color: "#10b981" }}>{r.subcontractorNames.join(", ")}</span>
                    <span style={{ color: "var(--ibs-text-dim)" }}> ({r.subcontractorCount} suất)</span>
                  </div>
                ))}
              </div>
            )}
            {aggRows.some((r) => r.notes.length > 0) && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>GHI CHÚ ĐẶC BIỆT</div>
                {aggRows.filter((r) => r.notes.length > 0).map((r) => (
                  <div key={r.departmentId} className="text-[12px] mb-1">
                    <span className="font-medium">{r.departmentName}:</span>{" "}
                    <span style={{ color: "var(--ibs-text-dim)" }}>{r.notes.join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })() : (
          !loading && (
            <div className="rounded-xl border flex items-center justify-center py-16" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có đăng ký suất ăn cho {isRange ? "khoảng ngày này" : "ngày này"}</div>
            </div>
          )
        )}
      </>}

      {tab === "supplementary" && <>
        {/* Tổng hợp số suất ăn ngày đang chọn — gộp đăng ký thường + bổ sung đã duyệt */}
        <CombinedMealSummary
          dateFrom={dateFrom} dateTo={dateTo}
          lunch={combinedLunch} dinner={combinedDinner} guest={combinedGuest} sub={combinedSub} total={combinedTotal}
          baseLunch={totalLunch} baseDinner={totalDinner} baseGuest={totalGuest} baseSub={totalSub}
          suppLunch={suppLunch} suppDinner={suppDinner} suppGuest={suppGuest} suppSub={suppSub}
          hasSupp={hasSupp}
        />

        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-3 border-b text-[14px] font-semibold flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
            <span>Đăng ký suất ăn bổ sung — {isRange ? `${dateFrom.split("-").reverse().join("/")} → ${dateTo.split("-").reverse().join("/")}` : `Ngày ${dateFrom.split("-").reverse().join("/")}`}</span>
            <span className="text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
              {suppCanApprove ? "Tất cả phiếu (quyền duyệt TP HCNS)" : "Chỉ phiếu bạn tạo"}
            </span>
          </div>
          {suppLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : suppReqs.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có phiếu đăng ký bổ sung nào trong khoảng này</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--ibs-border)" }}>
              {suppReqs.map((s) => {
                const personLabel = s.personType === "GUEST" ? "Khách" : s.personType === "SUBCONTRACTOR" ? "Thầu phụ" : "CBNV";
                const mealLabel = s.mealType === "DINNER" ? "Tối OT" : "Trưa";
                const statusCfg = s.status === "APPROVED" ? { label: "Đã duyệt", color: "#10b981", bg: "rgba(16,185,129,0.1)" }
                  : s.status === "REJECTED" ? { label: "Từ chối", color: "var(--ibs-danger)", bg: "rgba(220,38,38,0.1)" }
                  : { label: "Chờ duyệt", color: "var(--ibs-warning)", bg: "rgba(234,179,8,0.1)" };
                return (
                  <div key={s.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold">
                          {s.department.name}
                          <span className="ml-2 text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
                            {mealLabel} · {personLabel} · {s.quantity} suất
                          </span>
                        </div>
                        <div className="text-[12px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                          {formatDate(s.date)} · Lý do: <span style={{ color: "var(--ibs-text)" }}>{s.reason}</span>
                          {s.subcontractorName && <> · Thầu phụ: <span style={{ color: "#10b981" }}>{s.subcontractorName}</span></>}
                          {s.personType === "GUEST" && s.guestUnitPrice > 0 && <> · Đơn giá: {s.guestUnitPrice.toLocaleString("vi-VN")}đ</>}
                          {s.specialNote && <> · {s.specialNote}</>}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
                          Người ĐK: {s.requester.employee?.fullName || s.requester.email}
                          {s.status === "REJECTED" && s.rejectedReason && <span style={{ color: "var(--ibs-danger)" }}> · Lý do từ chối: {s.rejectedReason}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ color: statusCfg.color, background: statusCfg.bg }}>{statusCfg.label}</span>
                        {suppCanApprove && s.status === "PENDING" && (
                          <>
                            <button onClick={() => approveSupp(s.id)} className="text-[12px] px-2.5 py-1 rounded-md font-semibold text-white" style={{ background: "#10b981" }}>Duyệt</button>
                            <button onClick={() => rejectSupp(s.id)} className="text-[12px] px-2.5 py-1 rounded-md font-semibold" style={{ background: "rgba(220,38,38,0.1)", color: "var(--ibs-danger)" }}>Từ chối</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
              <div className="ml-auto flex items-center gap-4 text-[13px]">
                {costMeta.feedback?.avgRating != null && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: "var(--ibs-text-dim)" }}>Đánh giá:</span>
                    <span className="font-bold" style={{ color: "#f59e0b" }}>
                      {"★".repeat(Math.round(costMeta.feedback.avgRating))}{"☆".repeat(5 - Math.round(costMeta.feedback.avgRating))}
                    </span>
                    <span style={{ color: "var(--ibs-text-dim)" }}>
                      {costMeta.feedback.avgRating}/5 ({costMeta.feedback.count} đánh giá)
                    </span>
                  </div>
                )}
                <div>
                  Tổng tháng {costMonth}/{costYear}:{" "}
                  <span className="font-bold" style={{ color: "var(--ibs-accent)" }}>{(costMeta.grandTotal).toLocaleString("vi-VN")}đ</span>
                </div>
              </div>
            )}
          </div>

          {/* So sánh: chi phí suất ăn (tính theo suất) vs chi phí mua thực phẩm (thực chi) */}
          {(() => {
            const mealCost = costMeta?.grandTotal ?? 0;
            const diff = mealCost - costFoodTotal;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ SUẤT ĂN (tính theo suất)</div>
                  <div className="text-[24px] font-bold" style={{ color: "var(--ibs-accent)" }}>{(mealCost).toLocaleString("vi-VN")}đ</div>
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ MUA THỰC PHẨM (thực chi)</div>
                  <div className="text-[24px] font-bold" style={{ color: "#f59e0b" }}>{(costFoodTotal).toLocaleString("vi-VN")}đ</div>
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>CHÊNH LỆCH (suất ăn − thực phẩm)</div>
                  <div className="text-[24px] font-bold" style={{ color: diff >= 0 ? "#10b981" : "var(--ibs-danger)" }}>{(diff >= 0 ? "+" : "") + diff.toLocaleString("vi-VN")}đ</div>
                </div>
              </div>
            );
          })()}

          {/* Sub-tab switcher: theo phòng ban / theo ngày */}
          <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
            {(["by-dept", "by-day"] as const).map((v) => (
              <button key={v} onClick={() => setCostView(v)}
                className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: costView === v ? "var(--ibs-accent)" : "transparent", color: costView === v ? "#fff" : "var(--ibs-text-dim)" }}>
                {v === "by-dept" ? "Theo phòng ban" : "Theo ngày"}
              </button>
            ))}
          </div>

          {costLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : costView === "by-day" ? (
            costByDay.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có dữ liệu cho tháng này</div>
            ) : (
              <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="px-5 py-3 border-b text-[14px] font-semibold" style={{ borderColor: "var(--ibs-border)" }}>
                  Chi phí suất ăn theo ngày — Tháng {costMonth}/{costYear}
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                      <th className="text-left px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>NGÀY</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRƯA</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỐI OT</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>KHÁCH</th>
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>THẦU PHỤ</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SỐ SUẤT</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ SUẤT ĂN</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ THỰC PHẨM</th>
                      <th className="text-right px-5 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CHÊNH LỆCH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costByDay.map((r) => {
                      const dt = new Date(r.date);
                      const dow = dt.getDay() === 0 ? "CN" : `T${dt.getDay() + 1}`;
                      return (
                        <tr key={r.date} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                          <td className="px-5 py-2.5 font-medium">
                            {r.date.split("-").reverse().join("/")} <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>({dow})</span>
                          </td>
                          <td className="px-3 py-2.5 text-right" style={{ color: "var(--ibs-accent)" }}>{r.lunchCount}</td>
                          <td className="px-3 py-2.5 text-right" style={{ color: "#8b5cf6" }}>{r.dinnerCount}</td>
                          <td className="px-3 py-2.5 text-right" style={{ color: "var(--ibs-warning)" }}>{r.guestCount}</td>
                          <td className="px-3 py-2.5 text-right" style={{ color: "#10b981" }}>{r.subcontractorCount}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{r.totalMeals.toLocaleString("vi-VN")}</td>
                          <td className="px-4 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-accent)" }}>{r.mealCost.toLocaleString("vi-VN")}đ</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: "#f59e0b" }}>{r.foodCost.toLocaleString("vi-VN")}đ</td>
                          <td className="px-5 py-2.5 text-right font-semibold" style={{ color: r.diff >= 0 ? "#10b981" : "var(--ibs-danger)" }}>
                            {(r.diff >= 0 ? "+" : "") + r.diff.toLocaleString("vi-VN")}đ
                          </td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const tLunch = costByDay.reduce((s, r) => s + r.lunchCount, 0);
                      const tDinner = costByDay.reduce((s, r) => s + r.dinnerCount, 0);
                      const tGuest = costByDay.reduce((s, r) => s + r.guestCount, 0);
                      const tSub = costByDay.reduce((s, r) => s + r.subcontractorCount, 0);
                      const tMeals = costByDay.reduce((s, r) => s + r.totalMeals, 0);
                      const tMealCost = costByDay.reduce((s, r) => s + r.mealCost, 0);
                      const tFoodCost = costByDay.reduce((s, r) => s + r.foodCost, 0);
                      const tDiff = tMealCost - tFoodCost;
                      return (
                        <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                          <td className="px-5 py-3 font-bold">Tổng cộng ({costByDay.length} ngày)</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{tLunch.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "#8b5cf6" }}>{tDinner.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-warning)" }}>{tGuest.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "#10b981" }}>{tSub.toLocaleString("vi-VN")}</td>
                          <td className="px-4 py-3 text-right font-bold">{tMeals.toLocaleString("vi-VN")}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{tMealCost.toLocaleString("vi-VN")}đ</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: "#f59e0b" }}>{tFoodCost.toLocaleString("vi-VN")}đ</td>
                          <td className="px-5 py-3 text-right font-bold" style={{ color: tDiff >= 0 ? "#10b981" : "var(--ibs-danger)" }}>
                            {(tDiff >= 0 ? "+" : "") + tDiff.toLocaleString("vi-VN")}đ
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                </div>
              </div>
            )
          ) : costData.length === 0 && costFoodTotal === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có dữ liệu</div>
          ) : costData.length === 0 ? (
            <div className="py-8 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có đăng ký suất ăn — chỉ có chi phí mua thực phẩm (xem tab "Chi phí mua thực phẩm").</div>
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
                      <th className="text-right px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>THẦU PHỤ</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SỐ SUẤT</th>
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
                        <td className="px-3 py-2.5 text-right" style={{ color: "#10b981" }}>{row.subcontractorCount || 0}</td>
                        <td className="px-4 py-2.5 text-right">{row.totalMeals.toLocaleString("vi-VN")}</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-accent)" }}>{row.totalCost.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    ))}
                    {costMeta && (costMeta.guestMeals ?? 0) > 0 && (
                      <tr className="border-b" style={{ borderColor: "var(--ibs-border)", background: "rgba(234,179,8,0.06)" }}>
                        <td className="px-5 py-2.5 font-medium" colSpan={5} style={{ color: "var(--ibs-warning)" }}>Khách / Đối tác (check-in)</td>
                        <td className="px-4 py-2.5 text-right">{costMeta.guestMeals!.toLocaleString("vi-VN")}</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-warning)" }}>{costMeta.guestMealCost!.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    )}
                    {costMeta && (() => {
                      const totalLunch = costData.reduce((s, r) => s + r.lunchCount, 0);
                      const totalDinner = costData.reduce((s, r) => s + r.dinnerCount, 0);
                      const totalGuest = costData.reduce((s, r) => s + r.guestCount, 0) + (costMeta.guestMeals ?? 0);
                      const totalSub = costData.reduce((s, r) => s + (r.subcontractorCount || 0), 0);
                      const totalMeals = costData.reduce((s, r) => s + r.totalMeals, 0) + (costMeta.guestMeals ?? 0);
                      return (
                        <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                          <td className="px-5 py-3 font-bold">Tổng cộng</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{totalLunch.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "#8b5cf6" }}>{totalDinner.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-warning)" }}>{totalGuest.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "#10b981" }}>{totalSub.toLocaleString("vi-VN")}</td>
                          <td className="px-4 py-3 text-right font-bold">{totalMeals.toLocaleString("vi-VN")}</td>
                          <td className="px-5 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{costMeta.grandTotal.toLocaleString("vi-VN")}đ</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                </div>
                <div className="px-5 py-2.5 border-t text-[11px]" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
                  Đơn giá: CBNV <b>20.000đ</b> · Thầu phụ <b>20.000đ</b> · Khách: theo đơn giá nhập khi đăng ký
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "food" && (
        <div>
          {/* Month navigator + add */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => { let m = foodMonth - 1; let y = foodYear; if (m < 1) { m = 12; y -= 1; } setFoodMonth(m); setFoodYear(y); fetchFood(m, y); }}
              className="px-3 py-1.5 rounded-lg border text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>← Tháng trước</button>
            <div className="text-[14px] font-semibold" style={{ color: "var(--ibs-text)" }}>Tháng {foodMonth}/{foodYear}</div>
            <button onClick={() => { let m = foodMonth + 1; let y = foodYear; if (m > 12) { m = 1; y += 1; } setFoodMonth(m); setFoodYear(y); fetchFood(m, y); }}
              className="px-3 py-1.5 rounded-lg border text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" }}>Tháng sau →</button>
            <button onClick={() => fetchFood()} className="p-2 rounded-lg" style={{ color: "var(--ibs-text-dim)" }}><RefreshCw size={15} /></button>
            {foodCanManage && (
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => { setFoodFormDate(selectedDate); setShowFoodForm(true); }} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
                  <Plus size={14} /> Thêm mua thực phẩm
                </button>
                <button onClick={() => { setFoodFormDate(new Date().toISOString().slice(0, 10)); setShowFoodForm(true); }} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Thêm danh sách thực phẩm hôm nay
                </button>
              </div>
            )}
          </div>

          {/* Tổng chi phí tháng */}
          <div className="rounded-xl border p-4 mb-4 flex items-center justify-between" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
            <span className="text-[12px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỔNG CHI PHÍ MUA THỰC PHẨM THÁNG {foodMonth}/{foodYear}</span>
            <span className="text-[24px] font-bold" style={{ color: "var(--ibs-accent)" }}>{fmtNum(foodTotal)}đ</span>
          </div>

          {foodLoading ? (
            <div className="rounded-xl border py-12 text-center text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : foodRows.length === 0 ? (
            <div className="rounded-xl border py-12 text-center text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu mua thực phẩm trong tháng này</div>
          ) : (() => {
            const groups: { date: string; rows: FoodPurchase[] }[] = [];
            for (const r of foodRows) {
              const key = r.date.slice(0, 10);
              let g = groups.find((x) => x.date === key);
              if (!g) { g = { date: key, rows: [] }; groups.push(g); }
              g.rows.push(r);
            }
            return (
              <div className="flex flex-col gap-4">
                {groups.map((g) => {
                  const dayTotal = g.rows.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
                  return (
                    <div key={g.date} className="rounded-xl border overflow-hidden" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                      <div className="px-5 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
                        <span className="text-[13px] font-semibold">{formatDate(g.date)} <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>· {vnDow(new Date(g.date))}</span></span>
                        {foodCanManage && <button onClick={() => deleteFoodDay(g.date)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa ngày</button>}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                          <thead>
                            <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                              <th className="text-left px-4 py-2 text-[11px] font-semibold w-12" style={{ color: "var(--ibs-text-dim)" }}>STT</th>
                              <th className="text-left px-4 py-2 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TÊN THỰC PHẨM</th>
                              <th className="text-left px-4 py-2 text-[11px] font-semibold w-20" style={{ color: "var(--ibs-text-dim)" }}>ĐVT</th>
                              <th className="text-right px-4 py-2 text-[11px] font-semibold w-24" style={{ color: "var(--ibs-text-dim)" }}>SỐ LƯỢNG</th>
                              <th className="text-right px-4 py-2 text-[11px] font-semibold w-28" style={{ color: "var(--ibs-text-dim)" }}>ĐƠN GIÁ</th>
                              <th className="text-right px-5 py-2 text-[11px] font-semibold w-32" style={{ color: "var(--ibs-text-dim)" }}>THÀNH TIỀN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.map((r, i) => (
                              <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                                <td className="px-4 py-2" style={{ color: "var(--ibs-text-dim)" }}>{i + 1}</td>
                                <td className="px-4 py-2 font-medium">{r.name}</td>
                                <td className="px-4 py-2" style={{ color: "var(--ibs-text-dim)" }}>{r.unit}</td>
                                <td className="px-4 py-2 text-right">{fmtNum(r.quantity)}</td>
                                <td className="px-4 py-2 text-right">{fmtNum(r.unitPrice)}</td>
                                <td className="px-5 py-2 text-right font-medium">{fmtNum(Math.round(r.quantity * r.unitPrice))}</td>
                              </tr>
                            ))}
                            <tr style={{ background: "rgba(234,179,8,0.08)" }}>
                              <td className="px-4 py-2.5 font-bold" colSpan={5}>Cộng</td>
                              <td className="px-5 py-2.5 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{fmtNum(dayTotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {showFoodForm && (
            <FoodPurchaseModal defaultDate={foodFormDate}
              onClose={() => setShowFoodForm(false)}
              onSuccess={(d) => { setShowFoodForm(false); const dt = new Date(d); setFoodMonth(dt.getMonth() + 1); setFoodYear(dt.getFullYear()); fetchFood(dt.getMonth() + 1, dt.getFullYear()); }} />
          )}
        </div>
      )}

      {showRegister && (
        <RegisterMealModal departments={departments} selectedDate={selectedDate}
          onClose={() => setShowRegister(false)} onSuccess={() => { setShowRegister(false); fetchRegs(); }} />
      )}
      {showSupplementary && (
        <RegisterMealModal departments={departments} selectedDate={selectedDate} supplementary
          onClose={() => setShowSupplementary(false)}
          onSuccess={() => { setShowSupplementary(false); setTab("supplementary"); fetchSupplementary(); }} />
      )}
      {showFeedback && myEmployeeId && (
        <FeedbackModal employeeId={myEmployeeId} selectedDate={selectedDate}
          onClose={() => setShowFeedback(false)} onSuccess={() => { setShowFeedback(false); fetchFeedbacks(); }} />
      )}
    </div>
  );
}

function RegisterMealModal({ departments, selectedDate, onClose, onSuccess, supplementary = false }: {
  departments: Department[]; selectedDate: string; onClose: () => void; onSuccess: () => void; supplementary?: boolean;
}) {
  const [form, setForm] = useState({
    departmentId: "",
    date: selectedDate,
    mealType: "LUNCH" as "LUNCH" | "DINNER",
    personType: "EMPLOYEE" as "EMPLOYEE" | "GUEST" | "SUBCONTRACTOR",
    quantity: "1",
    guestPrice: "",
    subcontractorName: "",
    reason: "",
    specialNote: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Hết giờ đăng ký: quá khứ, hoặc đúng hôm nay nhưng đã sau 9h sáng.
  // Đăng ký BỔ SUNG được phép 24/7 → không áp dụng chốt giờ.
  const MEAL_CUTOFF_HOUR = 9;
  function isAfterCutoff(dateStr: string): boolean {
    if (supplementary) return false;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (dateStr < today) return true;
    if (dateStr === today && now.getHours() >= MEAL_CUTOFF_HOUR) return true;
    return false;
  }
  const cutoffPassed = isAfterCutoff(form.date);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isAfterCutoff(form.date)) { setError(`Đã quá giờ đăng ký suất ăn (chốt trước ${MEAL_CUTOFF_HOUR}h sáng)`); return; }
    if (!form.departmentId) { setError("Vui lòng chọn phòng ban"); return; }
    const qty = parseInt(form.quantity) || 0;
    if (qty <= 0) { setError("Số lượng phải lớn hơn 0"); return; }
    const guestPrice = parseInt(form.guestPrice.replace(/\D/g, "")) || 0;
    if (form.personType === "GUEST" && guestPrice <= 0) { setError("Vui lòng nhập giá trị suất ăn cho khách"); return; }
    if (form.personType === "SUBCONTRACTOR" && !form.subcontractorName.trim()) { setError("Vui lòng nhập tên thầu phụ"); return; }
    if (supplementary && !form.reason.trim()) { setError("Vui lòng nhập lý do đăng ký bổ sung"); return; }
    setSaving(true);

    let res: Response;
    if (supplementary) {
      res = await fetch("/api/v1/meals/supplementary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: form.departmentId,
          date: form.date,
          mealType: form.mealType,
          personType: form.personType,
          quantity: qty,
          guestUnitPrice: form.personType === "GUEST" ? guestPrice : 0,
          subcontractorName: form.personType === "SUBCONTRACTOR" ? form.subcontractorName.trim() : null,
          reason: form.reason.trim(),
          specialNote: form.specialNote || null,
        }),
      });
    } else {
      const lunchCount  = form.mealType === "LUNCH"  && form.personType === "EMPLOYEE" ? qty : 0;
      const dinnerCount = form.mealType === "DINNER" && form.personType === "EMPLOYEE" ? qty : 0;
      const guestCount  = form.personType === "GUEST" ? qty : 0;
      const subcontractorCount = form.personType === "SUBCONTRACTOR" ? qty : 0;
      res = await fetch("/api/v1/meals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: form.departmentId,
          date: form.date,
          lunchCount, dinnerCount, guestCount, subcontractorCount,
          guestUnitPrice: form.personType === "GUEST" ? guestPrice : 0,
          subcontractorName: form.personType === "SUBCONTRACTOR" ? form.subcontractorName.trim() : null,
          specialNote: form.specialNote || null,
        }),
      });
    }
    setSaving(false);
    if (res.ok) { onSuccess(); } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">{supplementary ? "Đăng ký suất ăn bổ sung" : "Đăng ký suất ăn"}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Phòng ban *</label>
            <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={ic} style={is}>
              <option value="">Chọn phòng ban...</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lc} style={ls}>Ngày *</label>
            <DateInput required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={ic} style={is} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Bữa ăn *</label>
              <select value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value as "LUNCH" | "DINNER" })} className={ic} style={is}>
                <option value="LUNCH">Bữa trưa</option>
                <option value="DINNER">Bữa tối (OT)</option>
              </select>
            </div>
            <div>
              <label className={lc} style={ls}>Đối tượng *</label>
              <select value={form.personType} onChange={(e) => setForm({ ...form, personType: e.target.value as "EMPLOYEE" | "GUEST" | "SUBCONTRACTOR" })} className={ic} style={is}>
                <option value="EMPLOYEE">Cán bộ nhân viên</option>
                <option value="GUEST">Khách</option>
                <option value="SUBCONTRACTOR">Thầu phụ</option>
              </select>
            </div>
          </div>
          <div>
            <label className={lc} style={ls}>Số lượng suất ăn *</label>
            <input required type="number" min={1} max={500} value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={ic} style={is} />
          </div>
          {form.personType === "GUEST" && (
            <div>
              <label className={lc} style={ls}>Giá trị suất ăn (khách) *</label>
              <input required inputMode="numeric" placeholder="Ví dụ: 35.000" value={form.guestPrice}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setForm({ ...form, guestPrice: digits ? Number(digits).toLocaleString("vi-VN") : "" });
                }} className={ic} style={is} />
            </div>
          )}
          {form.personType === "SUBCONTRACTOR" && (
            <div>
              <label className={lc} style={ls}>Tên thầu phụ *</label>
              <input required type="text" value={form.subcontractorName}
                onChange={(e) => setForm({ ...form, subcontractorName: e.target.value })}
                placeholder="Ví dụ: Công ty TNHH ABC" className={ic} style={is} />
            </div>
          )}
          {supplementary && (
            <div>
              <label className={lc} style={ls}>Lý do đăng ký bổ sung *</label>
              <input required type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ví dụ: phát sinh tăng ca đột xuất..." className={ic} style={is} />
            </div>
          )}
          <div>
            <label className={lc} style={ls}>Ghi chú đặc biệt</label>
            <input type="text" value={form.specialNote} onChange={(e) => setForm({ ...form, specialNote: e.target.value })}
              placeholder="Ví dụ: suất chay, dị ứng..." className={ic} style={is} />
          </div>
          {supplementary && (
            <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
              ℹ️ Đăng ký bổ sung được phép 24/7. Phiếu sẽ chờ Trưởng phòng HCNS duyệt.
            </div>
          )}
          {cutoffPassed && (
            <div className="text-[12px] rounded-lg px-3 py-2" style={{ background: "rgba(220,38,38,0.1)", color: "var(--ibs-danger)" }}>
              ⏰ Đã quá giờ đăng ký suất ăn (chốt trước {MEAL_CUTOFF_HOUR}h sáng). Vui lòng chọn ngày khác.
            </div>
          )}
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving || cutoffPassed} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: (saving || cutoffPassed) ? 0.5 : 1, cursor: cutoffPassed ? "not-allowed" : "pointer" }}>
              {saving ? "Đang lưu..." : (supplementary ? "Gửi đăng ký" : "Đăng ký")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FoodPurchaseModal({ defaultDate, onClose, onSuccess }: {
  defaultDate: string; onClose: () => void; onSuccess: (date: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [rows, setRows] = useState<{ name: string; unit: string; qty: string; price: string }[]>([{ name: "", unit: "Kg", qty: "", price: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parseQty = (s: string) => parseFloat(s.replace(/\s/g, "").replace(",", ".")) || 0;
  const parsePrice = (s: string) => parseInt(s.replace(/\D/g, "")) || 0;

  function updateRow(i: number, k: "name" | "unit" | "qty" | "price", v: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [k]: k === "price" ? (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")).toLocaleString("vi-VN") : "") : v } : r));
  }
  function addRow() { setRows((prev) => [...prev, { name: "", unit: "Kg", qty: "", price: "" }]); }
  function removeRow(i: number) { setRows((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev); }

  const total = rows.reduce((s, r) => s + Math.round(parseQty(r.qty) * parsePrice(r.price)), 0);

  async function submit() {
    setError("");
    const items = rows
      .filter((r) => r.name.trim() && parseQty(r.qty) > 0)
      .map((r) => ({ name: r.name.trim(), unit: r.unit.trim() || "Kg", quantity: parseQty(r.qty), unitPrice: parsePrice(r.price) }));
    if (items.length === 0) { setError("Nhập ít nhất 1 thực phẩm có tên và số lượng > 0"); return; }
    setSaving(true);
    const res = await fetch("/api/v1/meals/food-purchases", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, items }),
    });
    setSaving(false);
    if (res.ok) { onSuccess(date); } else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const ic = "w-full rounded-lg px-2.5 py-1.5 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-bold">Thêm mua thực phẩm</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <div className="mb-3">
          <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày mua *</label>
          <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className={ic} style={is} />
        </div>

        <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: "var(--ibs-border)" }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: "var(--ibs-bg)" }}>
                <th className="text-left px-2 py-2 text-[11px] font-semibold w-8" style={{ color: "var(--ibs-text-dim)" }}>#</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>Tên thực phẩm</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold w-16" style={{ color: "var(--ibs-text-dim)" }}>ĐVT</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold w-20" style={{ color: "var(--ibs-text-dim)" }}>SL</th>
                <th className="text-left px-2 py-2 text-[11px] font-semibold w-28" style={{ color: "var(--ibs-text-dim)" }}>Đơn giá</th>
                <th className="text-right px-2 py-2 text-[11px] font-semibold w-28" style={{ color: "var(--ibs-text-dim)" }}>Thành tiền</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--ibs-border)" }}>
                  <td className="px-2 py-1.5" style={{ color: "var(--ibs-text-dim)" }}>{i + 1}</td>
                  <td className="px-2 py-1.5"><input value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} placeholder="Thịt lợn, rau..." className={ic} style={is} /></td>
                  <td className="px-2 py-1.5"><input value={r.unit} onChange={(e) => updateRow(i, "unit", e.target.value)} className={ic} style={is} /></td>
                  <td className="px-2 py-1.5"><input value={r.qty} onChange={(e) => updateRow(i, "qty", e.target.value)} inputMode="decimal" placeholder="0" className={ic} style={is} /></td>
                  <td className="px-2 py-1.5"><input value={r.price} onChange={(e) => updateRow(i, "price", e.target.value)} inputMode="numeric" placeholder="0" className={ic} style={is} /></td>
                  <td className="px-2 py-1.5 text-right font-medium">{fmtNum(Math.round(parseQty(r.qty) * parsePrice(r.price)))}</td>
                  <td className="px-1 py-1.5 text-center">
                    <button type="button" onClick={() => removeRow(i)} style={{ color: "var(--ibs-text-dim)" }}><X size={14} /></button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "rgba(234,179,8,0.08)" }}>
                <td className="px-2 py-2 font-bold" colSpan={5}>Cộng</td>
                <td className="px-2 py-2 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{fmtNum(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <button type="button" onClick={addRow} className="flex items-center gap-1 text-[12px] font-medium mb-3" style={{ color: "var(--ibs-accent)" }}>
          <Plus size={14} /> Thêm dòng
        </button>

        {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
          <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
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

// ── Panel tổng hợp gộp đăng ký thường + bổ sung đã duyệt ─────────────────────
function CombinedMealSummary(props: {
  dateFrom: string; dateTo: string;
  lunch: number; dinner: number; guest: number; sub: number; total: number;
  baseLunch: number; baseDinner: number; baseGuest: number; baseSub: number;
  suppLunch: number; suppDinner: number; suppGuest: number; suppSub: number;
  hasSupp: boolean;
}) {
  const { dateFrom, dateTo, lunch, dinner, guest, sub, total, baseLunch, baseDinner, baseGuest, baseSub, suppLunch, suppDinner, suppGuest, suppSub, hasSupp } = props;
  const isRange = dateFrom !== dateTo;
  const rangeLabel = isRange
    ? `Từ ${dateFrom.split("-").reverse().join("/")} đến ${dateTo.split("-").reverse().join("/")}`
    : `Ngày ${dateFrom.split("-").reverse().join("/")}`;
  const cell = (label: string, value: number, color: string, baseVal: number, suppVal: number) => (
    <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.6)", borderColor: "var(--ibs-border)" }}>
      <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>{label}</div>
      <div className="text-[28px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--ibs-text-dim)" }}>
        {hasSupp && suppVal > 0 ? <>= {baseVal} đăng ký + <span style={{ color: "var(--ibs-warning)", fontWeight: 600 }}>{suppVal} bổ sung</span></> : <>{baseVal} suất ăn</>}
      </div>
    </div>
  );
  return (
    <div className="mb-5 rounded-xl border-2 p-4" style={{ background: "rgba(0,180,216,0.05)", borderColor: "var(--ibs-accent)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[14px] font-bold" style={{ color: "var(--ibs-accent)" }}>
          📊 Tổng hợp số suất ăn cuối cùng — {rangeLabel}
        </div>
        <div className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
          Tổng: <span className="font-bold text-[16px]" style={{ color: "var(--ibs-accent)" }}>{total}</span> suất
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cell("Bữa trưa", lunch, "var(--ibs-accent)", baseLunch, suppLunch)}
        {cell("Bữa tối OT", dinner, "#8b5cf6", baseDinner, suppDinner)}
        {cell("Suất khách", guest, "var(--ibs-warning)", baseGuest, suppGuest)}
        {cell("Thầu phụ", sub, "#10b981", baseSub, suppSub)}
      </div>
      {!hasSupp && (
        <div className="text-[11px] mt-3" style={{ color: "var(--ibs-text-dim)" }}>
          Chưa có đăng ký bổ sung được duyệt cho ngày này. Số trên = đăng ký thường (trước 9h).
        </div>
      )}
    </div>
  );
}
