"use client";

import { useState, useEffect } from "react";
import { PageTitle } from "@/components/layout/page-title";
import { formatDate, apiError } from "@/lib/utils";
import { Plus, RefreshCw, X, Star, Download } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DateInput } from "@/components/shared/date-input";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { canManageFoodPurchase } from "@/lib/access";

type CostItem = { departmentId: string; departmentName: string; lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; totalMeals: number; totalCost: number };
type CostMeta = { grandTotal: number; unitPrice: number; month: number; year: number; guestMeals?: number; guestMealCost?: number; feedback?: { avgRating: number | null; count: number } };
type Department = { id: string; code: string; name: string };
type MealReg = {
  id: string; departmentId: string; date: string;
  lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; subcontractorName?: string | null; specialNote?: string | null;
  guestUnitPrice: number;
  guestByPrice?: Record<string, number> | null; // khách theo từng đơn giá
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
type Subcontractor = { id: string; name: string; companyName: string; phone?: string | null; note?: string | null; active: boolean };
type SubMeal = { id: string; subcontractorId: string; date: string; lunchCount: number; dinnerCount: number; specialNote?: string | null; subcontractor: { id: string; name: string; companyName: string } };

// Thứ trong tuần theo ngày dương lịch (0 = Chủ nhật).
function vnDow(d: Date): string {
  const day = d.getDay();
  return day === 0 ? "Chủ nhật" : `Thứ ${day + 1}`;
}
const fmtNum = (n: number) => n.toLocaleString("vi-VN");

const today = () => new Date().toISOString().slice(0, 10);

// Sentinel cho mục "Thầu phụ" trong dropdown Phòng ban (khớp backend meal.service).
const SUBCONTRACTOR_DEPT = "SUBCONTRACTOR";

// Xuất Excel: gọi API export (trả {title, columns, rows}) rồi dựng workbook tải về.
async function exportMealData(type: string, from: string, to: string, subId?: string) {
  const url = `/api/v1/meals/export?type=${type}&from=${from}&to=${to}${subId ? `&subcontractorId=${subId}` : ""}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(apiError(res.status, json?.error));
  const { title, columns, rows } = json.data as { title: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "IBS ONE Platform";
  wb.created = new Date();
  const ws = wb.addWorksheet("Dữ liệu");

  // ── Đăng ký suất ăn: gom theo NGÀY (header ngày + phòng ban bên dưới) + tổng hợp CBNV/Khách/Thầu phụ ──
  if (type === "registrations" || type === "registrations-emp") {
    const COLS = [
      { header: "Đối tượng", width: 30 }, { header: "Trưa", width: 10 },
      { header: "Tối OT", width: 10 }, { header: "Khách", width: 10 }, { header: "Tổng", width: 10 },
    ];
    ws.mergeCells(1, 1, 1, COLS.length);
    const tc = ws.getCell(1, 1); tc.value = title; tc.font = { bold: true, size: 14 };
    ws.addRow([]);
    const hr = ws.addRow(COLS.map((c) => c.header));
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; });

    const toSortKey = (d: string) => { const [dd, mm, yy] = d.split("/"); return `${yy}${mm}${dd}`; };
    const dates = Array.from(new Set(rows.map((r) => String(r.date)))).sort((a, b) => toSortKey(a).localeCompare(toSortKey(b)));
    let gEmp = 0, gGuest = 0, gSub = 0;
    const guestPriceTotals = new Map<number, number>(); // tổng khách theo từng đơn giá
    for (const date of dates) {
      const drows = rows.filter((r) => String(r.date) === date);
      const sr = ws.addRow([`Ngày ${date}`]);
      ws.mergeCells(sr.number, 1, sr.number, COLS.length);
      sr.font = { bold: true, size: 12 };
      sr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      let dL = 0, dD = 0, dG = 0, dT = 0;
      for (const r of drows) {
        const lunch = Number(r.lunch) || 0, dinner = Number(r.dinner) || 0, guest = Number(r.guest) || 0, total = Number(r.total) || 0;
        ws.addRow([String(r.target ?? ""), lunch, dinner, guest, total]);
        dL += lunch; dD += dinner; dG += guest; dT += total;
        if (String(r.target ?? "").startsWith("Thầu phụ")) gSub += lunch + dinner; else gEmp += lunch + dinner;
        gGuest += guest;
        if (guest > 0) {
          const gbp = r.guestByPrice as Record<string, number> | null | undefined;
          if (gbp && typeof gbp === "object" && Object.keys(gbp).length > 0) {
            for (const [pr, ct] of Object.entries(gbp)) guestPriceTotals.set(Number(pr), (guestPriceTotals.get(Number(pr)) || 0) + Number(ct));
          } else {
            const up = Number(r.guestUnitPrice) || 0;
            guestPriceTotals.set(up, (guestPriceTotals.get(up) || 0) + guest);
          }
        }
      }
      const subRow = ws.addRow([`Tổng ngày ${date}`, dL, dD, dG, dT]);
      subRow.font = { bold: true };
      subRow.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; });
    }
    ws.addRow([]);
    const fh = ws.addRow(["TỔNG HỢP TOÀN BỘ"]); fh.font = { bold: true, size: 12 };
    for (const [lbl, val] of [["CBNV (trưa + tối)", gEmp], ["Khách", gGuest], ["Thầu phụ", gSub]] as [string, number][]) {
      const r = ws.addRow([lbl, val]); r.getCell(1).font = { bold: true };
    }
    const tr = ws.addRow(["TỔNG CỘNG", gEmp + gGuest + gSub]); tr.font = { bold: true };
    // Chi tiết KHÁCH theo từng đơn giá (giống mục "CHI TIẾT KHÁCH" trên UI).
    if (guestPriceTotals.size > 0) {
      ws.addRow([]);
      const ch = ws.addRow(["CHI TIẾT KHÁCH (THEO ĐƠN GIÁ)"]); ch.font = { bold: true, size: 12 };
      for (const [price, count] of Array.from(guestPriceTotals.entries()).sort((a, b) => b[0] - a[0])) {
        const r = ws.addRow([`${count} khách × ${price.toLocaleString("vi-VN")}đ`, count, "", "", count * price]);
        r.getCell(1).font = { bold: true }; r.getCell(5).numFmt = "#,##0";
      }
    }
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${type}_${from}_${to}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
    return;
  }

  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14 };
  ws.addRow([]);
  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; });
  for (const r of rows) ws.addRow(columns.map((c) => (r[c.key] ?? "") as any));

  // Dòng TỔNG CỘNG — cộng các cột số có ý nghĩa (không cộng đơn giá/đơn vị).
  const SUM_KEYS: Record<string, string[]> = {
    registrations: ["lunch", "dinner", "guest", "total"],
    supplementary: ["quantity"],
    "food-purchases": ["quantity", "total"],
    "food-issues": ["quantity", "cost"],
    cost: ["lunch", "dinner", "guest", "sub", "totalMeals", "mealCost", "foodCost", "diff"],
    subcontractor: ["lunch", "dinner", "total", "cost"],
  };
  const sumKeys = SUM_KEYS[type] || [];
  if (sumKeys.length && rows.length) {
    const totals: Record<string, number> = {};
    for (const k of sumKeys) totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const totalRow = ws.addRow(columns.map((c, i) => (i === 0 ? "TỔNG CỘNG" : (c.key in totals ? totals[c.key] : "")) as any));
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }; });
  }

  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${type}_${from}_${to}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function NhaAnPage() {
  const [tab, setTab] = useState<"registrations" | "supplementary" | "feedback" | "cost" | "food" | "subcontractors">("registrations");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  // Backward-compat: selectedDate = dateFrom (dùng cho UI hiển thị "ngày X" khi chọn 1 ngày)
  const selectedDate = dateFrom;
  const isRange = dateFrom !== dateTo;
  const [registrations, setRegistrations] = useState<MealReg[]>([]);
  const [subMeals, setSubMeals] = useState<SubMeal[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [feedbacks, setFeedbacks] = useState<MealFeedback[]>([]);
  const [feedbackMeta, setFeedbackMeta] = useState<FeedbackMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [myEmployeeCode, setMyEmployeeCode] = useState("");
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
  const [costView, setCostView] = useState<"by-dept" | "by-day" | "actual">("by-dept");
  type DayCostRow = { date: string; lunchCount: number; dinnerCount: number; guestCount: number; subcontractorCount: number; totalMeals: number; mealCost: number; foodCost: number; diff: number };
  const [costByDay, setCostByDay] = useState<DayCostRow[]>([]);
  // Đối soát Kế hoạch (đăng ký) vs Thực tế (bếp phục vụ)
  type ActualRow = { date: string; planLunch: number; planDinner: number; planGuest: number; planSub: number; actLunch: number; actDinner: number; actGuest: number; actSub: number; hasActual: boolean; note: string | null };
  const [mealActual, setMealActual] = useState<ActualRow[]>([]);
  const [actualCanManage, setActualCanManage] = useState(false);
  const [editActualDate, setEditActualDate] = useState<ActualRow | null>(null);
  const [foodMonth, setFoodMonth] = useState(now.getMonth() + 1);
  const [foodYear, setFoodYear] = useState(now.getFullYear());
  const [foodRows, setFoodRows] = useState<FoodPurchase[]>([]);
  const [foodTotal, setFoodTotal] = useState(0);
  const [foodCanManage, setFoodCanManage] = useState(false);
  const [foodLoading, setFoodLoading] = useState(false);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [foodFormDate, setFoodFormDate] = useState(new Date().toISOString().slice(0, 10));
  // ── Tồn kho + thực xuất thực phẩm (FIFO) ──
  type InventoryItem = { name: string; unit: string; quantity: number; value: number };
  type FoodIssueRow = { id: string; date: string; name: string; unit: string; quantity: number; cost: number };
  const [foodInventory, setFoodInventory] = useState<InventoryItem[]>([]);
  const [foodIssueCostTotal, setFoodIssueCostTotal] = useState(0);
  const [foodIssues, setFoodIssues] = useState<FoodIssueRow[]>([]);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showPurchaseList, setShowPurchaseList] = useState(false);
  // ── Nhà thầu phụ (danh mục) ──
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subCanManage, setSubCanManage] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null);
  const [showExport, setShowExport] = useState(false);

  function fetchFood(month?: number, year?: number) {
    const m = month ?? foodMonth; const y = year ?? foodYear;
    setFoodLoading(true);
    Promise.all([
      fetch(`/api/v1/meals/food-purchases?month=${m}&year=${y}`).then((r) => r.json()),
      fetch(`/api/v1/meals/food-issues?month=${m}&year=${y}`).then((r) => r.json()),
    ])
      .then(([buy, issue]) => {
        setFoodRows(buy.data || []); setFoodTotal(buy.meta?.total || 0); setFoodCanManage(!!buy.meta?.canManage);
        setFoodInventory(buy.meta?.inventory || []);
        setFoodIssueCostTotal(issue.meta?.total || 0);
        setFoodIssues(issue.data || []);
      })
      .finally(() => setFoodLoading(false));
  }

  async function deleteFoodDay(date: string) {
    if (!(await confirmDialog({ message: "Xóa toàn bộ thực phẩm mua ngày này?", tone: "danger", confirmText: "Xóa" }))) return;
    await fetch(`/api/v1/meals/food-purchases?date=${date}`, { method: "DELETE" });
    fetchFood();
  }

  async function deleteFoodIssueDay(date: string) {
    if (!(await confirmDialog({ message: "Xóa toàn bộ thực xuất ngày này?", tone: "danger", confirmText: "Xóa" }))) return;
    await fetch(`/api/v1/meals/food-issues?date=${date}`, { method: "DELETE" });
    fetchFood();
  }

  function fetchSubcontractors() {
    setSubLoading(true);
    fetch(`/api/v1/subcontractors?includeInactive=1`)
      .then((r) => r.json())
      .then((res) => { setSubcontractors(res.data || []); setSubCanManage(!!res.meta?.canManage); })
      .finally(() => setSubLoading(false));
  }

  async function deleteSubcontractor(s: Subcontractor) {
    if (!(await confirmDialog({ message: `Xóa nhà thầu "${s.name}"?`, tone: "danger", confirmText: "Xóa" }))) return;
    const res = await fetch(`/api/v1/subcontractors/${s.id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); await alertDialog("Lỗi: " + apiError(res.status, d.error)); return; }
    fetchSubcontractors();
  }

  function fetchRegs() {
    setLoading(true);
    Promise.all([
      fetch(`/api/v1/meals?from=${dateFrom}&to=${dateTo}`).then((r) => r.json()),
      fetch(`/api/v1/subcontractors/meals?from=${dateFrom}&to=${dateTo}`).then((r) => r.json()),
    ])
      .then(([regs, subs]) => { setRegistrations(regs.data || []); setSubMeals(subs.data || []); })
      .finally(() => setLoading(false));
  }

  async function deleteSubMealDay() {
    if (!(await confirmDialog({ message: "Xóa toàn bộ đăng ký suất ăn thầu phụ ngày này?", tone: "danger", confirmText: "Xóa" }))) return;
    await fetch(`/api/v1/subcontractors/meals?date=${selectedDate}`, { method: "DELETE" });
    fetchRegs();
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
      fetch(`/api/v1/meals/actual?month=${m}&year=${y}`).then((r) => r.json()),
    ])
      .then(([cost, food, byDay, actual]) => {
        setCostData(cost.data || []); setCostMeta(cost.meta || null);
        // Chi phí thực phẩm để so sánh = giá vốn THỰC XUẤT (FIFO), không phải tiền mua.
        setCostFoodTotal(food.meta?.issueCostTotal || 0);
        setCostByDay(byDay.data || []);
        setMealActual(actual.data || []); setActualCanManage(!!actual.meta?.canManage);
      })
      .finally(() => setCostLoading(false));
  }

  function fetchFeedbacks() {
    fetch(`/api/v1/meals/feedback?from=${dateFrom}&to=${dateTo}`)
      .then((r) => r.json()).then((res) => { setFeedbacks(res.data || []); setFeedbackMeta(res.meta || null); });
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => {
      setUserRole(res.role || "");
      setMyEmployeeId(res.employeeId || null);
      setMyEmployeeCode(res.employeeCode || "");
    });
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepartments(res.data || []));
    fetchSubcontractors();
  }, []);

  useEffect(() => { fetchRegs(); fetchFeedbacks(); fetchSupplementary(); }, [dateFrom, dateTo]);

  const totalLunch  = registrations.reduce((s, r) => s + r.lunchCount, 0);
  const totalDinner = registrations.reduce((s, r) => s + r.dinnerCount, 0);
  const totalGuest  = registrations.reduce((s, r) => s + r.guestCount, 0);
  // Suất ăn thầu phụ — gom theo từng nhà thầu (bảng SubcontractorMeal riêng).
  const subMealLunch  = subMeals.reduce((s, m) => s + m.lunchCount, 0);
  const subMealDinner = subMeals.reduce((s, m) => s + m.dinnerCount, 0);
  const totalSub      = subMealLunch + subMealDinner;

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

  const isHRAdmin = userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "ADMIN";
  // NV được cấp riêng toàn quyền tab "Chi phí mua thực phẩm" (food) dù không phải HCNS.
  const isFoodManager = isHRAdmin || canManageFoodPurchase(myEmployeeCode);

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
        <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text)", background: "var(--ibs-bg-card)" }}>
          <Download size={14} /> Export Excel
        </button>
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
        {tab === "subcontractors" && subCanManage && (
          <button onClick={() => { setEditingSub(null); setShowSubForm(true); }} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold ml-auto" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
            <Plus size={14} /> Thêm nhà thầu
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        {(["registrations", "supplementary", "feedback", "food", "cost", "subcontractors"] as const)
          .filter((t) => t === "food" ? isFoodManager : (["cost", "subcontractors"].includes(t) ? isHRAdmin : true))
          .map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === "supplementary") fetchSupplementary(); if (t === "cost") fetchCostReport(); if (t === "food") fetchFood(); if (t === "subcontractors") fetchSubcontractors(); }}
            className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: tab === t ? "var(--ibs-accent)" : "transparent", color: tab === t ? "#fff" : "var(--ibs-text-dim)" }}>
            {t === "registrations" ? "Đăng ký suất ăn" : t === "supplementary" ? "Đăng ký bổ sung" : t === "feedback" ? "Khảo sát chất lượng" : t === "food" ? "Chi phí mua thực phẩm" : t === "cost" ? "Chi phí" : "Thầu phụ"}
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
        {(registrations.length > 0 || subMeals.length > 0) ? (() => {
          // Gom: 1 phòng ban × nhiều ngày → cộng dồn counts
          type AggRow = {
            departmentId: string;
            departmentName: string;
            lunchCount: number; dinnerCount: number; guestCount: number;
            notes: string[];
          };
          const aggMap = new Map<string, AggRow>();
          const guestPriceTotals = new Map<number, number>(); // tổng số khách theo từng đơn giá (cho mục CHI TIẾT KHÁCH)
          for (const r of registrations) {
            let agg = aggMap.get(r.departmentId);
            if (!agg) {
              agg = { departmentId: r.departmentId, departmentName: r.department.name, lunchCount: 0, dinnerCount: 0, guestCount: 0, notes: [] };
              aggMap.set(r.departmentId, agg);
            }
            agg.lunchCount += r.lunchCount;
            agg.dinnerCount += r.dinnerCount;
            agg.guestCount += r.guestCount;
            if (r.guestCount > 0) {
              const gbp = r.guestByPrice;
              if (gbp && typeof gbp === "object" && Object.keys(gbp).length > 0) {
                for (const [price, count] of Object.entries(gbp)) guestPriceTotals.set(Number(price), (guestPriceTotals.get(Number(price)) || 0) + Number(count));
              } else {
                guestPriceTotals.set(r.guestUnitPrice, (guestPriceTotals.get(r.guestUnitPrice) || 0) + r.guestCount);
              }
            }
            if (r.specialNote) agg.notes.push(r.specialNote);
          }
          const aggRows = Array.from(aggMap.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));

          // Gom suất ăn thầu phụ theo TỪNG nhà thầu (để diễn giải chi tiết bên dưới).
          const subAggMap = new Map<string, { id: string; name: string; companyName: string; lunch: number; dinner: number }>();
          for (const m of subMeals) {
            let a = subAggMap.get(m.subcontractorId);
            if (!a) { a = { id: m.subcontractorId, name: m.subcontractor.name, companyName: m.subcontractor.companyName, lunch: 0, dinner: 0 }; subAggMap.set(m.subcontractorId, a); }
            a.lunch += m.lunchCount;
            a.dinner += m.dinnerCount;
          }
          const subAggRows = Array.from(subAggMap.values()).sort((a, b) => a.name.localeCompare(b.name));
          const footLunch = totalLunch + subMealLunch;
          const footDinner = totalDinner + subMealDinner;
          const footTotal = footLunch + footDinner + totalGuest;
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
                    <td className="px-4 py-2.5 text-right font-semibold">{r.lunchCount + r.dinnerCount + r.guestCount}</td>
                    {isHRAdmin && !isRange && (
                      <td className="px-5 py-2.5 text-right">
                        <button onClick={() => handleDelete(r.departmentId)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa</button>
                      </td>
                    )}
                  </tr>
                ))}
                {totalSub > 0 && (
                  <tr className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                    <td className="px-5 py-2.5 font-medium" style={{ color: "#10b981" }}>Thầu phụ</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-accent)" }}>{subMealLunch}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "#8b5cf6" }}>{subMealDinner}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "var(--ibs-warning)" }}>0</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{totalSub}</td>
                    {isHRAdmin && !isRange && (
                      <td className="px-5 py-2.5 text-right">
                        <button onClick={deleteSubMealDay} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa</button>
                      </td>
                    )}
                  </tr>
                )}
                <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                  <td className="px-5 py-2.5 font-bold text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>TỔNG CỘNG</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{footLunch}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "#8b5cf6" }}>{footDinner}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ color: "var(--ibs-warning)" }}>{totalGuest}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{footTotal}</td>
                  {isHRAdmin && !isRange && <td />}
                </tr>
              </tbody>
            </table>
            </div>
            {guestPriceTotals.size > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>CHI TIẾT KHÁCH (THEO ĐƠN GIÁ)</div>
                {Array.from(guestPriceTotals.entries()).sort((a, b) => b[0] - a[0]).map(([p, c]) => (
                  <div key={p} className="text-[12px] mb-1 flex items-center justify-between gap-3">
                    <span className="font-medium" style={{ color: "var(--ibs-warning)" }}>{c} khách × {p.toLocaleString("vi-VN")}đ/suất</span>
                    <span className="font-semibold whitespace-nowrap">{(c * p).toLocaleString("vi-VN")}đ</span>
                  </div>
                ))}
              </div>
            )}
            {subAggRows.length > 0 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--ibs-text-dim)" }}>CHI TIẾT THẦU PHỤ</div>
                {subAggRows.map((s) => {
                  const t = s.lunch + s.dinner;
                  return (
                    <div key={s.id} className="text-[12px] mb-1 flex items-center justify-between gap-3">
                      <span>
                        <span className="font-medium" style={{ color: "#10b981" }}>{s.name}</span>
                        <span style={{ color: "var(--ibs-text-dim)" }}> · {s.companyName}</span>
                      </span>
                      <span style={{ color: "var(--ibs-text-dim)" }} className="whitespace-nowrap">
                        {s.dinner > 0 ? <>trưa {s.lunch} · tối OT {s.dinner} · </> : null}<span className="font-semibold" style={{ color: "var(--ibs-text)" }}>{t} suất</span>
                      </span>
                    </div>
                  );
                })}
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
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ THỰC PHẨM (thực xuất – FIFO)</div>
                  <div className="text-[24px] font-bold" style={{ color: "#f59e0b" }}>{(costFoodTotal).toLocaleString("vi-VN")}đ</div>
                </div>
                <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>CHÊNH LỆCH (suất ăn − thực phẩm)</div>
                  <div className="text-[24px] font-bold" style={{ color: diff >= 0 ? "#10b981" : "var(--ibs-danger)" }}>{(diff >= 0 ? "+" : "") + diff.toLocaleString("vi-VN")}đ</div>
                </div>
              </div>
            );
          })()}

          {/* Sub-tab switcher: theo phòng ban / theo ngày / kế hoạch vs thực tế */}
          <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
            {(["by-dept", "by-day", "actual"] as const).map((v) => (
              <button key={v} onClick={() => setCostView(v)}
                className="text-[13px] px-4 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: costView === v ? "var(--ibs-accent)" : "transparent", color: costView === v ? "#fff" : "var(--ibs-text-dim)" }}>
                {v === "by-dept" ? "Theo phòng ban" : v === "by-day" ? "Theo ngày" : "Kế hoạch vs Thực tế"}
              </button>
            ))}
          </div>

          {costLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : costView === "actual" ? (
            mealActual.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Không có dữ liệu suất ăn cho tháng này</div>
            ) : (
              <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="px-5 py-3 border-b text-[14px] font-semibold flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
                  <span>Đối soát Kế hoạch (đăng ký) vs Thực tế — Tháng {costMonth}/{costYear}</span>
                  <span className="text-[11px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>Mỗi ô: <b>kế hoạch / thực tế</b>{actualCanManage ? "" : " · (chỉ HCNS nhập thực tế)"}</span>
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
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TỔNG</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CHÊNH LỆCH</th>
                      {actualCanManage && <th className="px-5 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const cell = (plan: number, act: number, has: boolean) => (
                        <span><span style={{ color: "var(--ibs-text-dim)" }}>{plan}</span> / <span className="font-semibold" style={{ color: has ? "var(--ibs-text)" : "var(--ibs-text-dim)" }}>{has ? act : "—"}</span></span>
                      );
                      return mealActual.map((r) => {
                        const dt = new Date(r.date);
                        const dow = dt.getDay() === 0 ? "CN" : `T${dt.getDay() + 1}`;
                        const planTotal = r.planLunch + r.planDinner + r.planGuest + r.planSub;
                        const actTotal = r.actLunch + r.actDinner + r.actGuest + r.actSub;
                        const diff = r.hasActual ? actTotal - planTotal : null;
                        return (
                          <tr key={r.date} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                            <td className="px-5 py-2.5 font-medium">{r.date.split("-").reverse().join("/")} <span className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>({dow})</span></td>
                            <td className="px-3 py-2.5 text-right">{cell(r.planLunch, r.actLunch, r.hasActual)}</td>
                            <td className="px-3 py-2.5 text-right">{cell(r.planDinner, r.actDinner, r.hasActual)}</td>
                            <td className="px-3 py-2.5 text-right">{cell(r.planGuest, r.actGuest, r.hasActual)}</td>
                            <td className="px-3 py-2.5 text-right">{cell(r.planSub, r.actSub, r.hasActual)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold">{cell(planTotal, actTotal, r.hasActual)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold" style={{ color: diff === null ? "var(--ibs-text-dim)" : diff === 0 ? "var(--ibs-text-dim)" : diff > 0 ? "#10b981" : "var(--ibs-danger)" }}>
                              {diff === null ? "—" : (diff > 0 ? "+" : "") + diff}
                            </td>
                            {actualCanManage && (
                              <td className="px-5 py-2.5 text-right">
                                <button onClick={() => setEditActualDate(r)} className="text-[12px]" style={{ color: "var(--ibs-accent)" }}>{r.hasActual ? "Sửa" : "Nhập"}</button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                </div>
                <div className="px-5 py-2.5 border-t text-[11px]" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
                  Chênh lệch = Thực tế − Kế hoạch. Âm (đỏ) = nấu dư so với thực ăn; Dương (xanh) = thực ăn nhiều hơn đăng ký.
                </div>
              </div>
            )
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
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SỐ SUẤT</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>CHI PHÍ SUẤT ĂN</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TP THỰC XUẤT</th>
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
                        <td className="px-4 py-2.5 text-right">{row.totalMeals.toLocaleString("vi-VN")}</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-accent)" }}>{row.totalCost.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    ))}
                    {costMeta && (costMeta.guestMeals ?? 0) > 0 && (
                      <tr className="border-b" style={{ borderColor: "var(--ibs-border)", background: "rgba(234,179,8,0.06)" }}>
                        <td className="px-5 py-2.5 font-medium" colSpan={4} style={{ color: "var(--ibs-warning)" }}>Khách / Đối tác (check-in)</td>
                        <td className="px-4 py-2.5 text-right">{costMeta.guestMeals!.toLocaleString("vi-VN")}</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: "var(--ibs-warning)" }}>{costMeta.guestMealCost!.toLocaleString("vi-VN")}đ</td>
                      </tr>
                    )}
                    {costMeta && (() => {
                      const totalLunch = costData.reduce((s, r) => s + r.lunchCount, 0);
                      const totalDinner = costData.reduce((s, r) => s + r.dinnerCount, 0);
                      const totalGuest = costData.reduce((s, r) => s + r.guestCount, 0) + (costMeta.guestMeals ?? 0);
                      const totalMeals = costData.reduce((s, r) => s + r.totalMeals, 0) + (costMeta.guestMeals ?? 0);
                      return (
                        <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                          <td className="px-5 py-3 font-bold">Tổng cộng</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-accent)" }}>{totalLunch.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "#8b5cf6" }}>{totalDinner.toLocaleString("vi-VN")}</td>
                          <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--ibs-warning)" }}>{totalGuest.toLocaleString("vi-VN")}</td>
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
                <button onClick={() => setShowIssueForm(true)} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold border" style={{ borderColor: "var(--ibs-accent)", color: "var(--ibs-accent)", background: "transparent" }}>
                  <Plus size={14} /> Thực xuất thực phẩm
                </button>
                <button onClick={() => { setFoodFormDate(new Date().toISOString().slice(0, 10)); setShowFoodForm(true); }} className="flex items-center gap-1.5 text-[13px] px-3 py-2 rounded-lg font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff" }}>
                  <Plus size={14} /> Thêm danh sách thực phẩm hôm nay
                </button>
              </div>
            )}
          </div>

          {/* 3 thẻ: tiền MUA · giá vốn THỰC XUẤT (FIFO) · giá trị TỒN KHO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>TIỀN MUA THÁNG {foodMonth}/{foodYear}</div>
              <div className="text-[22px] font-bold" style={{ color: "var(--ibs-accent)" }}>{fmtNum(foodTotal)}đ</div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>THỰC XUẤT (FIFO) THÁNG {foodMonth}/{foodYear}</div>
              <div className="text-[22px] font-bold" style={{ color: "#f59e0b" }}>{fmtNum(foodIssueCostTotal)}đ</div>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ibs-text-dim)" }}>GIÁ TRỊ TỒN KHO HIỆN TẠI</div>
              <div className="text-[22px] font-bold" style={{ color: "#10b981" }}>{fmtNum(foodInventory.reduce((s, r) => s + r.value, 0))}đ</div>
            </div>
          </div>

          {foodLoading ? (
            <div className="rounded-xl border py-12 text-center text-[13px]" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* 1) Danh sách mua theo ngày — thu gọn dạng dropdown */}
              {(() => {
                const groups: { date: string; rows: FoodPurchase[] }[] = [];
                for (const r of foodRows) {
                  const key = r.date.slice(0, 10);
                  let g = groups.find((x) => x.date === key);
                  if (!g) { g = { date: key, rows: [] }; groups.push(g); }
                  g.rows.push(r);
                }
                return (
                  <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    <button onClick={() => setShowPurchaseList((v) => !v)} className="w-full px-5 py-3 flex items-center justify-between text-[14px] font-semibold">
                      <span>Danh sách mua theo ngày <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>· {groups.length} ngày · {foodRows.length} mục</span></span>
                      <span className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{showPurchaseList ? "▲ Thu gọn" : "▼ Mở rộng"}</span>
                    </button>
                    {showPurchaseList && (
                      foodRows.length === 0 ? (
                        <div className="px-5 pb-4 text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có dữ liệu mua thực phẩm trong tháng này</div>
                      ) : (
                        <div className="px-4 pb-4 flex flex-col gap-4">
                          {groups.map((g) => {
                            const dayTotal = g.rows.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
                            return (
                              <div key={g.date} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--ibs-border)" }}>
                                <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
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
                      )
                    )}
                  </div>
                );
              })()}

              {/* 2) Tồn kho hiện tại (FIFO) */}
              <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                <div className="px-5 py-3 border-b text-[14px] font-semibold flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
                  <span>📦 Tồn kho thực phẩm hiện tại</span>
                  <span className="text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>Theo FIFO · còn {foodInventory.length} món</span>
                </div>
                {foodInventory.length === 0 ? (
                  <div className="py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Kho trống — chưa nhập hoặc đã xuất hết</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                          <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TÊN THỰC PHẨM</th>
                          <th className="text-left px-4 py-2.5 text-[11px] font-semibold w-20" style={{ color: "var(--ibs-text-dim)" }}>ĐVT</th>
                          <th className="text-right px-4 py-2.5 text-[11px] font-semibold w-28" style={{ color: "var(--ibs-text-dim)" }}>TỒN</th>
                          <th className="text-right px-5 py-2.5 text-[11px] font-semibold w-36" style={{ color: "var(--ibs-text-dim)" }}>GIÁ TRỊ TỒN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {foodInventory.map((r) => (
                          <tr key={r.name + r.unit} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                            <td className="px-5 py-2.5 font-medium">{r.name}</td>
                            <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{r.unit}</td>
                            <td className="px-4 py-2.5 text-right font-semibold" style={{ color: "#10b981" }}>{fmtNum(r.quantity)}</td>
                            <td className="px-5 py-2.5 text-right">{fmtNum(r.value)}đ</td>
                          </tr>
                        ))}
                        <tr style={{ background: "rgba(16,185,129,0.06)" }}>
                          <td className="px-5 py-2.5 font-bold" colSpan={3}>Tổng giá trị tồn</td>
                          <td className="px-5 py-2.5 text-right font-bold" style={{ color: "#10b981" }}>{fmtNum(foodInventory.reduce((s, r) => s + r.value, 0))}đ</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3) Thực xuất theo ngày */}
              {(() => {
                const groups: { date: string; rows: FoodIssueRow[] }[] = [];
                for (const r of foodIssues) {
                  const key = r.date.slice(0, 10);
                  let g = groups.find((x) => x.date === key);
                  if (!g) { g = { date: key, rows: [] }; groups.push(g); }
                  g.rows.push(r);
                }
                return (
                  <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
                    <div className="px-5 py-3 border-b text-[14px] font-semibold flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
                      <span>🍳 Thực xuất thực phẩm theo ngày</span>
                      <span className="text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>Giá vốn FIFO · {fmtNum(foodIssueCostTotal)}đ</span>
                    </div>
                    {foodIssues.length === 0 ? (
                      <div className="py-10 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có thực xuất trong tháng này</div>
                    ) : (
                      <div className="px-4 py-4 flex flex-col gap-4">
                        {groups.map((g) => {
                          const dayCost = g.rows.reduce((s, r) => s + r.cost, 0);
                          return (
                            <div key={g.date} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--ibs-border)" }}>
                              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
                                <span className="text-[13px] font-semibold">{formatDate(g.date)} <span className="font-normal" style={{ color: "var(--ibs-text-dim)" }}>· {vnDow(new Date(g.date))}</span></span>
                                {foodCanManage && <button onClick={() => deleteFoodIssueDay(g.date)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa ngày</button>}
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                  <thead>
                                    <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                                      <th className="text-left px-4 py-2 text-[11px] font-semibold w-12" style={{ color: "var(--ibs-text-dim)" }}>STT</th>
                                      <th className="text-left px-4 py-2 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TÊN THỰC PHẨM</th>
                                      <th className="text-left px-4 py-2 text-[11px] font-semibold w-20" style={{ color: "var(--ibs-text-dim)" }}>ĐVT</th>
                                      <th className="text-right px-4 py-2 text-[11px] font-semibold w-24" style={{ color: "var(--ibs-text-dim)" }}>THỰC XUẤT</th>
                                      <th className="text-right px-5 py-2 text-[11px] font-semibold w-32" style={{ color: "var(--ibs-text-dim)" }}>GIÁ VỐN (FIFO)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.rows.map((r, i) => (
                                      <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)" }}>
                                        <td className="px-4 py-2" style={{ color: "var(--ibs-text-dim)" }}>{i + 1}</td>
                                        <td className="px-4 py-2 font-medium">{r.name}</td>
                                        <td className="px-4 py-2" style={{ color: "var(--ibs-text-dim)" }}>{r.unit}</td>
                                        <td className="px-4 py-2 text-right" style={{ color: "#f59e0b" }}>{fmtNum(r.quantity)}</td>
                                        <td className="px-5 py-2 text-right font-medium">{fmtNum(r.cost)}đ</td>
                                      </tr>
                                    ))}
                                    <tr style={{ background: "rgba(245,158,11,0.08)" }}>
                                      <td className="px-4 py-2.5 font-bold" colSpan={4}>Cộng giá vốn</td>
                                      <td className="px-5 py-2.5 text-right font-bold" style={{ color: "#f59e0b" }}>{fmtNum(dayCost)}đ</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {showFoodForm && (
            <FoodPurchaseModal defaultDate={foodFormDate}
              onClose={() => setShowFoodForm(false)}
              onSuccess={(d) => { setShowFoodForm(false); const dt = new Date(d); setFoodMonth(dt.getMonth() + 1); setFoodYear(dt.getFullYear()); fetchFood(dt.getMonth() + 1, dt.getFullYear()); }} />
          )}
          {showIssueForm && (
            <FoodIssueModal inventory={foodInventory} defaultDate={new Date().toISOString().slice(0, 10)}
              onClose={() => setShowIssueForm(false)}
              onSuccess={(d) => { setShowIssueForm(false); const dt = new Date(d); setFoodMonth(dt.getMonth() + 1); setFoodYear(dt.getFullYear()); fetchFood(dt.getMonth() + 1, dt.getFullYear()); }} />
          )}
        </div>
      )}

      {tab === "subcontractors" && (
        <div className="rounded-xl border" style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>
          <div className="px-5 py-3 border-b text-[14px] font-semibold flex items-center justify-between" style={{ borderColor: "var(--ibs-border)" }}>
            <span>Danh sách nhà thầu phụ</span>
            <span className="text-[12px] font-normal" style={{ color: "var(--ibs-text-dim)" }}>
              {subcontractors.filter((s) => s.active).length} đang hợp tác
              {subcontractors.some((s) => !s.active) && ` · ${subcontractors.filter((s) => !s.active).length} ngừng`}
            </span>
          </div>
          {subLoading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Đang tải...</div>
          ) : subcontractors.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>Chưa có nhà thầu phụ nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--ibs-border)" }}>
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>NHÀ THẦU</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TÊN CÔNG TY</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>SĐT</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>GHI CHÚ</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold" style={{ color: "var(--ibs-text-dim)" }}>TRẠNG THÁI</th>
                    {subCanManage && <th className="px-5 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {subcontractors.map((s) => (
                    <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--ibs-border)", opacity: s.active ? 1 : 0.55 }}>
                      <td className="px-5 py-2.5 font-medium">{s.name}</td>
                      <td className="px-4 py-2.5">{s.companyName}</td>
                      <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{s.phone || "—"}</td>
                      <td className="px-4 py-2.5" style={{ color: "var(--ibs-text-dim)" }}>{s.note || "—"}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={s.active ? { color: "#10b981", background: "rgba(16,185,129,0.1)" } : { color: "var(--ibs-text-dim)", background: "var(--ibs-border)" }}>
                          {s.active ? "Đang hợp tác" : "Ngừng"}
                        </span>
                      </td>
                      {subCanManage && (
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => { setEditingSub(s); setShowSubForm(true); }} className="text-[12px] mr-3" style={{ color: "var(--ibs-accent)" }}>Sửa</button>
                          <button onClick={() => deleteSubcontractor(s)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>Xóa</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showSubForm && (
        <SubcontractorModal subcontractor={editingSub}
          onClose={() => { setShowSubForm(false); setEditingSub(null); }}
          onSuccess={() => { setShowSubForm(false); setEditingSub(null); fetchSubcontractors(); }} />
      )}
      {editActualDate && (
        <MealActualModal row={editActualDate}
          onClose={() => setEditActualDate(null)}
          onSuccess={() => { setEditActualDate(null); fetchCostReport(); }} />
      )}
      {showExport && (
        <ExportModal subcontractors={subcontractors} defaultFrom={dateFrom} defaultTo={dateTo} canExportHcns={isHRAdmin} onClose={() => setShowExport(false)} />
      )}

      {showRegister && (
        <RegisterMealModal departments={departments} subcontractors={subcontractors} selectedDate={selectedDate} canManageMeals={isHRAdmin}
          onClose={() => setShowRegister(false)} onSuccess={() => { setShowRegister(false); fetchRegs(); }} />
      )}
      {showSupplementary && (
        <RegisterMealModal departments={departments} subcontractors={subcontractors} selectedDate={selectedDate} supplementary canManageMeals={isHRAdmin}
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

function SubcontractorModal({ subcontractor, onClose, onSuccess }: {
  subcontractor: Subcontractor | null; onClose: () => void; onSuccess: () => void;
}) {
  const isEdit = !!subcontractor;
  const [form, setForm] = useState({
    name: subcontractor?.name || "",
    companyName: subcontractor?.companyName || "",
    phone: subcontractor?.phone || "",
    note: subcontractor?.note || "",
    active: subcontractor?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) { setError("Vui lòng nhập tên nhà thầu"); return; }
    if (!form.companyName.trim()) { setError("Vui lòng nhập tên công ty"); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      companyName: form.companyName.trim(),
      phone: form.phone.trim() || null,
      note: form.note.trim() || null,
      active: form.active,
    };
    const res = await fetch(isEdit ? `/api/v1/subcontractors/${subcontractor!.id}` : "/api/v1/subcontractors", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
          <div className="text-[16px] font-bold">{isEdit ? "Sửa nhà thầu phụ" : "Thêm nhà thầu phụ"}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Tên nhà thầu *</label>
            <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ví dụ: Nhà thầu Tùng" className={ic} style={is} />
          </div>
          <div>
            <label className={lc} style={ls}>Tên công ty *</label>
            <input required type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="Ví dụ: Công ty TNHH ABC" className={ic} style={is} />
          </div>
          <div>
            <label className={lc} style={ls}>Số điện thoại</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(không bắt buộc)" className={ic} style={is} />
          </div>
          <div>
            <label className={lc} style={ls}>Ghi chú</label>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="(không bắt buộc)" className={ic} style={is} />
          </div>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Đang hợp tác (bỏ chọn nếu nhà thầu đã ngừng)</span>
          </label>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Đang lưu..." : (isEdit ? "Lưu" : "Thêm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExportModal({ subcontractors, defaultFrom, defaultTo, canExportHcns, onClose }: {
  subcontractors: Subcontractor[]; defaultFrom: string; defaultTo: string; canExportHcns: boolean; onClose: () => void;
}) {
  // Các loại liên quan chi phí/thực phẩm/thầu phụ chỉ HCNS được export (khớp quyền tab).
  const TYPES = [
    { value: "registrations", label: "Đăng ký suất ăn (NV + thầu phụ)", hcns: false },
    { value: "registrations-emp", label: "Suất ăn nhân viên (KHÔNG thầu phụ)", hcns: false },
    { value: "supplementary", label: "Đăng ký bổ sung", hcns: false },
    { value: "food-purchases", label: "Lịch sử mua thực phẩm", hcns: true },
    { value: "food-issues", label: "Lịch sử xuất thực kho", hcns: true },
    { value: "cost", label: "Chi phí ăn", hcns: true },
    { value: "subcontractor", label: "Thầu phụ (số suất + chi phí)", hcns: true },
  ].filter((t) => canExportHcns || !t.hcns);
  const [type, setType] = useState("registrations");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [subId, setSubId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSub = type === "subcontractor";

  async function doExport() {
    setError("");
    if (from > to) { setError("Từ ngày phải ≤ Đến ngày"); return; }
    setBusy(true);
    try {
      await exportMealData(type, from, to, isSub && subId ? subId : undefined);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Có lỗi khi export");
    } finally {
      setBusy(false);
    }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Export Excel</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={lc} style={ls}>Nội dung export *</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={ic} style={is}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {isSub && (
            <div>
              <label className={lc} style={ls}>Nhà thầu</label>
              <select value={subId} onChange={(e) => setSubId(e.target.value)} className={ic} style={is}>
                <option value="">Tất cả nhà thầu</option>
                {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.companyName}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lc} style={ls}>Từ ngày *</label>
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} max={to} className={ic} style={is} />
            </div>
            <div>
              <label className={lc} style={ls}>Đến ngày *</label>
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} min={from} className={ic} style={is} />
            </div>
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="button" onClick={doExport} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              <Download size={14} /> {busy ? "Đang xuất..." : "Tải Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MealActualModal({ row, onClose, onSuccess }: {
  row: { date: string; planLunch: number; planDinner: number; planGuest: number; planSub: number; actLunch: number; actDinner: number; actGuest: number; actSub: number; hasActual: boolean; note: string | null };
  onClose: () => void; onSuccess: () => void;
}) {
  // Mặc định: đã có thực tế → dùng số thực tế; chưa có → gợi ý bằng số kế hoạch (đăng ký).
  const init = (act: number, plan: number) => String(row.hasActual ? act : plan);
  const [form, setForm] = useState({
    lunch: init(row.actLunch, row.planLunch),
    dinner: init(row.actDinner, row.planDinner),
    guest: init(row.actGuest, row.planGuest),
    sub: init(row.actSub, row.planSub),
    note: row.note || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/meals/actual", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: row.date,
        lunchActual: parseInt(form.lunch) || 0,
        dinnerActual: parseInt(form.dinner) || 0,
        guestActual: parseInt(form.guest) || 0,
        subActual: parseInt(form.sub) || 0,
        note: form.note.trim() || null,
      }),
    });
    setSaving(false);
    if (res.ok) onSuccess(); else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };
  const lc = "text-[12px] font-medium mb-1 block";
  const ls = { color: "var(--ibs-text-dim)" };
  const field = (label: string, key: "lunch" | "dinner" | "guest" | "sub", plan: number) => (
    <div>
      <label className={lc} style={ls}>{label} <span style={{ color: "var(--ibs-text-dim)" }}>(KH: {plan})</span></label>
      <input type="number" min={0} max={2000} value={(form as any)[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={ic} style={is} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-md mx-4 p-6" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[16px] font-bold">Số suất ăn thực tế — {row.date.split("-").reverse().join("/")}</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {field("Trưa", "lunch", row.planLunch)}
            {field("Tối OT", "dinner", row.planDinner)}
            {field("Khách", "guest", row.planGuest)}
            {field("Thầu phụ", "sub", row.planSub)}
          </div>
          <div>
            <label className={lc} style={ls}>Ghi chú</label>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ví dụ: chênh do vắng đột xuất..." className={ic} style={is} />
          </div>
          {error && <div className="text-[12px] text-red-500">{error}</div>}
          <div className="flex gap-2 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Đang lưu..." : "Lưu số thực tế"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegisterMealModal({ departments, subcontractors = [], selectedDate, onClose, onSuccess, supplementary = false, canManageMeals = false }: {
  departments: Department[]; subcontractors?: Subcontractor[]; selectedDate: string; onClose: () => void; onSuccess: () => void; supplementary?: boolean; canManageMeals?: boolean;
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

  // Chốt giờ đăng ký. Thường: chốt 9h. Bổ sung: chốt 10h30 — sau đó (và ngày đã qua)
  // chỉ P. HCNS (canManageMeals) được thêm/sửa. HCNS không bị giới hạn giờ với bổ sung.
  const MEAL_CUTOFF_HOUR = 9;
  const SUPP_CUTOFF_HOUR = 10, SUPP_CUTOFF_MIN = 30;
  function isAfterCutoff(dateStr: string): boolean {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (supplementary) {
      if (canManageMeals) return false;       // HCNS: không giới hạn
      if (dateStr < today) return true;        // ngày đã qua
      if (dateStr > today) return false;       // ngày tương lai → cho phép
      const mins = now.getHours() * 60 + now.getMinutes();
      return mins >= SUPP_CUTOFF_HOUR * 60 + SUPP_CUTOFF_MIN; // hôm nay: sau 10h30
    }
    // đăng ký thường: chốt 9h
    if (dateStr < today) return true;
    if (dateStr === today && now.getHours() >= MEAL_CUTOFF_HOUR) return true;
    return false;
  }
  const cutoffPassed = isAfterCutoff(form.date);
  const cutoffMsg = supplementary
    ? "Đã quá giờ đăng ký bổ sung (10h30). Sau 10h30 chỉ P. HCNS được thêm/cập nhật."
    : `Đã quá giờ đăng ký suất ăn (chốt trước ${MEAL_CUTOFF_HOUR}h sáng).`;

  // "Thầu phụ" là một mục trong dropdown Phòng ban (sentinel). Khi chọn nó, đối tượng
  // đăng ký = thầu phụ; chọn nhà thầu cụ thể (form.subcontractorName lúc này GIỮ ID nhà thầu).
  const isSub = form.departmentId === SUBCONTRACTOR_DEPT;
  const effPerson: "EMPLOYEE" | "GUEST" | "SUBCONTRACTOR" = isSub ? "SUBCONTRACTOR" : form.personType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isAfterCutoff(form.date)) { setError(cutoffMsg); return; }
    if (!form.departmentId) { setError("Vui lòng chọn phòng ban"); return; }
    const qty = parseInt(form.quantity) || 0;
    if (qty <= 0) { setError("Số lượng phải lớn hơn 0"); return; }
    const guestPrice = parseInt(form.guestPrice.replace(/\D/g, "")) || 0;
    if (effPerson === "GUEST" && guestPrice <= 0) { setError("Vui lòng nhập giá trị suất ăn cho khách"); return; }
    if (effPerson === "SUBCONTRACTOR" && !form.subcontractorName.trim()) { setError("Vui lòng chọn nhà thầu phụ"); return; }
    if (supplementary && !form.reason.trim()) { setError("Vui lòng nhập lý do đăng ký bổ sung"); return; }
    setSaving(true);

    let res: Response;
    if (isSub && !supplementary) {
      // Đăng ký thường cho thầu phụ → lưu vào bảng SubcontractorMeal theo từng nhà thầu.
      res = await fetch("/api/v1/subcontractors/meals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcontractorId: form.subcontractorName,
          date: form.date,
          mealType: form.mealType,
          count: qty,
          specialNote: form.specialNote || null,
        }),
      });
    } else if (supplementary) {
      // Đăng ký bổ sung: thầu phụ vẫn đi qua phiếu bổ sung (cần duyệt). Gửi TÊN nhà thầu.
      const subName = isSub ? (subcontractors.find((s) => s.id === form.subcontractorName)?.name || "") : null;
      res = await fetch("/api/v1/meals/supplementary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: form.departmentId,
          date: form.date,
          mealType: form.mealType,
          personType: effPerson,
          quantity: qty,
          guestUnitPrice: effPerson === "GUEST" ? guestPrice : 0,
          subcontractorName: subName,
          reason: form.reason.trim(),
          specialNote: form.specialNote || null,
        }),
      });
    } else {
      const lunchCount  = form.mealType === "LUNCH"  && effPerson === "EMPLOYEE" ? qty : 0;
      const dinnerCount = form.mealType === "DINNER" && effPerson === "EMPLOYEE" ? qty : 0;
      const guestCount  = effPerson === "GUEST" ? qty : 0;
      res = await fetch("/api/v1/meals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: form.departmentId,
          date: form.date,
          lunchCount, dinnerCount, guestCount, subcontractorCount: 0,
          guestUnitPrice: effPerson === "GUEST" ? guestPrice : 0,
          subcontractorName: null,
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
              <option value={SUBCONTRACTOR_DEPT}>Thầu phụ</option>
            </select>
          </div>
          <div>
            <label className={lc} style={ls}>Ngày *</label>
            <DateInput required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={ic} style={is} />
          </div>
          <div className={isSub ? "" : "grid grid-cols-2 gap-3"}>
            <div>
              <label className={lc} style={ls}>Bữa ăn *</label>
              <select value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value as "LUNCH" | "DINNER" })} className={ic} style={is}>
                <option value="LUNCH">Bữa trưa</option>
                <option value="DINNER">Bữa tối (OT)</option>
              </select>
            </div>
            {!isSub && (
              <div>
                <label className={lc} style={ls}>Đối tượng *</label>
                <select value={form.personType} onChange={(e) => setForm({ ...form, personType: e.target.value as "EMPLOYEE" | "GUEST" | "SUBCONTRACTOR" })} className={ic} style={is}>
                  <option value="EMPLOYEE">Cán bộ nhân viên</option>
                  <option value="GUEST">Khách</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className={lc} style={ls}>Số lượng suất ăn *</label>
            <input required type="number" min={1} max={500} value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={ic} style={is} />
          </div>
          {effPerson === "GUEST" && (
            <div>
              <label className={lc} style={ls}>Giá trị suất ăn (khách) *</label>
              <input required inputMode="numeric" placeholder="Ví dụ: 35.000" value={form.guestPrice}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setForm({ ...form, guestPrice: digits ? Number(digits).toLocaleString("vi-VN") : "" });
                }} className={ic} style={is} />
            </div>
          )}
          {effPerson === "SUBCONTRACTOR" && (
            <div>
              <label className={lc} style={ls}>Nhà thầu phụ *</label>
              <select required value={form.subcontractorName}
                onChange={(e) => setForm({ ...form, subcontractorName: e.target.value })}
                className={ic} style={is}>
                <option value="">Chọn nhà thầu...</option>
                {subcontractors.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.companyName}</option>
                ))}
              </select>
              {subcontractors.filter((s) => s.active).length === 0 && (
                <div className="text-[11px] mt-1" style={{ color: "var(--ibs-warning)" }}>
                  Chưa có nhà thầu nào. Vào tab "Thầu phụ" để thêm trước.
                </div>
              )}
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
              ⏰ {cutoffMsg}
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

function FoodIssueModal({ inventory, defaultDate, onClose, onSuccess }: {
  inventory: { name: string; unit: string; quantity: number; value: number }[];
  defaultDate: string; onClose: () => void; onSuccess: (date: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [rows, setRows] = useState<{ key: string; qty: string }[]>([{ key: "", qty: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const invKey = (name: string, unit: string) => `${name}|||${unit}`;
  const parseQty = (s: string) => parseFloat(s.replace(/\s/g, "").replace(",", ".")) || 0;
  const findInv = (key: string) => inventory.find((it) => invKey(it.name, it.unit) === key);

  function updateRow(i: number, k: "key" | "qty", v: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }
  function addRow() { setRows((prev) => [...prev, { key: "", qty: "" }]); }
  function removeRow(i: number) { setRows((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev); }

  async function submit() {
    setError("");
    const items: { name: string; unit: string; quantity: number }[] = [];
    for (const r of rows) {
      if (!r.key) continue;
      const inv = findInv(r.key);
      if (!inv) continue;
      const qty = parseQty(r.qty);
      if (qty <= 0) continue;
      if (qty > inv.quantity + 1e-6) { setError(`"${inv.name}" chỉ còn tồn ${fmtNum(inv.quantity)} ${inv.unit}, không xuất quá tồn.`); return; }
      items.push({ name: inv.name, unit: inv.unit, quantity: qty });
    }
    if (items.length === 0) { setError("Chọn ít nhất 1 món và nhập số lượng > 0"); return; }
    setSaving(true);
    const res = await fetch("/api/v1/meals/food-issues", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, items }),
    });
    setSaving(false);
    if (res.ok) onSuccess(date); else { const d = await res.json(); setError(apiError(res.status, d.error)); }
  }

  const ic = "w-full rounded-lg px-3 py-2 text-[13px] border";
  const is = { background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}>
        <div className="flex items-center justify-between p-6 pb-3">
          <div className="text-[16px] font-bold">Thực xuất thực phẩm (bếp nấu)</div>
          <button onClick={onClose} style={{ color: "var(--ibs-text-dim)" }}><X size={18} /></button>
        </div>

        <div className="px-6 overflow-y-auto flex-1 min-h-0">
        {inventory.length === 0 ? (
          <div className="text-[13px] rounded-lg px-3 py-3 mb-2" style={{ background: "rgba(234,179,8,0.1)", color: "var(--ibs-warning)" }}>
            Kho đang trống — cần "Thêm danh sách thực phẩm" (nhập kho) trước khi thực xuất.
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="text-[12px] font-medium mb-1 block" style={{ color: "var(--ibs-text-dim)" }}>Ngày xuất *</label>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={ic + " max-w-[200px]"} style={is} />
            </div>
            <div className="flex flex-col gap-2 mb-2">
              <div className="grid grid-cols-[28px_1fr_140px_32px] gap-2 text-[11px] font-semibold px-1" style={{ color: "var(--ibs-text-dim)" }}>
                <span>STT</span><span>Thực phẩm (Tồn kho)</span><span>THỰC XUẤT</span><span />
              </div>
              {rows.map((r, i) => {
                const inv = findInv(r.key);
                return (
                  <div key={i} className="grid grid-cols-[28px_1fr_140px_32px] gap-2 items-center">
                    <span className="text-[12px] text-center font-medium" style={{ color: "var(--ibs-text-dim)" }}>{i + 1}</span>
                    <select value={r.key} onChange={(e) => updateRow(i, "key", e.target.value)} className={ic} style={is}>
                      <option value="">Chọn thực phẩm...</option>
                      {inventory.map((it) => (
                        <option key={invKey(it.name, it.unit)} value={invKey(it.name, it.unit)}>{it.name} (tồn {fmtNum(it.quantity)} {it.unit})</option>
                      ))}
                    </select>
                    <input inputMode="decimal" placeholder={inv ? `≤ ${fmtNum(inv.quantity)}` : "0"} value={r.qty}
                      onChange={(e) => updateRow(i, "qty", e.target.value)} className={ic} style={is} />
                    <button type="button" onClick={() => removeRow(i)} className="text-[12px]" style={{ color: "var(--ibs-danger)" }}>✕</button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addRow} className="text-[12px] font-semibold mb-3" style={{ color: "var(--ibs-accent)" }}>+ Thêm món</button>
          </>
        )}

        </div>
        <div className="p-6 pt-3 border-t" style={{ borderColor: "var(--ibs-border)" }}>
          {error && <div className="text-[12px] text-red-500 mb-2">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] border" style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>Hủy</button>
            <button type="button" onClick={submit} disabled={saving || inventory.length === 0} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: "var(--ibs-accent)", color: "#fff", opacity: (saving || inventory.length === 0) ? 0.5 : 1 }}>
              {saving ? "Đang lưu..." : "Lưu thực xuất"}
            </button>
          </div>
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
