"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";

type SlipData = {
  id: string;
  workDays: number;
  standardDays: number;
  otHours: number;
  baseSalary: number;
  pieceRateSalary: number;
  hazardAllowance: number;
  responsibilityAllow: number;
  mealAllowance: number;
  otherIncome: number;
  otPay: number;
  grossSalary: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  tncn: number;
  deductions: number;
  netSalary: number;
  notes?: string;
  period: { month: number; year: number; status: string };
  employee: {
    code: string;
    fullName: string;
    department: { name: string };
    position: { name: string };
    bankAccount?: string;
    bankName?: string;
    taxCode?: string;
  };
};

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bản nháp",
  PROCESSING: "Đang xử lý",
  APPROVED: "Đã duyệt",
  PAID: "Đã thanh toán",
};

export default function SalarySlipPage() {
  const { id } = useParams<{ id: string }>();
  const [slip, setSlip] = useState<SlipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/payroll/${id}/slip`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) setError("Không tìm thấy slip lương");
        else setSlip(res.data);
      })
      .catch(() => setError("Lỗi kết nối"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" style={{ color: "var(--ibs-text-dim)" }}>
        Đang tải...
      </div>
    );
  }

  if (error || !slip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p style={{ color: "var(--ibs-danger)" }}>{error || "Không tìm thấy dữ liệu"}</p>
        <Link href="/luong" className="text-[13px]" style={{ color: "var(--ibs-accent)" }}>
          ← Quay lại
        </Link>
      </div>
    );
  }

  const totalInsurance = slip.bhxh + slip.bhyt + slip.bhtn;
  const totalDeductions = totalInsurance + slip.tncn + slip.deductions;

  return (
    <div>
      {/* Action bar (non-printable) */}
      <div className="flex items-center gap-3 mb-6 print:hidden">
        <Link href="/luong" className="flex items-center gap-1.5 text-[13px]"
          style={{ color: "var(--ibs-text-muted)" }}>
          <ArrowLeft size={14} /> Quay lại
        </Link>
        <button onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
          style={{ background: "var(--ibs-accent)" }}>
          <Printer size={13} /> In / Xuất PDF
        </button>
      </div>

      {/* Slip */}
      <div className="max-w-[750px] mx-auto rounded-xl border p-8 print:p-4 print:border-0 print:shadow-none"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}>

        {/* Header */}
        <div className="text-center mb-6 pb-6 border-b" style={{ borderColor: "var(--ibs-border)" }}>
          <div className="text-[22px] font-extrabold mb-1" style={{ color: "var(--ibs-accent)" }}>
            IBS HEAVY INDUSTRY JSC
          </div>
          <div className="text-[20px] font-bold mt-3">PHIẾU LƯƠNG</div>
          <div className="text-[15px] mt-1" style={{ color: "var(--ibs-text-muted)" }}>
            Tháng {slip.period.month}/{slip.period.year}
          </div>
          <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold"
            style={{
              background: slip.period.status === "PAID" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
              color: slip.period.status === "PAID" ? "#10b981" : "#f59e0b",
            }}>
            {STATUS_LABEL[slip.period.status] || slip.period.status}
          </div>
        </div>

        {/* Employee info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-[13px]">
          {[
            ["Họ và tên", slip.employee.fullName],
            ["Mã NV", slip.employee.code],
            ["Phòng ban", slip.employee.department.name],
            ["Chức vụ", slip.employee.position.name],
            ["Ngân hàng", slip.employee.bankName || "—"],
            ["Số tài khoản", slip.employee.bankAccount || "—"],
            ["MST cá nhân", slip.employee.taxCode || "—"],
            ["Số công / chuẩn", `${slip.workDays} / ${slip.standardDays} ngày`],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="w-36 shrink-0" style={{ color: "var(--ibs-text-dim)" }}>{label}:</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>

        {/* Income table */}
        <div className="mb-4">
          <div className="text-[13px] font-semibold mb-2 px-1" style={{ color: "var(--ibs-text-muted)" }}>
            A. CÁC KHOẢN THU NHẬP
          </div>
          <table className="w-full text-[13px]">
            <tbody>
              {[
                ["Lương cơ bản theo công", Math.round(slip.baseSalary * (slip.workDays / slip.standardDays))],
                slip.pieceRateSalary > 0 && ["Lương khoán sản xuất", slip.pieceRateSalary],
                slip.hazardAllowance > 0 && ["Phụ cấp độc hại", slip.hazardAllowance],
                slip.responsibilityAllow > 0 && ["Phụ cấp trách nhiệm", slip.responsibilityAllow],
                ["Phụ cấp ăn trưa", slip.mealAllowance],
                slip.otPay > 0 && [`Tiền OT (${slip.otHours.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h)`, slip.otPay],
                slip.otherIncome > 0 && ["Thu nhập khác", slip.otherIncome],
              ].filter(Boolean).map(([label, value]: any) => (
                <tr key={label} className="border-b" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                  <td className="py-2 px-2">{label}</td>
                  <td className="py-2 px-2 text-right font-medium">{fmt(value)} ₫</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(0,180,216,0.06)" }}>
                <td className="py-2.5 px-2 font-bold text-[14px]">Tổng thu nhập</td>
                <td className="py-2.5 px-2 text-right font-bold text-[14px]" style={{ color: "var(--ibs-accent)" }}>
                  {fmt(slip.grossSalary)} ₫
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Deductions table */}
        <div className="mb-6">
          <div className="text-[13px] font-semibold mb-2 px-1" style={{ color: "var(--ibs-text-muted)" }}>
            B. CÁC KHOẢN KHẤU TRỪ
          </div>
          <table className="w-full text-[13px]">
            <tbody>
              {[
                ["BHXH (8%)", slip.bhxh],
                ["BHYT (1.5%)", slip.bhyt],
                ["BHTN (1%)", slip.bhtn],
                ["Thuế TNCN", slip.tncn],
                slip.deductions > 0 && ["Khấu trừ khác", slip.deductions],
              ].filter(Boolean).map(([label, value]: any) => (
                <tr key={label} className="border-b" style={{ borderColor: "rgba(51,65,85,0.3)" }}>
                  <td className="py-2 px-2">{label}</td>
                  <td className="py-2 px-2 text-right font-medium" style={{ color: "#ef4444" }}>
                    - {fmt(value)} ₫
                  </td>
                </tr>
              ))}
              <tr style={{ background: "rgba(239,68,68,0.06)" }}>
                <td className="py-2.5 px-2 font-bold text-[14px]">Tổng khấu trừ</td>
                <td className="py-2.5 px-2 text-right font-bold text-[14px]" style={{ color: "#ef4444" }}>
                  - {fmt(totalDeductions)} ₫
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Net salary */}
        <div className="rounded-xl p-5 text-center border"
          style={{ background: "rgba(0,180,216,0.07)", borderColor: "rgba(0,180,216,0.3)" }}>
          <div className="text-[13px] mb-1" style={{ color: "var(--ibs-text-muted)" }}>THỰC LĨNH</div>
          <div className="text-[32px] font-extrabold" style={{ color: "var(--ibs-accent)" }}>
            {fmt(slip.netSalary)} ₫
          </div>
        </div>

        {slip.notes && (
          <div className="mt-4 text-[12px] px-2" style={{ color: "var(--ibs-text-dim)" }}>
            Ghi chú: {slip.notes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t grid grid-cols-3 text-center text-[12px]"
          style={{ borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}>
          <div>
            <div className="font-semibold mb-1">Nhân viên</div>
            <div className="mt-12">(Ký, ghi rõ họ tên)</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Kế toán</div>
            <div className="mt-12">(Ký, ghi rõ họ tên)</div>
          </div>
          <div>
            <div className="font-semibold mb-1">Giám đốc</div>
            <div className="mt-12">(Ký, đóng dấu)</div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm 15mm 15mm 15mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            font-size: 12pt;
          }
          /* Hide dashboard chrome */
          nav, aside, header, footer,
          [data-sidebar], [class*="sidebar"], [class*="DashboardShell"],
          .print\\:hidden { display: none !important; }
          /* Slip container — full width, no card shadow */
          .max-w-\\[750px\\] {
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: white !important;
          }
          /* Force black text for print */
          * { color: black !important; }
          .font-bold, .font-extrabold, .font-semibold { color: black !important; }
          /* Preserve accent color for company name and net salary only */
          .text-\\[32px\\] { color: #0077b6 !important; }
          /* Table borders */
          tr { border-color: #ccc !important; }
          /* Backgrounds */
          tr[style] { background: #f5f5f5 !important; }
        }
      `}</style>
    </div>
  );
}
