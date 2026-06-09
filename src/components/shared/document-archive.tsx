"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, RefreshCw, Upload, ExternalLink, Trash2, FileText, Search } from "lucide-react";
import { DataTable, Column } from "@/components/shared/data-table";
import { DateInput } from "@/components/shared/date-input";
import { formatDate, apiError } from "@/lib/utils";
import { confirmDialog, alertDialog } from "@/lib/confirm-dialog";
import { BUCKETS } from "@/lib/minio-constants";
import { viewUrl } from "@/lib/use-presigned-url";

type Doc = {
  id: string;
  docDate?: string | null;
  docNumber?: string | null;
  subject?: string | null;
  fromEntity?: string | null;  // incoming (Công ty)
  recipientType?: string | null; // incoming: CONG_TY | CA_NHAN
  routedTo?: string | null;      // incoming (Cá nhân) — nơi nhận đích danh
  confirmedAt?: string | null;   // incoming (Cá nhân) — đã xác nhận nhận lúc nào
  confirmedByName?: string | null;
  toEntity?: string | null;    // outgoing
  senderType?: string | null;      // outgoing: CONG_TY | CA_NHAN
  senderName?: string | null;      // outgoing — người/đơn vị gửi
  transportMethod?: string | null; // outgoing
  transportUnit?: string | null;   // outgoing
  scanFileUrl?: string;
  scanUrl?: string;
  receivedAt?: string;
  createdAt?: string;
};

interface Props {
  kind: "incoming" | "outgoing";
  title: string;
  description: string;
  numberRequired?: boolean; // outgoing yêu cầu mã bắt buộc + unique
}

// Hình thức vận chuyển công văn đi.
const TRANSPORT_METHODS = ["Bưu điện", "Chuyển phát nhanh", "Giao trực tiếp", "Email / Điện tử", "Khác"];

