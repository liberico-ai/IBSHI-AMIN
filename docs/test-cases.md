# Kịch bản trải nghiệm hệ thống IBSHI-AMIN

> Tài liệu hướng dẫn người dùng tự kiểm thử các tính năng trên giao diện.
> Mỗi kịch bản gồm: **Mục đích · Tài khoản cần dùng · Các bước · Kết quả mong đợi**.
>
> Chia theo vai trò: **HR/HCNS** · **Trưởng phòng** · **Nhân viên** · **Ban giám đốc**.

---

## 🔑 Tài khoản test (mật khẩu mặc định `123456`)

| Vai trò | Email | Ghi chú |
|---|---|---|
| HR / HCNS | `hatt@ibs.com.vn` | Tài khoản toàn quyền, dùng cho hầu hết các kịch bản |
| Nhân viên (test cá nhân) | Bất kỳ NV nào, vd `toannd@ibs.com.vn` | Test xin nghỉ phép, đăng ký suất ăn |
| Trưởng phòng | 1 NV có role MANAGER bất kỳ | Test duyệt đơn |

**Lưu ý:** Đăng nhập lần đầu sẽ bị yêu cầu **đổi mật khẩu**. Đổi xong dùng mật khẩu mới cho các lần sau.

---

# 👤 PHẦN 1 — Vai trò NHÂN SỰ (HR/HCNS)

## KB-01: Xem & tìm nhân viên

**Mục đích:** Làm quen giao diện M1.

**Các bước:**
1. Đăng nhập tài khoản HR.
2. Vào menu trái → **M1 — Hồ sơ nhân sự**.
3. Quan sát: bảng hiển thị danh sách CBNV với cột Mã NV, Họ tên, Phòng ban, Chức vụ, Loại HĐ, Trạng thái, Thiếu TT.
4. Bấm vào **3 tab** ở trên: *Tất cả nhân sự* → *Chưa cập nhật thông tin* → *Sắp hết hạn HĐ*. Để ý số đếm trong từng tab.
5. Thử các bộ lọc: chọn 1 **phòng ban**, đổi **trạng thái**.
6. Gõ vào ô **Tìm kiếm**: "Tạ Thanh D" hoặc "190823".

**Kỳ vọng:**
- Tab "Sắp hết hạn HĐ" có danh sách NV với cảnh báo đỏ "Còn N ngày".
- Bộ lọc + search hoạt động tức thì, không reload trang.
- Tìm thấy NV theo cả mã lẫn tên.

---

## KB-02: Mở hồ sơ chi tiết 1 nhân viên

**Mục đích:** Xem & sửa thông tin cá nhân.

**Các bước:**
1. Tại M1, bấm **Xem** trên dòng *Đồng Thị Hới (190823)*.
2. Quan sát góc phải-trên — có thẻ **"Ngày phép còn"** (chỉ NV Đang làm mới có).
3. Bấm 4 tab: *Thông tin cá nhân* → *Hợp đồng* → *Chứng chỉ* → *Lịch sử công tác*.
4. Bấm **"Sửa thông tin"** ở góc phải. Sửa địa chỉ → bấm **Lưu**.
5. Refresh trang — kiểm tra địa chỉ đã đổi chưa.
6. Vào tab *Thông tin cá nhân* → mục **Người phụ thuộc** → bấm **+ Thêm** → nhập tên người phụ thuộc → Lưu.

**Kỳ vọng:**
- Toàn bộ thông tin hiển thị đầy đủ.
- Sửa & lưu được, F5 thông tin vẫn còn.
- Thêm/xoá người phụ thuộc thành công.

---

## KB-03: Ký hợp đồng mới (gia hạn)

**Mục đích:** Test luồng gia hạn HĐ khi sắp hết hạn.

**Tài khoản:** HR.

**Tiền điều kiện:** NV *Đồng Thị Hới (190823)* có HĐ 12 tháng còn ~18 ngày.

