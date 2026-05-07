import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  features: string[];
  dataNeeded: string[];
}

export function ComingSoon({ title, description, features, dataNeeded }: ComingSoonProps) {
  return (
    <div
      className="rounded-xl border p-8"
      style={{ background: "var(--ibs-bg-card)", borderColor: "var(--ibs-border)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="p-3 rounded-lg"
          style={{ background: "rgba(0,180,216,0.1)", color: "var(--ibs-accent)" }}
        >
          <Construction size={24} />
        </div>
        <div>
          <h3 className="text-[18px] font-bold">{title}</h3>
          <p className="text-[13px]" style={{ color: "var(--ibs-text-dim)" }}>
            {description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
        <div>
          <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--ibs-accent)" }}>
            ✨ Tính năng dự kiến
          </h4>
          <ul className="space-y-2">
            {features.map((f, i) => (
              <li key={i} className="text-[13px] flex gap-2" style={{ color: "var(--ibs-text-muted)" }}>
                <span style={{ color: "var(--ibs-accent)" }}>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[13px] font-semibold mb-3" style={{ color: "#f59e0b" }}>
            📋 Dữ liệu / template cần cung cấp
          </h4>
          <ul className="space-y-2">
            {dataNeeded.map((d, i) => (
              <li key={i} className="text-[13px] flex gap-2" style={{ color: "var(--ibs-text-muted)" }}>
                <span style={{ color: "#f59e0b" }}>•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="mt-6 p-3 rounded-lg text-[12px]"
        style={{
          background: "rgba(0,180,216,0.05)",
          border: "1px solid rgba(0,180,216,0.2)",
          color: "var(--ibs-text-dim)",
        }}
      >
        Trang này đang ở trạng thái khung. Sau khi cung cấp dữ liệu nghiệp vụ, đội phát triển sẽ hoàn thiện UI &amp; logic theo đúng nghiệp vụ.
      </div>
    </div>
  );
}
