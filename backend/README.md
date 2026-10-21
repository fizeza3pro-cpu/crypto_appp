# Crypto App — backend web

## Bản mở rộng A/B/C

Đã có 4 suite mã hóa, PBKDF2/scrypt, RSA-OAEP + AES-GCM cho người nhận,
RSA-PSS ký/xác minh, encrypted PKCS#8 keygen/import public PEM/fingerprint,
hash, đọc header, rekey, thử nghiệm giả mạo và 3 chế độ benchmark.
Xem [đặc tả và giới hạn](SECURITY-DESIGN.md), [kịch bản demo](DEMO.md).
Các mục mô tả v1 bên dưới vẫn áp dụng cho định dạng CGCRYPT1 cũ; V2 và API mới được đặc tả trong SECURITY-DESIGN.md.

Backend cho website mã hóa file, chạy trên Windows tại `D:\LTWWEB\phanmemmahoa\backend`.
Flask cung cấp API; chương trình C gọi trực tiếp OpenSSL 3 để mã hóa và giải mã.
Frontend React/Tailwind nằm trong `../frontend`. Backend phục vụ bản build
`../frontend/dist` cùng origin với API; không có giao diện GTK hay bộ cài desktop.

## Chạy ngay trên máy hiện tại

GCC, OpenSSL và môi trường Python `.venv` đã được chuẩn bị trên máy này.
Mở PowerShell:

```powershell
cd D:\LTWWEB\phanmemmahoa\backend
.\start.ps1
```

Nếu chính sách PowerShell chặn script, có thể gọi trực tiếp:

```powershell
.\.venv\bin\python.exe run.py
```

API chạy tại `http://127.0.0.1:8080`. Kiểm tra:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
```

Kết quả phải có `status: ok` và `native_ready: true`. Dừng bằng `Ctrl+C`.
Trang `/` phục vụ landing page, `/workspace` phục vụ trang công cụ riêng,
`/workspace?tab=benchmark` mở trực tiếp tab so sánh. Build frontend bằng `npm.cmd run build`.
Có thể chạy `..\start-web.ps1` từ thư mục dự án để build và khởi động toàn bộ web.

## Chuẩn bị lại môi trường Windows nếu cần

Máy hiện tại sử dụng Python và GCC của MSYS2 UCRT64. Tạo môi trường và biên dịch:

```powershell
C:\msys64\ucrt64\bin\python.exe -m venv .venv
.\.venv\bin\python.exe -m pip install -r requirements-dev.txt
.\.venv\bin\python.exe scripts\build.py
```

Nếu dùng Python Windows thông thường, thay `.venv\bin\python.exe` bằng
`.venv\Scripts\python.exe`. Script `start.ps1` tự tìm cả hai vị trí.
Compiler và các DLL OpenSSL phải có trên PATH. Không chép `.venv` giữa máy khác nhau;
hãy tạo lại từ requirements. Không cần GTK.

## API

Tất cả URL dưới đây bắt đầu bằng `/api/v1`.

| Phương thức | Đường dẫn | Công dụng |
| --- | --- | --- |
| GET | `/health` | Kiểm tra backend và file thực thi C |
| GET | `/session` | Tạo phiên và trả `csrf_token` |
| GET | `/capabilities` | Thuật toán, KDF, giới hạn file |
| GET | `/plans` | Danh mục Free/Plus/Pro cho landing page |
| GET | `/testimonials` | Phản hồi người dùng đã xác nhận; hiện là danh sách trống |
| POST | `/crypto/encrypt` | Mã hóa và trả file tải xuống |
| POST | `/crypto/decrypt` | Giải mã và trả file tải xuống |
| POST | `/crypto/benchmark` | Đo hai thuật toán trên cùng một tệp; trả JSON |

### Gửi file từ frontend

Frontend production chạy cùng origin với backend. Chưa bật CORS cho các website khác.
Vite dev server đã có proxy cho hai origin cục bộ cổng 5173. Không bỏ kiểm tra
Origin/CSRF để xử lý lỗi kết nối.

1. Gọi `GET /api/v1/session`, giữ cookie và lấy `csrf_token`.
2. Gửi `multipart/form-data` với header `X-CSRF-Token`.
3. Trường `file`: đúng một file. Trường `password`: mật khẩu UTF-8, không rỗng, tối đa 1024 byte.
4. Khi mã hóa, có thể thêm `algorithm`: `aes-256-gcm` (mặc định) hoặc
   `aes-256-cbc-hmac-sha256`. Khi giải mã, bỏ trường algorithm: thuật toán được đọc từ file.
5. Thành công trả `application/octet-stream`, `Content-Length` và
   `Content-Disposition: attachment` kèm tên file UTF-8.
6. Thất bại trả JSON, không trả file giải mã một phần.

Ví dụ phần gọi API của frontend tương lai:

```javascript
const { csrf_token } = await fetch('/api/v1/session', {
  credentials: 'same-origin'
}).then(r => r.json());

