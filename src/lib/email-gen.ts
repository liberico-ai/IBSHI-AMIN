// Sinh email công ty theo tên: <tên><chữ đầu họ+đệm>@ibs.com.vn
//   Phạm Trường Sơn  → sonpt@ibs.com.vn
//   Nguyễn Thanh Tùng → tungnt@ibs.com.vn
export const EMAIL_DOMAIN = "ibs.com.vn";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
}

// Phần local của email (chưa gồm @domain). Trả "" nếu tên rỗng.
export function emailLocalFromName(fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const given = normalize(parts[parts.length - 1]);            // tên (từ cuối)
  const initials = parts.slice(0, -1).map((p) => normalize(p)[0] || "").join(""); // chữ đầu họ + đệm
  return `${given}${initials}`;
}

// Email đầy đủ, đảm bảo không trùng: thử local@domain, nếu trùng thì local2@, local3@...
// isTaken(email) trả true nếu email đã có người khác dùng.
export async function uniqueCompanyEmail(fullName: string, isTaken: (email: string) => Promise<boolean>): Promise<string> {
  const local = emailLocalFromName(fullName) || "nv";
  let candidate = `${local}@${EMAIL_DOMAIN}`;
  let i = 1;
  while (await isTaken(candidate)) {
    i += 1;
    candidate = `${local}${i}@${EMAIL_DOMAIN}`;
  }
  return candidate;
}
