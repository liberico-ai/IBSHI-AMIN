// Danh mục MÃ CV (mã công việc) + MÃ CHỦNG LOẠI (phụ thuộc theo Mã CV) cho Phiếu kê khai tổ (M3).
// Nguồn: file "Danh_muc_cong_viec.xlsx" do nghiệp vụ cung cấp. FIX CỨNG như src/lib/projects.ts;
// cập nhật ở đây khi danh mục thay đổi. Mã chủng loại LỌC theo Mã CV đang chọn (dropdown 2 cấp).

export type WorkCategory = { code: string; label: string; desc: string };
export type WorkCode = { code: string; label: string; cats: WorkCategory[] };

export const WORK_CATALOG: WorkCode[] = [
  { code: "Ax", label: "Rửa Acid", cats: [
    { code: "Ax", label: "Rửa acid; Xà phòng - inox, hợp kim", desc: "Rửa acid; Xà phòng - inox, hợp kim" },
  ] },
  { code: "BO", label: "Bảo ôn", cats: [
    { code: "PH", label: "Bảo ôn Phen ngựa (bông + Liner)", desc: "Bảo ôn phen ngựa (Bông + Liner)" },
    { code: "SD", label: "Bảo ôn dạng hộp đính thẳng (Stud) (Bông + Liner)", desc: "Bảo ôn dạng hộp đính thẳng (Stud) (Bông + Liner)" },
    { code: "SC", label: "Bảo ôn các loại với đính dạng Scalope (Chân tôn) (Bông + Liner)", desc: "Bảo ôn các loại với đính dạng Scalope (Chân tôn) (Bông + Liner)" },
  ] },
  { code: "ĐK", label: "Đóng kiện", cats: [
    { code: "HR", label: "Đóng kiện hàng rời", desc: "Đóng kiện hàng rời" },
    { code: "KH", label: "Đóng kiện hàng khối (Block, ống khói, Hộp lớn...)", desc: "Đóng kiện hàng khối (Block, ống khói, Hộp lớn...)" },
  ] },
  { code: "G", label: "Gá", cats: [
    { code: "KC", label: "Kết cấu", desc: "Gá kết cấu" },
    { code: "TB", label: "Thiết bị", desc: "Gá thiết bị" },
    { code: "CT", label: "Cầu thang lan can", desc: "Gá cầu thang lan can" },
    { code: "TĐ", label: "Tổng đoạn", desc: "Gá tổng đoạn" },
  ] },
  { code: "GC", label: "Gia công", cats: [
    { code: "SL", label: "Sấn lốc", desc: "Gia công sấn lốc" },
    { code: "KH", label: "Gia công Khoan", desc: "Khoan" },
    { code: "CK", label: "Gia công chính xác (tiện)", desc: "Gia công chính xác (tiện)" },
  ] },
  { code: "GEN", label: "Các mục công việc phục vụ chung", cats: [] },
  { code: "GH", label: "Giao hàng", cats: [] },
  { code: "H", label: "Hàn", cats: [
    { code: "KC", label: "Kết cấu", desc: "Hàn kết cấu" },
    { code: "KK", label: "Khung kiện", desc: "Hàn khung kiện" },
    { code: "TB", label: "Thiết bị", desc: "Hàn thiết bị" },
    { code: "CT", label: "Cầu thang lan can", desc: "Hàn cầu thang lan can" },
  ] },
  { code: "LS", label: "Làm sạch", cats: [
    { code: "TB", label: "Làm sạch KC, Thiết bị (Thợ làm sạch và phụ làm sạch)", desc: "Làm sạch KC, Thiết bị (Thợ làm sạch và phụ làm sạch)" },
    { code: "BL", label: "Block", desc: "Làm sạch Block" },
    { code: "KK", label: "Khung kiện", desc: "Làm sạch khung kiện" },
    { code: "IN", label: "Inox, hợp kim", desc: "Làm sạch inox, hợp kim" },
  ] },
  { code: "PC", label: "Pha cắt", cats: [
    { code: "TT", label: "Tôn tấm", desc: "Pha cắt tôn tấm" },
    { code: "TH", label: "Thép hình", desc: "Pha cắt thép hình" },
    { code: "IN", label: "Inox, hợp kim", desc: "Pha cắt Inox, hợp kim" },
  ] },
  { code: "PS", label: "Phát sinh", cats: [
    { code: "PS", label: "Phát sinh", desc: "Những công việc phát sinh không có trong phạm vi công việc tổ đã được phân giao" },
  ] },
  { code: "S", label: "Sơn", cats: [
    { code: "TB", label: "Sơn KC, Thiết bị (Sơn, sửa sơn nghiệm thu)", desc: "Sơn KC, Thiết bị (Sơn, sửa sơn nghiệm thu)" },
    { code: "BL", label: "Block", desc: "Sơn Block" },
    { code: "KK", label: "Khung kiện", desc: "Sơn khung kiện" },
  ] },
  { code: "TA", label: "Thử áp", cats: [
    { code: "TA", label: "Thử áp", desc: "Thử áp" },
  ] },
  { code: "TH", label: "Tổ hợp", cats: [
    { code: "KC", label: "Kết cấu", desc: "Tổ hợp kết cấu" },
    { code: "TB", label: "Thiết bị", desc: "Tổ hợp thiết bị" },
    { code: "BL", label: "Block", desc: "Tổ hợp Block" },
  ] },
  { code: "VH", label: "Vận Hành", cats: [
    { code: "CN", label: "Chức năng", desc: "Vận hành chạy thử chức năng" },
  ] },
];

// Danh sách mã chủng loại theo Mã CV đang chọn (rỗng nếu Mã CV không có chủng loại con, vd GEN/GH).
export const categoriesOf = (workCode: string): WorkCategory[] =>
  WORK_CATALOG.find((w) => w.code === workCode)?.cats ?? [];

export const workCodeLabel = (code: string): string =>
  WORK_CATALOG.find((w) => w.code === code)?.label ?? code;

export const categoryLabel = (workCode: string, catCode: string): string =>
  categoriesOf(workCode).find((c) => c.code === catCode)?.label ?? catCode;