const body = new FormData();
body.append('file', selectedFile);
body.append('password', password);
body.append('algorithm', 'aes-256-gcm');

const response = await fetch('/api/v1/crypto/encrypt', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'X-CSRF-Token': csrf_token },
  body
});
if (!response.ok) {
  throw new Error((await response.json()).error.message);
}
// File kết quả nằm trong response.body. Nối luồng tải xuống ở frontend.
// Không tự đặt Content-Type: trình duyệt phải thêm multipart boundary.
```

Giải mã dùng endpoint `/crypto/decrypt` và không gửi trường algorithm.

### So sánh hiệu năng

`POST /api/v1/crypto/benchmark` cũng yêu cầu cookie phiên, Origin và CSRF như
mã hóa. Multipart gồm `file`, `password`, `runs` (1–3, mặc định 3); không gửi
`algorithm` vì luôn đo cả GCM và CBC+HMAC. Giới hạn tệp là giá trị nhỏ hơn giữa
64 MiB và giới hạn mã hóa; từ chối tệp rỗng. Hai thuật toán chạy tuần tự, đảo thứ
tự sau mỗi vòng, salt/IV mới mỗi lần; không loại lượt làm nóng.

Đồng hồ `time.perf_counter()` bao quanh `subprocess.run` của native worker:
gồm khởi chạy tiến trình, PBKDF2, mã hóa/xác thực và đọc/ghi tệp; không gồm
upload/download HTTP, sao chép upload vào đầu vào hoặc xóa đầu ra sau đo.
Đây không phải benchmark AES thuần, không đo RAM/CPU và không cam kết kết quả
ổn định giữa máy/lần chạy. Caching ổ đĩa và tải nền có thể ảnh hưởng kết quả.

JSON trả từng lượt (ms), trung vị, trung bình, min/max, độ lệch chuẩn quần thể,
MiB/s tính theo tệp gốc / trung vị, dung lượng đầu ra, overhead và thông số
khóa/salt/IV/tag/KDF. Bản mã thử nghiệm được xóa sau mỗi lượt, không trả xuống.
Không ghi tên tệp người dùng hoặc mật khẩu vào báo cáo backend. Hạn native 120
giây áp dụng cho toàn bộ chuỗi phép đo, dùng chung giới hạn tác vụ với mã hóa.
Ngắt kết nối phía trình duyệt không bảo đảm dừng ngay worker đang chạy.

Lỗi có dạng:

```json
{"error":{"code":"authentication_failed","message":"Mật khẩu sai hoặc tệp đã bị thay đổi/hỏng."}}
```

Mã HTTP chính: 400 dữ liệu không hợp lệ; 403 Origin/CSRF; 413 quá dung lượng;
415 sai kiểu upload; 422 sai mật khẩu/file mã hóa hỏng; 429 đang bận;
503 module hoặc lưu trữ không sẵn sàng; 504 quá thời gian xử lý.

## Mã hóa và lưu file

- AES-256-GCM mặc định, tag 16 byte. Header được xác thực bằng AAD.
- AES-256-CBC sử dụng Encrypt-then-MAC với HMAC-SHA256, tag 32 byte.
  Khóa AES và khóa HMAC riêng biệt. Xác thực trước khi giải mã và kiểm tra lại
  dữ liệu của lượt đọc thứ hai trước khi công bố kết quả.
- PBKDF2-HMAC-SHA256, 600.000 vòng, dẫn xuất 64 byte. Salt ngẫu nhiên 16 byte;
  nonce GCM 12 byte hoặc IV CBC 16 byte, được tạo mới bằng RAND_bytes.
- Mật khẩu truyền từ API sang C qua stdin có khung độ dài, không qua command line,
  biến môi trường hoặc file. Chương trình C xóa vùng nhớ khóa và mật khẩu khi xong.
  Python và trình duyệt có thể tạo các bản sao chuỗi trong RAM; không tuyên bố
  có thể xóa sạch mọi bản sao mật khẩu khỏi các môi trường này.
- Đọc/ghi theo khối 64 KiB. Native worker ghi file tạm rồi công bố nguyên tử,
  không ghi đè file đã tồn tại. API không sử dụng tên upload làm đường dẫn.
- File upload và kết quả chỉ được giữ trong thư mục tạm riêng của yêu cầu.
  Khi tải xong hoặc client ngắt tải, response đóng và dữ liệu tạm được xóa.
  Nếu tiến trình hoặc máy bị tắt đột ngột, hệ điều hành có thể còn file tạm.
  Xóa file là xóa thông thường, không phải cam kết xóa vật lý khỏi SSD.

Giới hạn mặc định: 256 MiB cho file gốc; file mã hóa được thêm tối đa 100 byte
để file ở đúng giới hạn vẫn giải mã được. Tối đa hai tác vụ/tải kết quả đồng thời,
120 giây xử lý native mỗi yêu cầu. Có thể điều chỉnh trước khi chạy:

```powershell
$env:CRYPTO_PORT = '8080'
$env:CRYPTO_MAX_FILE_MB = '256'
.\start.ps1
```

`CRYPTO_TEMP_DIR` có thể trỏ tới thư mục tạm riêng đã tồn tại.
Server dùng Waitress, chỉ lắng nghe 127.0.0.1, không bật debug.
Không triển khai bản local này lên Internet: chưa có tài khoản, phân quyền,
thanh toán hoặc cấu hình vận hành dịch vụ công khai.

## Định dạng file CGCRYPT1

| Byte | Nội dung |
| --- | --- |
| 0–7 | Magic ASCII `CGCRYPT1` |
| 8 | Version 1 |
| 9 | Thuật toán: 1 GCM, 2 CBC+HMAC |
| 10–11 | Dự phòng, bằng 0 |
| 12–15 | Số vòng PBKDF2, uint32 big-endian |
| 16–31 | Salt 16 byte |
| 32–47 | IV 16 byte; GCM dùng 12 byte đầu và bốn byte 0 |
| 48 | Độ dài tag: 16 hoặc 32 |
| 49 | Độ dài IV/nonce: 12 hoặc 16 |
| 50–51 | Dự phòng, bằng 0 |
| 52 trở đi | Ciphertext rồi tag |

Đọc chấp nhận số vòng PBKDF2 từ 200.000 đến 2.000.000 để tránh file độc hại
yêu cầu quá nhiều CPU. Tương thích định dạng CGCRYPT1 của ví dụ trước với
200.000 vòng, không tương thích ciphertext thô hoặc định dạng `openssl enc`.
Bài kiểm tra có file CBC 200.000 vòng được tạo độc lập để kiểm chứng.

Native CLI là chi tiết triển khai của API:

```text
crypto-cli.exe encrypt aes-256-gcm INPUT OUTPUT
crypto-cli.exe decrypt INPUT OUTPUT
```

stdin: 4 byte độ dài big-endian rồi đúng số byte mật khẩu. Exit code:
0 thành công; 2 tham số/file không hợp lệ; 3 xác thực thất bại; 4 I/O; 5 OpenSSL/nội bộ.

## Gói đăng ký và phản hồi

Free/Plus/Pro trong `/plans` vẫn là bản nháp nội dung của landing page;
`illustrative: true`, `subscriptions_enabled: false`. Chưa có chọn gói thực tế,
thu tiền, tính năng theo thuê bao hay giới hạn khác nhau giữa các gói.
`/testimonials` trả danh sách trống cho tới khi có phản hồi thật được duyệt.

## Kiểm tra

```powershell
.\.venv\bin\python.exe -m pytest -q
```

Bộ kiểm tra dùng native binary thật, gồm hai thuật toán, file rỗng/nhị phân,
ranh giới buffer, tên tiếng Việt, mật khẩu Unicode, sai mật khẩu, sửa header/
ciphertext/tag, cắt file, không ghi đè/hard link, giới hạn upload, CSRF/Origin,
timeout, ngắt tải xuống và luồng HTTP thật qua Waitress.

Nguồn tham khảo API:
- OpenSSL EVP: https://docs.openssl.org/3.5/man3/EVP_EncryptInit/
- OpenSSL MAC: https://docs.openssl.org/3.5/man3/EVP_MAC/
- Flask upload/security: https://flask.palletsprojects.com/en/stable/web-security/
