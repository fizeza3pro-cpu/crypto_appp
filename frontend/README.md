# Crypto App — React + Tailwind CSS

Frontend tiếng Việt với landing page GradientASCII, hero căn giữa, nút pill,
thư viện công cụ và carousel phản hồi gần tràn ngang.
Palette navy #031130, xanh #185DF1 và chữ #F3F7FE theo mẫu người dùng.
Gradient xanh phủ toàn khung màn hình đầu tiên (100svh), bao gồm vùng navigation;
cuộn xuống là các phần nội dung thông thường, không scroll lock/pin/snap.
Trang `/workspace` dùng cùng theme navy–xanh, mã hóa/giải mã thật qua C/OpenSSL.

## Mở toàn bộ phần mềm

Trong PowerShell:

```powershell
cd D:\LTWWEB\phanmemmahoa
.\start-web.ps1
```

Mở `http://127.0.0.1:8080`. Script build React và dùng backend hiện có;
nếu backend chưa chạy, script khởi động backend. Nhấn Ctrl+C ở cửa sổ chạy
backend để dừng. Trường hợp chính sách PowerShell chặn script, chạy riêng:

```powershell
cd D:\LTWWEB\phanmemmahoa\frontend
npm.cmd ci
npm.cmd run build
cd ..\backend
.\.venv\bin\python.exe run.py
```

Nếu venv dùng Python Windows thông thường, đường dẫn Python là
`.venv\Scripts\python.exe` thay cho `.venv\bin\python.exe` của MSYS2 trên máy hiện tại.

## Khi phát triển giao diện

Giữ backend ở cổng 8080, rồi mở Terminal khác:

```powershell
cd D:\LTWWEB\phanmemmahoa\frontend
npm.cmd run dev
```

Mở `http://127.0.0.1:5173`. Vite chuyển tiếp `/api` tới backend và dịch đúng
Origin của hai địa chỉ dev cục bộ được cho phép, không tắt kiểm tra CSRF/Origin.
Các Origin khác vẫn bị từ chối. `npm run preview` chỉ xem bản tĩnh, không phải
lệnh chạy đầy đủ API; dùng cổng 8080 để kiểm tra bản production.

## Nội dung và hành vi

- Landing page: hero chữ căn giữa, không có vật thể 3D; background GradientASCII
  JS-CSS chính thức từ React Bits, thanh công nghệ OpenSSL/AES-256/PBKDF2/cục bộ.
  Animation từng chữ giữ nguyên keyframes, duration và stagger. Thư viện công cụ
  lọc theo nhóm, ba bước sử dụng, giải thích bảo mật, phản hồi minh họa, ba gói,
  FAQ dùng details/summary và lời mời bắt đầu. Không lấy ảnh, logo hay mã từ HorizonX.
- Theme xanh được đồng bộ giữa landing, workspace, benchmark và dialog;
  chỉ thay màu ở workspace/benchmark, không thay quy trình hoặc logic xử lý file.
  Nút Giải mã trong thư viện mở `/workspace?operation=decrypt` đúng thao tác.
- Các nút Mở ứng dụng điều hướng tới trang `/workspace`, không mở popup.
  Tab Mã hóa & giải mã hỗ trợ cả hai thuật toán của backend.
- Tab So sánh thuật toán có URL trực tiếp `/workspace?tab=benchmark`: cùng một
  tệp, cùng mật khẩu, 1–3 lượt / thuật toán; đo mã hóa thật bằng C/OpenSSL.
  Hiển thị trung vị, trung bình, min/max, độ lệch chuẩn, MiB/s, dung lượng đầu ra,
  overhead, khóa, salt, IV/nonce và tag; có xuất báo cáo JSON.
  Thời gian gồm khởi chạy tiến trình, PBKDF2 và I/O, không gồm HTTP; không phải
  tốc độ AES thuần. Không có số liệu giả lập hay phần trăm tiến trình đo giả.
- Kéo thả hoặc chọn tệp, hiện/ẩn mật khẩu, lỗi inline, tiến trình upload/download
  đo thực tế. Giai đoạn OpenSSL xử lý dùng trạng thái không có phần trăm giả.
- Kết quả là Blob của trình duyệt và được tải bằng nút Tải tệp. Không đọc file
  đầu vào thành ArrayBuffer trong JavaScript. Object URL được thu hồi khi bỏ kết quả.
  Trình duyệt có thể giữ Blob kết quả trong bộ nhớ/đĩa tạm theo cách triển khai của nó.
- Không lưu mật khẩu vào localStorage, sessionStorage hoặc lịch sử thao tác.
- Các dialog hướng dẫn/gói đăng ký hỗ trợ focus trap/Escape. Workspace là trang
  riêng: hai tab hỗ trợ phím mũi tên/Home/End, giữ kết quả khi đổi tab, khóa chuyển
  tab khi đang chạy và cảnh báo nếu rời trang giữa tác vụ. Ngừng chờ benchmark
  chỉ ngắt nhận kết quả; backend có thể vẫn hoàn tất rồi dọn tệp tạm.
