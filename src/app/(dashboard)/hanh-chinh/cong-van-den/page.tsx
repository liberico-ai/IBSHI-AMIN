import { DocumentArchive } from "@/components/shared/document-archive";

export default function CongVanDenPage() {
  return (
    <DocumentArchive
      kind="incoming"
      title="Công văn đến"
      description="Lưu trữ công văn đến: ngày, mã, tiêu đề và bản scan"
    />
  );
}
