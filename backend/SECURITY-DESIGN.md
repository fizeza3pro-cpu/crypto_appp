# Crypto App — thiết kế bảo mật và định dạng tệp

## Phạm vi và mô hình đe dọa

Web React gọi Flask/Waitress trên loopback; C gọi trực tiếp libcrypto/OpenSSL 3.
Tệp và khóa được gửi từ trình duyệt đến backend **trên cùng máy**, không phải mật mã chạy trong trình duyệt.
Ứng dụng nhằm bảo vệ nội dung tệp bị lấy cắp, phát hiện bản mã/tài liệu bị sửa, và gửi tệp cho người giữ khóa riêng.
Không bảo vệ trước máy đã bị chiếm quyền, keylogger, XSS đang chạy cùng origin, hoặc người đã có bản rõ.
Không có tài khoản, cloud storage, dịch vụ gửi email, PKI/CA, dấu thời gian tin cậy hay chứng nhận FIPS.

## Các module

- `native/crypto.c`: mã hóa mật khẩu, PBKDF2/scrypt, xác thực, private staging và xuất bản nguyên tử không ghi đè.
- `native/advanced.c`: khóa RSA, fingerprint, RSA-OAEP + AES-GCM, RSA-PSS, hash.
- `native/benchmark.c`: bộ đo trong RAM và KDF với đồng hồ monotonic.
- `cryptoweb/operations.py`: giới hạn/kiểm tra multipart, worker có timeout, tải tệp, rekey, inspect, thử giả mạo.
- `cryptoweb/catalog.py`: ánh xạ ID cipher suite và thông số. Frontend lấy danh sách khả dụng từ worker đang chạy.

## API mở rộng

Các POST đều cần session cookie, `X-CSRF-Token`, Origin hợp lệ và multipart/form-data (kể cả form không có tệp).
Trường khóa/file là upload, trường mật khẩu/thuật toán là text. Không truyền đường dẫn máy người dùng vào API.

| POST `/api/v1/…` | Trường | Kết quả |
|---|---|---|
| `crypto/encrypt` | file, password, algorithm, kdf (pbkdf2/scrypt) | Bản mã |
| `crypto/decrypt` | file, password | Bản rõ sau xác thực |
| `crypto/rekey` | file, password, new_password, algorithm, kdf | Bản mã mới |
| `crypto/hybrid/encrypt` | file, public_key | CGHYBRD1 |
| `crypto/hybrid/decrypt` | file, private_key, password | Bản rõ sau xác thực |
| `keys/generate` | password >=12 ký tự | JSON public PEM, encrypted private PEM, fingerprint |
| `keys/inspect` | public_key (chỉ một SPKI PEM) | JSON public PEM, fingerprint, bits |
| `signatures/sign` | file, private_key, password | Chữ ký RSA-PSS thô |
| `signatures/verify` | file, public_key, signature | JSON valid, fingerprint, giới hạn danh tính/timestamp |
| `tools/hash` | file, algorithm (sha256/sha512/sha3-256) | JSON digest |
| `crypto/inspect` | file | JSON header, authenticated=false |
| `tools/tamper-test` | file, password | JSON baseline và từng biến thể bị sửa |
| `crypto/benchmark/core` | file | Mẫu encrypt/decrypt trong RAM |
| `crypto/benchmark/kdf` | password | Mẫu dẫn xuất khóa |

Tải xuống trả octet-stream và Content-Disposition Unicode an toàn. JSON/API luôn no-store.
Việc lưu public key vào danh bạ diễn ra tại frontend sau khi backend kiểm tra, không lưu private key vào localStorage.

## Mã hóa bằng mật khẩu

Các suite: AES-256-GCM (ID 1), AES-256-CBC + HMAC-SHA256 (2), AES-128-GCM (3), ChaCha20-Poly1305 (4).
AEAD dùng nonce 12 byte và tag 16 byte; CBC dùng IV 16 byte và HMAC 32 byte.
PBKDF2-HMAC-SHA256 mặc định 600.000 vòng. scrypt cố định N=32768, r=8, p=1, maxmem=64 MiB.
Đầu ra KDF 64 byte: khóa mã hóa từ phần đầu, khóa HMAC độc lập từ 32 byte sau (chỉ suite CBC dùng).
Salt 16 byte và nonce/IV mới từ `RAND_bytes` mỗi lần mã hóa.
Header nằm trong AAD hoặc Encrypt-then-MAC; CBC kiểm tra MAC trước giải mã và kiểm tra lại lượt đọc thứ hai.
Không công bố plaintext nếu xác thực thất bại. File tạm plaintext có thể tồn tại trong khi xử lý; được xóa theo phạm vi job.