export function DocumentArchive({ kind, title, description, numberRequired }: Props) {
  const apiBase = `/api/v1/documents/${kind}`;
  const folder = kind === "incoming" ? "incoming-docs" : "outgoing-docs";

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function fetchDocs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`${apiBase}?${params}`)
      .then((r) => r.json())
      .then((res) => setDocs(res.data || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.json()).then((res) => setUserRole(res?.role || "")).catch(() => {});
  }, []);
  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  // Công văn ĐẾN: chỉ Phòng HCNS (HR_ADMIN/BOM) được thêm. Công văn đi: thêm cả MANAGER.
  const canManage = kind === "incoming"
    ? (userRole === "HR_ADMIN" || userRole === "BOM")
    : (userRole === "HR_ADMIN" || userRole === "BOM" || userRole === "MANAGER");
  const canDelete = userRole === "HR_ADMIN" || userRole === "BOM";

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ message: "Xác nhận xoá công văn này?", tone: "danger", confirmText: "Xoá" }))) return;
    const res = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      await alertDialog(apiError(res.status, json?.error) || "Xoá thất bại");
      return;
    }
    fetchDocs();
  }

  async function confirmReceived(id: string) {
    if (!(await confirmDialog({ message: "Xác nhận bạn (cá nhân/phòng ban) đã NHẬN ĐƯỢC công văn này?", confirmText: "Xác nhận" }))) return;
    const res = await fetch(`${apiBase}/${id}/confirm`, { method: "POST" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      await alertDialog(apiError(res.status, json?.error) || "Xác nhận thất bại");
      return;
    }
    fetchDocs();
  }

  const fmtDateTime = (d: string) => new Date(d).toLocaleString("vi-VN");

  const columns: Column<Doc>[] = [
    {
      key: "docDate",
      header: "Ngày công văn",
      width: "130px",
      render: (d) => d.docDate ? formatDate(d.docDate) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>,
    },
    {
      key: "docNumber",
      header: "Mã công văn",
      width: "180px",
      render: (d) => d.docNumber ? <span className="font-mono text-[12px] font-semibold">{d.docNumber}</span> : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>,
    },
    {
      key: "subject",
      header: "Tiêu đề",
      render: (d) => <span className="font-medium">{d.subject || "—"}</span>,
    },
    {
      key: "entity",
      header: kind === "incoming" ? "Đơn vị chuyển / Nơi nhận" : "Người gửi / Nơi nhận",
      width: "220px",
      render: (d) => {
        if (kind === "incoming") {
          const caNhan = d.recipientType === "CA_NHAN";
          const v = caNhan ? d.routedTo : d.fromEntity;
          if (!v) return <span style={{ color: "var(--ibs-text-dim)" }}>—</span>;
          return (
            <span className="text-[12px] inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={caNhan ? { background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" } : { background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>{caNhan ? "Cá nhân" : "Công ty"}</span>
              {v}
            </span>
          );
        }
        return (
          <div className="space-y-0.5">
            {d.senderName && (
              <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1" style={d.senderType === "CA_NHAN" ? { background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" } : { background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}>{d.senderType === "CA_NHAN" ? "Cá nhân" : "Công ty"}</span>
                Gửi: {d.senderName}
              </div>
            )}
            {d.toEntity ? <div className="text-[12px]">Nhận: {d.toEntity}</div> : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
            {(d.transportMethod || d.transportUnit) && (
              <div className="text-[11px]" style={{ color: "var(--ibs-text-dim)" }}>🚚 {[d.transportMethod, d.transportUnit].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "scan",
      header: kind === "incoming" ? "File scan / Xác nhận" : "File scan",
      width: kind === "incoming" ? "210px" : "120px",
      render: (d) => {
        const url = d.scanFileUrl || d.scanUrl;
        const caNhan = kind === "incoming" && d.recipientType === "CA_NHAN";
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {url ? (
              <a
                href={viewUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold"
                style={{ background: "rgba(0,180,216,0.12)", color: "var(--ibs-accent)" }}
              >
                <FileText size={11} /> Xem
                <ExternalLink size={10} />
              </a>
            ) : <span style={{ color: "var(--ibs-text-dim)" }}>—</span>}
            {caNhan && (
              d.confirmedAt ? (
                <span
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold"
                  style={{ background: "rgba(16,185,129,0.15)", color: "var(--ibs-success)" }}
                  title={`Đã xác nhận: ${d.confirmedByName || ""} · ${fmtDateTime(d.confirmedAt)}`}
                >
                  ✓ Đã nhận
                </span>
              ) : (
                <button
                  onClick={() => confirmReceived(d.id)}
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold"
                  style={{ background: "rgba(234,179,8,0.15)", color: "var(--ibs-warning)" }}
                  title="Xác nhận đã nhận được công văn này"
                >
                  Xác nhận
                </button>
              )
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: "60px",
      render: (d) => canDelete ? (
        <button
          onClick={() => handleDelete(d.id)}
          className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
          style={{ background: "rgba(239,68,68,0.12)", color: "var(--ibs-danger)" }}
          title="Xoá công văn"
        >
          <Trash2 size={11} />
        </button>
      ) : null,
    },
  ];

  const inputStyle: React.CSSProperties = {
    background: "var(--ibs-bg)",
    border: "1px solid var(--ibs-border)",
    color: "var(--ibs-text)",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: "var(--ibs-text)" }}>{title}</h1>
          <div className="text-[12px]" style={{ color: "var(--ibs-text-dim)" }}>{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDocs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold border"
            style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Làm mới
          </button>
          {canManage && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold"
              style={{ background: "var(--ibs-accent)", color: "#fff" }}
            >
              <Plus size={15} /> Thêm công văn {kind === "incoming" ? "đến" : "đi"}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        className="flex items-center gap-3 mb-4 p-3 rounded-xl border flex-wrap"
        style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
      >
        <div className="relative flex-1 min-w-[240px] max-w-[420px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ibs-text-dim)" }} />
          <input
            type="text"
            placeholder="Tìm theo mã, tiêu đề hoặc đơn vị..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px]"
            style={inputStyle}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>Từ</span>
          <DateInput
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-[13px]"
            style={inputStyle}
          />
          <span className="text-[12px] font-medium" style={{ color: "var(--ibs-text-dim)" }}>đến</span>
          <DateInput
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-[13px]"
            style={inputStyle}
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(""); setTo(""); }}
              className="text-[12px] px-2 py-1.5 rounded-lg border"
              style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
              title="Xoá bộ lọc ngày"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="text-[13px] ml-auto" style={{ color: "var(--ibs-text-dim)" }}>
          Tổng: <span className="font-bold" style={{ color: "var(--ibs-accent)" }}>{docs.length}</span> công văn
        </div>
      </div>

      <DataTable
        columns={columns as any}
        data={docs as any}
        loading={loading}
        emptyText="Chưa có công văn nào. Bấm 'Thêm công văn' để thêm mới."
      />

      {showAdd && (
        <AddModal
          kind={kind}
          folder={folder}
          numberRequired={numberRequired}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchDocs(); }}
        />
      )}
    </div>
  );
}

// ─── Add modal ─────────────────────────────────────────────────────────────
function AddModal({
  kind,
  folder,
  numberRequired,
  onClose,
  onSaved,
}: {
  kind: "incoming" | "outgoing";
  folder: string;
  numberRequired?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [docNumber, setDocNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [entity, setEntity] = useState("");
  const [recipientType, setRecipientType] = useState<"CONG_TY" | "CA_NHAN">("CONG_TY");
  const [routedTo, setRoutedTo] = useState("");
  const [transportMethod, setTransportMethod] = useState("");
  const [transportUnit, setTransportUnit] = useState("");
  // Công văn ĐI: người gửi / đơn vị gửi (Công ty hay Cá nhân/phòng ban).
  const [senderType, setSenderType] = useState<"CONG_TY" | "CA_NHAN">("CONG_TY");
  const [senderText, setSenderText] = useState(""); // khi Công ty
  const [senderSel, setSenderSel] = useState("");   // khi Cá nhân: emp:<id> / dept:<id>
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [emps, setEmps] = useState<{ id: string; code: string; fullName: string; department?: { name?: string } | null }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Tải danh sách phòng ban + nhân viên cho dropdown Cá nhân (Nơi nhận ở "đến" / Người gửi ở "đi").
  useEffect(() => {
    fetch("/api/v1/departments").then((r) => r.json()).then((res) => setDepts(res.data || [])).catch(() => {});
    fetch("/api/v1/employees?limit=500").then((r) => r.json()).then((res) => setEmps(res.data || [])).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Vui lòng chọn file scan công văn");
      return;
    }
    if (!subject.trim()) {
      setError("Vui lòng nhập tiêu đề");
      return;
    }
    if (numberRequired && !docNumber.trim()) {
      setError("Vui lòng nhập mã công văn");
      return;
    }
    if (kind === "incoming" && recipientType === "CA_NHAN" && !routedTo.trim()) {
      setError("Vui lòng chọn nơi nhận (cá nhân / phòng ban)");
      return;
    }
    if (kind === "outgoing" && senderType === "CA_NHAN" && !senderSel) {
      setError("Vui lòng chọn người gửi (cá nhân / phòng ban)");
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bucket", BUCKETS.HR_DOCUMENTS);
    fd.append("folder", folder);

    const upRes = await fetch("/api/v1/upload", { method: "POST", body: fd });
    const upJson = await upRes.json();
    setUploading(false);
    if (!upRes.ok) {
      setError(apiError(upRes.status, upJson?.error) || "Upload file thất bại");
      return;
    }
    const scanFileUrl = upJson.data?.url;

    setSaving(true);
    const payload: any = {
      docDate,
      docNumber: docNumber.trim() || null,
      subject: subject.trim(),
      scanFileUrl,
    };
    if (kind === "incoming") {
      payload.recipientType = recipientType;
      if (recipientType === "CA_NHAN") {
        if (routedTo.startsWith("dept:")) {
          const did = routedTo.slice(5);
          payload.routedDepartmentId = did;
          payload.routedTo = depts.find((d) => d.id === did)?.name || "";
        } else if (routedTo.startsWith("emp:")) {
          const eid = routedTo.slice(4);
          const e = emps.find((x) => x.id === eid);
          payload.routedEmployeeId = eid;
          payload.routedTo = e ? `${e.fullName} (${e.code})` : "";
        }
      } else {
        payload.fromEntity = entity.trim() || null;
      }
    } else {
      payload.toEntity = entity.trim() || null;
      payload.transportMethod = transportMethod || null;
      payload.transportUnit = transportUnit.trim() || null;
      payload.senderType = senderType;
      if (senderType === "CA_NHAN") {
        if (senderSel.startsWith("dept:")) payload.senderName = depts.find((d) => d.id === senderSel.slice(5))?.name || "";
        else if (senderSel.startsWith("emp:")) { const e = emps.find((x) => x.id === senderSel.slice(4)); payload.senderName = e ? `${e.fullName} (${e.code})` : ""; }
      } else {
        payload.senderName = senderText.trim() || null;
      }
    }
    const res = await fetch(`/api/v1/documents/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(apiError(res.status, json?.error) || "Lưu công văn thất bại");
      return;
    }
    onSaved();
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--ibs-bg)",
    border: "1px solid var(--ibs-border)",
    color: "var(--ibs-text)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[520px] rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--ibs-bg-card)", border: "1px solid var(--ibs-border)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="text-[17px] font-bold" style={{ color: "var(--ibs-text)" }}>
            Thêm công văn {kind === "incoming" ? "đến" : "đi"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--ibs-text-dim)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
              Ngày công văn
            </label>
            <DateInput
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
              Mã công văn {numberRequired && <span style={{ color: "var(--ibs-danger)" }}>*</span>}
            </label>
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder={kind === "incoming" ? "VD: 123/2026/CV-XYZ" : "VD: 045/2026/IBS-HC"}
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
              Tiêu đề <span style={{ color: "var(--ibs-danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Trích yếu nội dung công văn"
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={inputStyle}
            />
          </div>

          {kind === "outgoing" && (
            <>
              <div>
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                  Người gửi / Đơn vị gửi <span style={{ color: "var(--ibs-danger)" }}>*</span>
                </label>
                <select
                  value={senderType}
                  onChange={(e) => setSenderType(e.target.value as "CONG_TY" | "CA_NHAN")}
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={inputStyle}
                >
                  <option value="CONG_TY">Công ty (gửi từ công ty)</option>
                  <option value="CA_NHAN">Cá nhân (đích danh người / phòng ban)</option>
                </select>
              </div>
              {senderType === "CA_NHAN" ? (
                <div>
                  <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                    Người gửi <span style={{ color: "var(--ibs-danger)" }}>*</span>
                  </label>
                  <select
                    value={senderSel}
                    onChange={(e) => setSenderSel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={inputStyle}
                  >
                    <option value="">Chọn cá nhân / phòng ban...</option>
                    <optgroup label="Phòng ban">
                      {depts.map((d) => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}
                    </optgroup>
                    <optgroup label="Nhân viên">
                      {emps.map((e) => <option key={e.id} value={`emp:${e.id}`}>{e.fullName} — {e.code}{e.department?.name ? ` · ${e.department.name}` : ""}</option>)}
                    </optgroup>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                    Đơn vị gửi
                  </label>
                  <input
                    type="text"
                    value={senderText}
                    onChange={(e) => setSenderText(e.target.value)}
                    placeholder="VD: Công ty IBS Heavy Industry / P. HCNS"
                    className="w-full px-3 py-2 rounded-lg text-[13px]"
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}

          {kind === "incoming" && (
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                Gửi cho <span style={{ color: "var(--ibs-danger)" }}>*</span>
              </label>
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as "CONG_TY" | "CA_NHAN")}
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={inputStyle}
              >
                <option value="CONG_TY">Công ty (gửi chung cho công ty)</option>
                <option value="CA_NHAN">Cá nhân (đích danh người / phòng ban)</option>
              </select>
            </div>
          )}

          {kind === "incoming" && recipientType === "CA_NHAN" ? (
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                Nơi nhận <span style={{ color: "var(--ibs-danger)" }}>*</span>
              </label>
              <select
                value={routedTo}
                onChange={(e) => setRoutedTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={inputStyle}
              >
                <option value="">Chọn cá nhân / phòng ban...</option>
                <optgroup label="Phòng ban">
                  {depts.map((d) => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}
                </optgroup>
                <optgroup label="Nhân viên">
                  {emps.map((e) => <option key={e.id} value={`emp:${e.id}`}>{e.fullName} — {e.code}{e.department?.name ? ` · ${e.department.name}` : ""}</option>)}
                </optgroup>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                {kind === "incoming" ? "Đơn vị chuyển" : "Đơn vị nhận / Nơi nhận"}
              </label>
              <input
                type="text"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder={kind === "incoming" ? "Đơn vị gửi đến (VD: Sở LĐ-TBXH Hải Phòng)" : "Đơn vị nhận (VD: BHXH TP. Hải Phòng)"}
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={inputStyle}
              />
            </div>
          )}

          {kind === "outgoing" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                  Hình thức vận chuyển
                </label>
                <select
                  value={transportMethod}
                  onChange={(e) => setTransportMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={inputStyle}
                >
                  <option value="">-- Chọn --</option>
                  {TRANSPORT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
                  Đơn vị vận chuyển
                </label>
                <input
                  type="text"
                  value={transportUnit}
                  onChange={(e) => setTransportUnit(e.target.value)}
                  placeholder="VD: VNPost, Viettel Post, GHN..."
                  className="w-full px-3 py-2 rounded-lg text-[13px]"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--ibs-text-dim)" }}>
              File scan <span style={{ color: "var(--ibs-danger)" }}>*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full px-3 py-4 rounded-lg text-[13px] flex items-center justify-center gap-2 transition-colors hover:opacity-80"
              style={{
                background: file ? "var(--ibs-bg)" : "rgba(0,180,216,0.06)",
                border: `1px dashed ${file ? "var(--ibs-border)" : "var(--ibs-accent)"}`,
                color: file ? "var(--ibs-text)" : "var(--ibs-accent)",
              }}
            >
              <Upload size={15} />
              {file ? `Đã chọn: ${file.name}` : "Bấm để chọn file scan (PDF / JPG / PNG, tối đa 10MB)"}
            </button>
          </div>

          {error && (
            <div className="text-[12px] p-2.5 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "var(--ibs-danger)", border: "1px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || saving}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold border"
            style={{ background: "var(--ibs-bg)", borderColor: "var(--ibs-border)", color: "var(--ibs-text-dim)" }}
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={uploading || saving}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold"
            style={{ background: "var(--ibs-accent)", color: "#fff", opacity: uploading || saving ? 0.7 : 1 }}
          >
            {uploading ? "Đang upload..." : saving ? "Đang lưu..." : "Lưu công văn"}
          </button>
        </div>
      </form>
    </div>
  );
}