**Các bước:**
1. Vào hồ sơ *Đồng Thị Hới* → tab **Hợp đồng**.
2. Quan sát: cạnh tiêu đề có dòng vàng "HĐ hiện tại còn 18 ngày".
3. Bấm nút đỏ **"Ký hợp đồng mới"** ở góc phải.
4. Modal mở:
   - Số HĐ tự sinh `190823/2026/HĐLĐ/IBS HI` (mờ, không sửa được).
   - Loại HĐ tự chọn *"Có thời hạn 24 tháng"* (bậc tiếp theo từ 12 tháng).
   - Lương cơ bản + Phụ cấp pre-fill từ HĐ cũ.
5. Đổi **Chức vụ** dropdown thành *"Trưởng phòng"* → quan sát ô **Phụ cấp** tự cộng thêm **2.600.000** + xuất hiện dòng nhắc xanh.
6. Sửa lại **Lương cơ bản** (ví dụ tăng thêm 1tr).
7. Nhập **Bậc thợ** (ví dụ "Bậc 5").
8. Bấm **Lưu & ký hợp đồng**.

**Kỳ vọng:**
- HĐ mới (24 tháng) xuất hiện trên đầu danh sách, trạng thái "Đang làm".
- HĐ cũ (12 tháng) tự đổi trạng thái thành **"Đã gia hạn"**.
- Quay lại tab *Thông tin cá nhân* — chức vụ đổi thành *"Trưởng phòng"*, cấp bậc *"Bậc 5"*.

---

## KB-04: Xem hợp đồng + tải Word/PDF

**Mục đích:** Kiểm tra modal xem HĐ & xuất file.

**Các bước:**
1. Tại tab Hợp đồng của bất kỳ NV nào, bấm **"Xem"** trên 1 HĐ.
2. Modal mở hiển thị nội dung HĐ trên giấy trắng (tiêu đề, các điều khoản…).
3. Bấm **Tải PDF** → kiểm tra file tải về mở được, nội dung đúng.
4. Bấm **Tải Word** → kiểm tra file .docx mở được trong MS Word.
5. Nếu HĐ có icon 📎 (đính kèm scan) — cuộn xuống dưới nội dung trong modal sẽ thấy **ảnh/PDF scan hiển thị inline**.

**Kỳ vọng:**
- Nội dung HĐ rõ ràng (tiêu đề căn giữa, các điều khoản đầy đủ).
- File tải xuống đúng định dạng, mở được.
- Nếu có scan, ảnh hiện thẳng dưới nội dung HĐ.

---

## KB-05: Soạn phụ lục hợp đồng

**Mục đích:** Điều chỉnh lương/chức vụ không tạo HĐ mới.

**Các bước:**
1. Vào hồ sơ 1 NV có HĐ đang ACTIVE.
2. Tại tab Hợp đồng → trên dòng HĐ Đang làm, bấm **"+ Phụ lục"** (chữ tím, cạnh nút Xem).
3. Modal mở. Quan sát:
   - Số phụ lục tự sinh `PL01-<số HĐ gốc>`.
   - Ngày hiệu lực mặc định hôm nay (chỉ chọn được ngày trong khoảng HĐ).
4. Form chia 2 cột "hiện tại" và "mới" cho từng trường: Chức vụ, Vị trí, Lương CB, PC nhà xa, PC KPI, PC chức vụ.
5. Đổi ở cột "mới": Lương CB từ 8M → 9M, PC chức vụ từ 0 → 2.6M.
6. Quan sát dòng tổng tự cập nhật "Tổng phụ cấp mới = …".
7. Bấm **Phát hành phụ lục**.

**Kỳ vọng:**
- Phụ lục mới xuất hiện trong section **"📎 Phụ lục hợp đồng"** dưới bảng HĐ.
- Trạng thái "Chờ duyệt" (vàng).
- Tóm tắt thay đổi hiển thị: "Lương CB → 9.000.000 · PC chức vụ → 2.600.000".