### CGCRYPT1 (giữ nguyên tương thích cũ)

52 byte header, suite 1/2 và PBKDF2. Reader chấp nhận 200.000–2.000.000 vòng.
Hai suite cũ với PBKDF2 tiếp tục tạo định dạng này để không phá reader cũ.

### CGCRYPT2

| Offset | Số byte | Nội dung |
|---|---:|---|
| 0 | 8 | ASCII `CGCRYPT2` |
| 8 | 1 | Version 2 |
| 9 | 1 | Suite 1–4 |
| 10 | 1 | KDF: 1 PBKDF2, 2 scrypt |
| 11 | 1 | Reserved=0 |
| 12 | 4 | Big-endian: số vòng PBKDF2 hoặc scrypt N |
| 16 | 16 | Salt |
| 32 | 16 | IV hoặc nonce 12 byte rồi 4 byte 0 |
| 48 | 1 | Độ dài tag |
| 49 | 1 | Độ dài IV/nonce |
| 50 | 2 | Reserved=0 |
| 52 | biến đổi | Ciphertext rồi tag |

V2 chỉ chấp nhận N=32768 với scrypt (r=8,p=1 được cố định bởi version); không cấp phát theo tham số tùy ý từ header.
PBKDF2 vẫn giới hạn 200.000–2.000.000 vòng. Không tự fallback sang thuật toán/KDF khác khi lỗi xác thực.
`inspect` chỉ đọc header, trả `authenticated:false`, không phải kết quả kiểm chứng bản mã.

## Khóa và mã hóa cho người nhận

Tạo RSA 3072 bit. Nhập khóa RSA 2048–4096 bit; tệp PEM giới hạn 16 KiB.
Public: SubjectPublicKeyInfo PEM. Private: **encrypted PKCS#8** PBES2/AES-256-CBC/PBKDF2-HMAC-SHA256, salt 16 byte, 600.000 vòng.
Không chấp nhận khóa riêng rõ hoặc hỏi mật khẩu tương tác. Mật khẩu đi qua frame stdin, không qua argv/env.
Fingerprint = SHA-256 của SPKI DER, biểu diễn 64 ký tự hex. Tên trong danh bạ là nhãn do người dùng đặt, không xác nhận danh tính.
Danh bạ localStorage phiên bản 1 chỉ chứa public PEM, tên và fingerprint. Encrypted private PEM chỉ giữ trong bộ nhớ trang tạo khóa để tải về, bị bỏ khi rời tab đó.
Không cam kết zeroize mọi bản sao mật khẩu/khóa trong JavaScript, Python hoặc RAM của hệ điều hành.

### CGHYBRD1 — một người nhận

DEK 32 byte ngẫu nhiên; RSA-OAEP SHA256 và MGF1-SHA256, OAEP label rỗng, bọc DEK.
AES-256-GCM mã hóa nội dung; nonce 12 byte mới. **Header và wrapped DEK đều là AAD.**

| Offset | Số byte | Nội dung |
|---|---:|---|
| 0 | 8 | ASCII `CGHYBRD1` |
| 8 | 1 | Version 1 |
| 9 | 1 | Suite 1: RSA-OAEP-SHA256 + AES-256-GCM |
| 10 | 2 | Reserved=0 |
| 12 | 4 | Wrapped DEK length, big-endian |
| 16 | 32 | Fingerprint người nhận |
| 48 | 12 | Nonce |
| 60 | 4 | Reserved=0 |
| 64 | 256/384/512 | Wrapped DEK theo độ dài RSA |
| tiếp theo | biến đổi | Ciphertext |
| cuối | 16 | GCM tag |

Reader đối chiếu wraplen với kích thước RSA thực tế trước giải bọc, kiểm tra DEK đúng 32 byte.
Fingerprint và kích thước tệp lộ công khai; tên tệp không nằm trong container (tên tải xuống mang tính tiện ích).
Mã hóa cho Bình không chứng minh ai là người gửi; mọi người có public key của Bình đều có thể mã hóa cho Bình.
Mã hóa lai này không có forward secrecy và không phải chuẩn CMS/HPKE. Định dạng riêng có đặc tả để kiểm thử, chưa phải giao thức đã qua audit độc lập.