- Scroll reveal dùng một IntersectionObserver và GSAP, tạo timeline khi khối sắp hiện,
  không đọc style/khởi tạo animation của toàn trang trong lần tải đầu. Chạy một lần với 8 kiểu:
  wipe tiêu đề, fan công cụ, nhịp ba bước, khối bảo mật split, spotlight carousel,
  zoom bảng giá, FAQ trượt ngang và closing focus. Không dùng chung fade-in-up.
  GSAP điều phối transform/clip-path/opacity; tôn trọng prefers-reduced-motion.
  Cuộn tự nhiên, không ghim màn hình hoặc chặn cuộn.
- Hoạt ảnh mở trang được đối chiếu với clip người dùng: chữ xuất hiện lần lượt
  từ dưới vùng cắt, sau đó nội dung/nút xuất hiện. Không còn vật thể 3D.
  Ký tự tiêu đề dùng Web Animations API với keyframe tường minh để tránh đọc style
  đồng bộ cho từng ký tự; GSAP điều phối các khối còn lại. Chờ font cục bộ tối đa
  800 ms; không cập nhật React state mỗi frame.
  Bỏ animation khi prefers-reduced-motion, và hiện ngay nếu người dùng focus
  vào vùng hero. Thanh thông báo đen phía trên navigation đã được bỏ hoàn toàn.
- Font Be Vietnam Pro được đóng gói cục bộ, không tải Google Fonts khi truy cập.
- Workspace lazy-load; dữ liệu capabilities và plans tải song song.
- Navigation kính navy bán trong suốt, blur 10px, cao 58px, sticky sát top: 0.
  Liên kết/trạng thái chọn dùng HTML/CSS, không particle, canvas hay vòng lặp JS.
  GooeyNav đã cài được giữ trong source nhưng không còn import vào landing.
- GradientASCII cài qua shadcn CLI, mount ngay cùng headline, không chờ intro;
  DPR mặc định
  theo thiết bị (tối đa 2 như upstream). Dừng vẽ khi ra khỏi
  màn hình hoặc tab bị ẩn. Reduced motion chỉ dùng nền CSS, không tạo WebGL.
  Giữ nguyên cấu hình horizon, palette, characters, cellSize 18 và density 0.8
  người dùng cung cấp. Canvas phủ toàn viewport đầu, không mask/lớp phủ/cắt nền.
  Hero không tải poster hay bundle cảnh 3D. Các file cảnh cũ vẫn được giữ trong
  source để không xóa tài sản dự án, nhưng không nằm trong module graph của build.
  Nền CSS vẫn hiển thị khi WebGL không được hỗ trợ; CTA luôn là liên kết HTML.
- Các gói Plus/Pro vẫn là minh họa, nút chọn gói giải thích rõ chưa mở thanh toán.
  Phản hồi mẫu được ghi rõ chưa phải đánh giá thực tế.
- Carousel phản hồi rộng tối đa 1760px, ảnh đại diện SVG nguyên bản đóng gói cục bộ,
  chữ lớn, nút trước/sau, chọn trực tiếp, phím trái/phải và swipe ngang.
  Tự chuyển mỗi 4000 ms khi nhìn thấy; tạm dừng khi hover, ra khỏi màn hình hoặc tab ẩn.
  Focus bàn phím dừng tự chuyển cho đến khi người dùng bật lại. Có nút tạm dừng;
  reduced motion tắt tự chuyển và bỏ hiệu ứng lướt, vẫn dùng nút thủ công được.
  Slide không hiện được aria-hidden/inert; tự chuyển không phát thông báo live liên tục.

## Mã nguồn

```text
src/
  App.tsx                    Chọn trang, tải capabilities/plans và dialog hướng dẫn
  styles.css                 Tailwind v4, hệ màu, responsive và motion
  landing.css                Theme navy–xanh, hero 100svh và carousel rộng
  assets/avatar-*.svg         Ảnh đại diện minh họa, không phải khách hàng thật
  components/
    LandingPage.tsx          Landing, thư viện lọc, FAQ và bảng giá
    FeedbackCarousel.tsx     Carousel 4 giây, điều hướng và hỗ trợ tiếp cận
    HeroBackground.tsx       Background ASCII chạy cùng chữ và reduced motion
    GradientASCII/           Mã nguồn JSX/CSS React Bits và cầu nối TypeScript
    HeroVisual.tsx           Cảnh cũ lưu lại, không còn dùng trong landing
    VaultScene.tsx           Cảnh 3D cũ lưu lại, không còn nằm trong bản build
    AppWorkspace.tsx         Giao diện xử lý file thật
    WorkspacePage.tsx        Trang riêng với hai tab công cụ
    BenchmarkPanel.tsx       Thiết lập và đối chiếu phép đo thực tế
    DialogShell.tsx          Dialog dùng chung và quản lý focus
    Icon.tsx                 Icon SVG và logo
  hooks/useReveal.ts         8 kiểu GSAP, lazy-init qua IntersectionObserver
  hooks/useHeroEntrance.ts   Chuỗi animation mở trang, hỗ trợ reduced motion
  lib/api.ts                 Kết nối API, CSRF và tiến trình truyền file
```

Build kiểm tra cả TypeScript: `npm.cmd run build`.
Ảnh và dữ liệu kiểm tra trình duyệt đặt ở `output/playwright/`, không nằm trong bản web.
