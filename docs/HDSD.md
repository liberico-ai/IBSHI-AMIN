# HƯỚNG DẪN SỬ DỤNG

## Cập nhật Bảng công & Tính lương — IBS-ONE

---

## Quy trình mỗi tháng (5 phút)

```
① Nhận file bảng công Excel từ khách
② Vào hệ thống → Import file vào Bảng công
③ Vào Lương → Tạo kỳ → Bấm "Tính lương"
④ Xuất Excel + Phiếu lương PDF gửi NV
```

Chỉ 4 bước. Không cần báo IT.

---

## A. Cập nhật Bảng công

**Vào**: Menu trái → **Chấm công** → tab **Bảng công T`<X>`/`<năm>`**.

**Bảng chia 2 khối**: 🏢 Gián tiếp (văn phòng) — 🏭 Trực tiếp (sản xuất).

**Import:**

1. Bấm **⬆ Import Excel** ở góc phải mỗi khối.
2. Chọn file Excel khách gửi → **Open**.
3. Chờ 5–10 giây → hiện thông báo:
   - ✅ "Đã import X bản ghi" = OK.
   - ⚠️ "Bỏ qua Y bản ghi (mã NV không tìm thấy)" = có NV chưa có trong hệ thống → cần tạo NV mới.

**Kiểm tra**: kiểm tra Tổng HC + Thêm giờ của 5 NV mẫu → khớp file Excel khách → OK.

**Sửa thủ công** (nếu cần): click vào ô → nhập lại → Enter.

---

## B. Tính lương kỳ mới

**Trước khi tính**: chỉ cần đảm bảo **đã import bảng công**.

> 💡 **KPI thoả thuận** đã được lưu cố định trong hợp đồng của từng NV. Hệ thống tự tính **Lương hiệu suất (KPI thực)** = `KPI thoả thuận ÷ 26 × ngày công`.
>
> KPI thoả thuận chỉ thay đổi khi NV ký hợp đồng mới hoặc có quyết định mới — không thay đổi theo tháng.

**Các bước:**

1. Menu trái → **Lương** → bấm **+ Tạo kỳ lương mới**.
2. Chọn **tháng + năm** → bấm **Tạo kỳ**.
3. Mở kỳ vừa tạo → bấm **🧮 Tính lương** → chờ 10–30 giây.
4. **Kiểm tra**: xem vài NV mẫu, đặc biệt NV nghỉ phép nhiều / OT nhiều.
5. **Xuất**:
   - **⬇ Export Excel** = bảng tổng cho cấp trên/khách.
   - **PDF** (cuối mỗi dòng) = phiếu lương cá nhân cho từng NV.

**Tính lại** (nếu thấy sai): sửa Bảng công → quay lại Lương → bấm **🧮 Tính lại lương**.

**Lưu ý**: HR phải **cộng tay** 2 khoản sau (hệ thống không có):
- Lương sản phẩm / khoán (khối Trực tiếp).
- Bổ sung / Điều chỉnh kỳ (thưởng đột xuất, trừ lỗi, ...).

---

## Câu hỏi thường gặp

| Vấn đề | Cách xử lý |
|---|---|
| Số ngày công lệch vài ngày vs file khách | Sửa thủ công trong Bảng công (click ô → nhập lại). |
| Số ngày công lệch nhiều ở rất nhiều NV | Báo IT import lại bảng công. |
| Lương 1 NV thấp hơn kỳ vọng | Kiểm tra: ngày công của NV đó trong Bảng công có đúng không? Nếu đúng → kiểm tra KPI thoả thuận trong HĐ của NV (Hồ sơ nhân sự → tab Hợp đồng). |
| NV mới ký HĐ → KPI thoả thuận mới | Vào Hồ sơ nhân sự → tab Hợp đồng → sửa "KPI" trong HĐ ACTIVE. |
| NV có Gross = 0 | NV chưa có hợp đồng. Vào Hồ sơ nhân sự → Thêm HĐ → quay lại Tính lại lương. |
| BHXH lệch ~20tr vs file khách | Hợp lý, không phải lỗi. Hệ thống tính BHXH theo công thức cho tất cả NV; file khách dùng số thực thu (NV mới chưa thu tháng đầu). |
| Bấm nút hiện "Loading chunk failed" | Bấm `Ctrl+Shift+R` (tải lại trang). Vẫn lỗi → báo IT. |
| Tổng Gross bất thường (gấp đôi, quá cao) | **Báo IT ngay**, đừng xuất hay gửi lương. |

---

## Mã chấm công thường gặp

| Mã | Ý nghĩa | Đếm ngày công |
|---|---|---|
| `x` | Đi làm cả ngày | +1 |
| `x/2` | Đi làm nửa ngày | +0.5 |
| `al` | Nghỉ phép năm | +1 (có lương) |
| `al/2` | Nghỉ phép nửa ngày | +0.5 (có lương) |
| `l` | Nghỉ lễ | +1 (có lương) |
| `sl` / `co` / `mt` | Nghỉ ốm / con ốm / thai sản | +1 (qua BHXH) |
| `cl` / `ml` / `wl` | Nghỉ hiếu / kết hôn / hỷ | +1 (có lương) |
| `ct` | Đi công tác | +1 |
| `ul` / `ul/2` | Nghỉ không phép | 0 (không lương) |
| (trống) | Không có dữ liệu | 0 |

---

**Liên hệ hỗ trợ:** Lỗi kỹ thuật → **bộ phận IT** (Liberico AI).