## Chữ ký

RSA-PSS-SHA256, MGF1-SHA256, salt đúng 32 byte. Xử lý hash theo luồng.
`.sig` là chữ ký RSA thô dài đúng số byte modulus, không có JSON header hay timestamp.
Tài liệu giữ nguyên, chữ ký tách rời. Dùng public key để xác minh. Tài liệu/chữ ký/khóa không khớp trả `valid:false`.
Không khẳng định nguyên nhân cụ thể, danh tính pháp lý hay thời điểm ký.
Kết quả luôn có `identity_verified:false` và `trusted_timestamp:false`.
Không nhúng PAdES vào PDF; không dùng Ed25519ph hay tự băm rồi gọi là Ed25519 thông thường.

Kiểm tra độc lập:

```powershell
openssl dgst -sha256 -verify crypto-public.pem -signature report.pdf.sig -sigopt rsa_padding_mode:pss -sigopt rsa_pss_saltlen:32 -sigopt rsa_mgf1_md:sha256 report.pdf
```

## Benchmark

1. `/crypto/benchmark`: wall clock toàn native process, gồm PBKDF2, I/O, startup, ciphertext. 1–3 lượt, không bỏ warm-up. 4 suite.
2. `/crypto/benchmark/core`: đọc tối đa 16 MiB vào RAM trước đo; 1 warm-up và 3 lượt/suite, mã hóa và giải mã. Gồm context init/update/final, padding, tag/MAC; không gồm I/O, startup, KDF, RNG, cấp phát, đóng gói container. Mọi lượt giải mã được đối chiếu byte với đầu vào ngoài vùng tính giờ.
3. `/crypto/benchmark/kdf`: PBKDF2 và scrypt, cùng mật khẩu/salt/64 byte đầu ra; 1 warm-up, 3 lượt. Không đo RAM đỉnh; `max_memory_bytes` là giới hạn cấu hình.

Thứ tự đảo mỗi vòng, báo mẫu đo/trung vị/độ lệch chuẩn. Đây là đo trên máy cụ thể; không suy ra mức an toàn từ thời gian, ciphertext entropy hay tên thuật toán.

## Tệp tạm và giới hạn

Hai slot dùng chung; native timeout 120s cho chuỗi thao tác. Dữ liệu multipart stream vào thư mục job riêng.
File tải về giữ slot đến lúc response đóng. Có giới hạn riêng: public/private key 16 KiB, chữ ký 1 KiB, lab/core 16 MiB, file thường mặc định 256 MiB.
Rekey tạo plaintext tạm rồi bản mã mới, không ghi đè bản mã cũ. Batch frontend chạy tuần tự tối đa 20 tệp.
“Ngừng chờ” hủy truyền nhận phía trình duyệt và bỏ hàng đợi, không hứa kill ngay native worker đang chạy.
Không có progress % giả cho giai đoạn mã hóa. Upload/download dùng số byte thật; xử lý native là trạng thái không xác định %.
Dọn tệp là xóa thông thường, không bảo đảm xóa vật lý khỏi SSD. Crash/OS kill có thể để lại tệp tạm.

## Kiểm thử và phần tiếp theo

`tests/test_expanded.py` có round-trip, dữ liệu bị sửa, giới hạn KDF, khóa sai, xác minh chéo với CLI OpenSSL, hash chuẩn, API cleanup và benchmark.
Kiểm thử CLI dùng tên PEM ASCII vì một số lệnh OpenSSL trên Windows xử lý tên Unicode không đồng nhất; worker dùng UTF-8/Win32 wide path.
Các bộ test này không thay thế audit, fuzzing lâu dài hoặc đánh giá side-channel.

Chưa có trong lần mở rộng này: Ed25519, HMAC như công cụ riêng, manifest nhiều tệp, CMS/PKI/X.509, combined sign-and-encrypt, native cancellation/progress IPC, PQC, đóng dấu thời gian, fuzzing/ASan CI đa nền tảng.
Không bật legacy provider để tăng số thuật toán. Không thêm DES/RC4/ECB vào luồng bảo vệ tệp.

Tham khảo: [RSA OAEP](https://docs.openssl.org/3.5/man7/EVP_ASYM_CIPHER-RSA/), [scrypt](https://docs.openssl.org/3.5/man7/EVP_KDF-SCRYPT/), [PKCS8](https://docs.openssl.org/3.5/man3/PKCS8_encrypt/).