---

## KB-06: Duyệt phụ lục & xác nhận đã ký

**Mục đích:** Hoàn tất luồng phụ lục.

**Các bước:**
1. Tại hồ sơ NV vừa tạo phụ lục ở KB-05, trong section "📎 Phụ lục hợp đồng":
2. Bấm **Duyệt** trên dòng phụ lục → confirm.
3. Trạng thái đổi thành **"Đã duyệt — chờ ký"** (xanh), nút **"Xác nhận đã ký"** xuất hiện.
4. Bấm **"Xác nhận đã ký"** → modal upload file mở.
5. Chọn 1 file scan (.pdf hoặc .jpg) → bấm **Xác nhận đã ký**.

**Kỳ vọng:**
- Phụ lục chuyển trạng thái **"Đã ký"** (xanh).
- HĐ gốc tự cập nhật giá trị mới: cột "Lương đóng BHXH" và "Phụ cấp" của HĐ Đang làm hiển thị số mới.
- Quay lại tab *Thông tin cá nhân* — chức vụ đã đổi nếu phụ lục có sửa chức vụ.

---

## KB-07: Test luồng tuyển dụng (UV → NV chính thức)

**Mục đích:** Trải nghiệm full luồng từ thư mời đến NV chính thức.

**Các bước:**
1. Vào **M4 — Tuyển dụng** → tab **Thư mời (Offer)**.
2. Bấm **+ Tạo thư mời** → chọn 1 ứng viên (UV) → điền:
   - Vị trí, Phòng ban
   - Lương cơ bản (vd 8M), PC nhà xa (200k), PC KPI (2.5M), PC chức vụ (0)
   - Quan sát: Tổng lương = 10.7M, Lương thử việc 85% = 9.095k tự tính.
3. Bấm **Lưu** → trạng thái thư mời "Chờ duyệt".
4. (HR) Bấm **Duyệt + gửi UV** → hệ thống sinh PDF, gửi email cho UV.
5. Khi UV đồng ý, bấm **"UV đã chấp nhận"** → modal hiện "Tạo tài khoản NV thành công" với Mã NV mới + email + mật khẩu tạm.
6. Chuyển sang tab **Onboard**.
7. Bấm **"Tạo HĐ thử việc"** → chọn NV vừa tạo → kiểm tra form (lương 85% tự fill, thời hạn 2 tháng) → bấm **Phát hành**.
8. Quan sát khối "HĐ thử việc chờ duyệt" xuất hiện trên cùng tab Onboard → bấm **Duyệt**.
9. Bấm **"Tạo onboarding"** → giờ thấy NV vừa duyệt → chọn → **Tạo**.
10. Mở checklist onboarding → tick các mục (Lý lịch, CCCD, Vân tay).

**Kỳ vọng:**
- Sau mỗi bước, trạng thái cập nhật đúng.
- "Tạo onboarding" chỉ hiện NV đã được duyệt HĐ thử việc.
- Khi onboarding 100% → NV chuyển sang trạng thái "Đang làm".

---

## KB-08: Đánh giá thử việc

**Mục đích:** Test luồng đánh giá sau 2 tháng thử việc.

**Tiền điều kiện:** Có NV đang thử việc và HĐ thử việc còn ≤7 ngày là hết hạn.

**Các bước:**
1. M4 → tab **Đánh giá thử việc**.
2. Bấm **"Tạo đánh giá"**.
3. Modal hiện danh sách NV đủ điều kiện (đã duyệt HĐ TV + còn ≤7 ngày hết hạn).
4. Chọn 1 NV → form 8 tiêu chí + 2 câu Y/N hiện ra.
5. Chấm điểm từng tiêu chí (Excellent/Good/Acceptable/Unacceptable/NA).
6. Quan sát: điểm số + đề xuất loại HĐ chính thức tự tính.
7. Submit → đơn đánh giá tạo, gửi TP HCNS duyệt.

