import LandingFeatureExplorer from "./LandingFeatureExplorer";
import "../landing-capabilities.css";

export default function LandingCapabilities({
  preloadWorkspace,
}: {
  preloadWorkspace: () => void;
}) {
  return (
    <div className="lc-root">
      <section
        id="tinh-nang"
        className="lc-overview lp-container"
        aria-labelledby="lc-overview-title"
      >
        <div className="lc-overview-copy" data-reveal="cap-copy">
          <h2 id="lc-overview-title">
            Bảo vệ tệp.
            <br />
            Kiểm chứng dữ liệu.
          </h2>
          <p>
            Mã hóa bằng mật khẩu, gửi cho người nhận bằng khóa công khai, và ký
            tài liệu. Mọi thao tác chạy bằng OpenSSL trên backend cục bộ.
          </p>
        </div>
        <figure className="lc-lock-photo" data-reveal="cap-image">
          <img
            src="/images/landing/security-lock.webp"
            width="1200"
            height="660"
            alt="Ổ khóa trên mạch điện tử với ánh sáng xanh, minh họa bảo vệ dữ liệu"
            loading="lazy"
            decoding="async"
          />
        </figure>
        <dl className="lc-capability-facts" data-reveal="cap-list">
          <div>
            <dt>Đa dạng thuật toán mã hóa</dt>
            <dd>AES-GCM, ChaCha20-Poly1305, CBC + HMAC</dd>
          </div>
          <div>
            <dt>Cách trao quyền linh hoạt</dt>
            <dd>Mật khẩu riêng hoặc key của người nhận</dd>
          </div>
          <div>
            <dt>Mang yếu tố xác thực</dt>
            <dd>Chữ ký số, hash và thử nghiệm giả mạo</dd>
          </div>
        </dl>
      </section>

      <LandingFeatureExplorer preloadWorkspace={preloadWorkspace} />

      <section
        id="bao-mat"
        className="lc-foundation"
        aria-labelledby="lc-foundation-title"
      >
        <div className="lp-container lc-foundation-layout">
          <figure className="lc-openssl-photo" data-reveal="image-wipe">
            <img
              src="/images/landing/openssl-library.jpg"
              width="1600"
              height="900"
              loading="lazy"
              decoding="async"
              alt="Logo OpenSSL Library trong không gian máy chủ"
            />
          </figure>
          <div className="lc-foundation-copy" data-reveal="cap-copy">
            <h2 id="lc-foundation-title">Mã hoá bằng OpenSSL </h2>
            <p>
              Giao diện web phía Client kết nối đồng bộ và an toàn với hệ thống
              Backend của dịch vụ. Sử dụng lõi ngôn ngữ C tích hợp công nghệ
              OpenSSL EVP tối tân để xử lý toàn bộ quá trình mã hóa, dẫn xuất
              khóa, tạo chữ ký số và băm dữ liệu.
            </p>
            <dl>
              <div>
                <dt>Thuật Toán Tạo Khóa Độc Bản & Ngẫu Nhiên</dt>
                <dd>
                  Hệ thống áp dụng các tiêu chuẩn băm mật khẩu hàng đầu như
                  PBKDF2 hoặc Scrypt để tạo khóa, bảo vệ toàn vẹn cả nội dung
                  lẫn các thông số dữ liệu quan trọng của người dùng.
                </dd>
              </div>
              <div>
                <dt>Quyền Làm Chủ Khóa Thuộc Về Người Dùng</dt>
                <dd>
                  Khóa riêng tư (Private Key) được xuất dưới dạng tệp PEM và bảo
                  vệ nghiêm ngặt bằng mật khẩu do chính người dùng kiểm soát.
                </dd>
              </div>
              <div>
                <dt> Xác Thực Nghiêm Ngặt Trước Khi Trả Kết Quả</dt>
                <dd>
                  Hệ thống dịch vụ sẽ lập tức từ chối xuất hoặc công bố tệp giải
                  mã nếu phát hiện bất kỳ dấu hiệu nào của việc sai mật khẩu,
                  sai khóa hoặc dữ liệu đã bị can thiệp, thay đổi trên đường
                  truyền.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
