import { DocumentArchive } from "@/components/shared/document-archive";

export default function CongVanDiPage() {
  return (
    <DocumentArchive
      kind="outgoing"
      title="Công văn đi"
      description="Lưu trữ công văn đi: ngày, mã, tiêu đề và bản scan"
      numberRequired
    />
  );
}