**Kỳ vọng:**
- Chỉ NV đủ điều kiện được hiển thị (KB-08 sẽ thấy rỗng nếu NV thử việc còn nhiều ngày).
- Đề xuất loại HĐ thay đổi theo điểm: ≥9 → Không XĐ; ≥7.5 → 24M; <7.5 → 12M; bị ≥2 Unacceptable → FAIL.

---

## KB-09: Xin nghỉ phép (test ở vai NV)

**Mục đích:** Test quy tắc phép năm + tính ngày.

**Tài khoản:** Login 1 NV ACTIVE bất kỳ.

**Các bước:**
1. Vào **M3 — Chấm công** → **Nghỉ phép** → bấm **+ Tạo đơn nghỉ phép**.
2. Chọn loại nghỉ **"Phép năm"**.
3. Thử các tình huống:
   - Ngày 30/5 → 30/5 (1 ngày).
   - Ngày 30/5 → 31/5 (Chủ Nhật) → kết quả vẫn = 1 ngày.
   - Ngày 30/5 → 1/6 → 2 ngày.
4. Thử xin số ngày **vượt mức** (vd tháng 6 xin 8 ngày phép năm) → bấm Gửi.
5. Sửa lại ngày để khớp mức cho phép → Gửi.

**Kỳ vọng:**
- T7 vẫn tính, CN không tính.
- Vượt mức báo lỗi: *"Số ngày quá quy định. Bạn chỉ được phép nghỉ phép tối đa N ngày."*
- Gửi đúng → status "Chờ duyệt", có badge mã chấm công (AL/SL/UL…).

---

## KB-10: Trưởng phòng duyệt nghỉ phép

**Tài khoản:** Login Trưởng phòng (MANAGER).

**Các bước:**
1. Vào **M3 → Nghỉ phép**.
2. Quan sát: chỉ thấy đơn của NV trong phòng mình.
3. Trên 1 đơn "Chờ duyệt", bấm **Duyệt** (xanh).
4. Trên 1 đơn khác, bấm **Từ chối** (đỏ) → modal hiện ô lý do → nhập → Xác nhận.

**Kỳ vọng:**
- NV được duyệt: quỹ phép tự trừ.
- NV bị từ chối: thấy thông báo trong app + lý do từ chối hiển thị trên dòng đơn.

---

## KB-11: Đăng ký suất ăn

**Tài khoản:** NV (test ở 2 thời điểm khác nhau).

**Các bước:**
1. Vào **M10 → Nhà ăn** → bấm **+ Đăng ký suất ăn**.
2. Chọn phòng ban, ngày *hôm nay*, bữa Trưa, đối tượng Cán bộ nhân viên, SL = 5.
3. Bấm **Đăng ký**.
4. **Lặp lại** với:
   - Đối tượng **Khách** → kiểm tra hiện ô "Giá trị suất ăn (khách)" bắt buộc nhập.
   - Đối tượng **Thầu phụ** → kiểm tra hiện ô "Tên thầu phụ" bắt buộc.
5. Thử đăng ký *hôm nay* sau 9h sáng.

**Kỳ vọng:**
- Trước 9h sáng: đăng ký được.
- Sau 9h sáng: báo lỗi *"Đã quá giờ đăng ký suất ăn (chốt trước 9h sáng)"*.
- Có thể đăng ký *ngày mai* bất cứ lúc nào.

---

## KB-12: Đăng ký suất ăn bổ sung (24/7)

**Các bước:**
1. Bấm nút viền accent **"+ Đăng ký bổ sung"**.
2. Modal giống đăng ký thông thường, có thêm ô **Lý do** bắt buộc.
3. Đăng ký 5 suất bữa tối + lý do "Tăng ca đột xuất".
4. Tab **"Đăng ký bổ sung"** xuất hiện đơn với trạng thái "Chờ duyệt".

**Vai HR:** Vào tab này → bấm **Duyệt** → đơn chuyển "Đã duyệt", chi phí cộng vào tab "Chi phí".

