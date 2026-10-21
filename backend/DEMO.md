# Kịch bản nghiệm thu A/B/C

Mở `http://localhost:5173/workspace` khi đang phát triển, hoặc `http://127.0.0.1:8080/workspace` khi backend phục vụ frontend build.
Khởi chạy đầy đủ từ thư mục dự án bằng `./start-web.ps1`; không cần GTK/Kali.
Nếu PowerShell chặn script, dùng `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-web.ps1` từ thư mục dự án; tùy chọn này chỉ áp dụng cho tiến trình được khởi chạy, không thay đổi policy hệ thống.

## A — Mật khẩu và toàn vẹn

1. Tạo tài liệu mẫu `report.txt`, thêm vài dòng nội dung.
2. Mã hóa tệp → Bằng mật khẩu → chọn tài liệu, đặt và xác nhận mật khẩu.
3. Cấu hình nâng cao: thử ChaCha20-Poly1305 và scrypt; tải `.enc`.
4. Giải mã bằng mật khẩu → tải kết quả, so sánh nội dung.
5. Mã hóa lại cùng tài liệu/mật khẩu: hai bản mã khác nhau do salt và nonce mới.
6. Kiểm chứng → Đọc thông số: trình bày salt, nonce, KDF; nhấn mạnh header chưa xác thực.
7. Kiểm chứng → Thử nghiệm giả mạo: chọn `.enc` và mật khẩu đúng; bản gốc xác thực thành công, bốn biến thể header/ciphertext/tag/truncate bị từ chối và không xuất plaintext.
8. Đổi mật khẩu: tạo bản mã mới; mật khẩu mới mở được, mật khẩu cũ không mở được bản mới. Bản cũ vẫn tồn tại.
9. Thử hàng đợi hai tệp, tải từng kết quả; lỗi một tệp không làm mất kết quả tệp khác.

## B — An gửi cho Bình

1. Bình → Quản lý khóa → tạo cặp khóa bằng mật khẩu >=12 ký tự.
2. Tải public PEM và encrypted private PEM, để riêng. Có thể tạo thêm cặp khác cho ký số.
3. Bình chỉ gửi public PEM cho An; đối chiếu fingerprint qua một kênh tin cậy.
4. An → Mã hóa tệp → Bằng khóa người nhận → chọn tài liệu/public PEM, xác nhận fingerprint → mã hóa.
5. An tải `.enc` rồi tự gửi bằng email/USB. App không tự gửi email.
6. Bình → Giải mã → Bằng khóa người nhận → chọn bản mã, private PEM và mật khẩu khóa riêng.
7. Khôi phục đúng nội dung. Dùng cặp khóa khác hoặc mật khẩu sai: thất bại.
8. Giải thích: AES-GCM bảo vệ tệp; RSA-OAEP bảo vệ DEK. Không dùng RSA trực tiếp cho video/tệp lớn.

## C — Ký và kiểm tra tài liệu

1. Chữ ký số → Ký tệp → chọn tài liệu, encrypted private PEM và mật khẩu.
2. Tải `.sig`; giữ tài liệu gốc nguyên vẹn.
3. Xác minh → tài liệu + `.sig` + public PEM → chữ ký hợp lệ với fingerprint này.
4. Sửa một chữ trong tài liệu, dùng lại chữ ký cũ → không hợp lệ.
5. Thử public key khác → không hợp lệ.
6. Xuất JSON kiểm tra. Thời điểm trong báo cáo là lúc kiểm tra, không phải dấu thời gian ký tin cậy.
7. Trình bày việc xác nhận danh tính phụ thuộc xác nhận public key, không phụ thuộc tên bạn đặt trong danh bạ.
8. Chạy lệnh `openssl dgst` trong SECURITY-DESIGN.md để chứng minh tương thích độc lập.

## Hiệu năng

- Benchmark → Toàn quy trình: số đo người dùng thực sự chờ, gồm KDF/I/O/startup.
- Mật mã trong RAM: đo riêng cipher + tag/MAC, cả encrypt/decrypt, kiểm tra round-trip.
- KDF: đo PBKDF2 và scrypt riêng. Không gọi RAM cấu hình là RAM đã đo.
- Dùng file cỡ 1 MiB hoặc 8 MiB, giảm tải nền, xuất JSON. Không tuyên bố thuật toán nhanh nhất luôn an toàn nhất.

## Kiểm thử lại

```powershell
cd D:\LTWWEB\phanmemmahoa\backend
$env:PATH = 'C:\msys64\ucrt64\bin;' + $env:PATH
.\.venv\bin\python.exe scripts\build.py
.\.venv\bin\python.exe -m pytest -q --basetemp=build/pytest-demo -o cache_dir=build/pytest-cache
```

Các khóa/tài liệu trong test được tạo cho kiểm thử, không dùng làm khóa thật.