---

## KB-13: Quản lý chi phí mua thực phẩm

**Tài khoản:** HR.

**Các bước:**
1. M10 → Nhà ăn → tab **"Chi phí mua thực phẩm"**.
2. Bấm **"+ Thêm danh sách thực phẩm hôm nay"**.
3. Nhập nhiều dòng: Thịt lợn 23.4kg × 100.000, Tép đồng 5kg × 190.000…
4. Bấm + để thêm dòng mới. Quan sát Thành tiền tự nhân, dòng "Cộng" tự tổng.
5. Bấm **Lưu**.
6. Quan sát ngoài danh sách: nhóm hôm nay hiện ra với bảng đầy đủ.

**Kỳ vọng:**
- Có thể thêm nhiều ngày khác nhau, mỗi ngày 1 bảng.
- Bảng tổng chi phí tháng tự cập nhật ở thẻ trên cùng.

---

## KB-14: VPP — Yêu cầu & cấp phát

**Vai NV:**
1. Vào **M10 → Văn phòng phẩm** → tab **Danh sách VPP**.
2. Bấm **+ Tạo yêu cầu VPP** → modal 2 cột: chọn VPP từ cột trái, nhập số lượng ở cột phải → Lưu.

**Vai HR:**
3. Chuyển sang tab **Danh sách yêu cầu VPP**. Quan sát: yêu cầu của các NV được **cộng dồn** theo VPP.
4. Tích checkbox 1-2 VPP, sửa "Số lượng cấp" (vd có 100 cây bút, chỉ về 50).
5. Bấm **Cấp phát** (cấp chọn lọc).
6. Hoặc bấm **Cấp phát toàn bộ** → confirm.
7. Sang tab **Phiếu xuất VPP** → quan sát: lịch sử cấp phát gom theo ngày, ấn vào ngày xem chi tiết cấp cho ai.

---

## KB-15: Đặt phòng họp

**Các bước:**
1. M10 → **Đặt phòng họp**.
2. Bấm **Đặt phòng** → chọn phòng + ngày + giờ bắt đầu/kết thúc + tiêu đề.
3. Lưu → quan sát slot tô màu trên lịch.
4. Thử đặt slot trùng giờ phòng đó → báo lỗi "Khung đã bận".

---

## KB-16: Đặt xe

**Các bước:**
1. M10 → **Quản lý xe** → **Đặt xe**.
2. Chọn xe, ngày, điểm đi, điểm đến, người sử dụng → Lưu.
3. Quan sát lịch tháng: chuyến hiện thị với màu phòng ban.
4. Thử đặt xe đang bảo trì cùng ngày → báo lỗi.

---

# 👔 PHẦN 2 — Vai trò TRƯỞNG PHÒNG

## KB-20: Duyệt HĐ thử việc & phụ lục

**Tài khoản:** HR_ADMIN/BOM (TP HCNS).

**Các bước:**
1. M4 → Onboard → khối "HĐ thử việc chờ duyệt" — bấm **Duyệt** / **Từ chối**.
2. M1 → hồ sơ NV có phụ lục chờ duyệt → section "📎 Phụ lục hợp đồng" → bấm **Duyệt** / **Từ chối**.
3. M3 → Nghỉ phép → duyệt các đơn (mỗi vai thấy phạm vi khác nhau).

---

# 👔 PHẦN 3 — Vai trò NHÂN VIÊN

## KB-30: Trải nghiệm cá nhân

1. Đăng nhập 1 NV bất kỳ.
2. Vào **M1** → chỉ thấy hồ sơ của mình.
3. Vào **M3 → Nghỉ phép** → tạo đơn (xem KB-09).
4. Vào **M10 → Nhà ăn** → đăng ký suất ăn (xem KB-11).
5. Vào **M10 → VPP** → tạo yêu cầu VPP (xem KB-14).
6. Kiểm tra chuông notification — có thông báo khi đơn được duyệt/từ chối.

---

# 🔍 PHẦN 4 — Các tình huống đặc biệt cần test

## KB-40: HĐ không xác định thời hạn

1. Tìm 1 NV có HĐ "Không xác định".
2. Vào tab Hợp đồng — kiểm tra:
   - Cột "Ngày kết thúc" hiển thị **"—"** (không có ngày).
   - Nút "Ký hợp đồng mới" **mờ** — tooltip "Dùng Ký phụ lục để điều chỉnh".

---

## KB-41: NV thử việc

1. Vào hồ sơ 1 NV trạng thái Thử việc.
2. Kiểm tra:
   - Thẻ "Ngày phép còn" **KHÔNG hiện** (NV thử việc chưa có phép năm).
   - Nếu login bằng tài khoản NV này, vào M3 thử tạo đơn Phép năm → báo lỗi.

---

## KB-42: Tìm NV ngoài 1000 đầu

1. Vào M1 → tìm "Tạ Thanh D" (mã IBS-1139).
2. Hệ thống tải tới 1000 NV → search phải thấy.

**Nếu không thấy** — báo cáo cho IT để tăng limit hoặc thêm pagination.

---

## KB-43: Số HĐ chứa ký tự "Đ"

1. Vào HĐ có số chứa "Đ" (vd `IBS-1139/2026/HĐLĐ/IBS HI`).
2. Bấm Tải PDF / Word.
3. File tải về có tên ASCII (vd `HDLD-IBS-1139_2026_HDLD_IBS_HI.pdf`) — không bị lỗi 500.

---

## KB-44: Phụ lục ngoài khoảng HĐ

1. Mở Soạn phụ lục cho HĐ có ngày BĐ 2026-06-01, KT 2027-06-01.
2. Cố chọn ngày hiệu lực = 2028-01-01.
3. Bấm Phát hành → báo lỗi "Ngày hiệu lực phải trước ngày kết thúc HĐ".

---

# ✅ Checklist UAT tổng

Tick từng kịch bản khi test xong:

- [ ] KB-01 Xem & tìm nhân viên
- [ ] KB-02 Mở hồ sơ chi tiết
- [ ] KB-03 Ký hợp đồng mới
- [ ] KB-04 Xem HĐ + tải Word/PDF
- [ ] KB-05 Soạn phụ lục HĐ
- [ ] KB-06 Duyệt phụ lục & ký
- [ ] KB-07 Luồng tuyển dụng full
- [ ] KB-08 Đánh giá thử việc
- [ ] KB-09 Xin nghỉ phép
- [ ] KB-10 Duyệt nghỉ phép
- [ ] KB-11 Đăng ký suất ăn
- [ ] KB-12 Đăng ký bổ sung
- [ ] KB-13 Chi phí mua thực phẩm
- [ ] KB-14 VPP yêu cầu + cấp phát
- [ ] KB-15 Đặt phòng họp
- [ ] KB-16 Đặt xe
- [ ] KB-20 Duyệt HĐ TV + phụ lục
- [ ] KB-30 Trải nghiệm cá nhân NV
- [ ] KB-40 HĐ Không XĐ
- [ ] KB-41 NV thử việc
- [ ] KB-42 Tìm NV ngoài 1000 đầu
- [ ] KB-43 Số HĐ chứa "Đ"
- [ ] KB-44 Phụ lục ngoài khoảng HĐ

---

## 📝 Mẫu báo cáo lỗi

Nếu gặp lỗi khi test, gửi báo về với mẫu:

```
- Kịch bản: KB-xx (tên)
- Bước phát hiện lỗi: số bước
- Đã làm gì: ...
- Kết quả thực tế: ...
- Kết quả mong đợi: ...
- Ảnh chụp màn hình: (đính kèm)
- Vai trò đăng nhập: HR / NV / TP / ...
- Thời điểm: dd/mm/yyyy hh:mm
```
