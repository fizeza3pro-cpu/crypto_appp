import { useEffect, useState } from "react";
import { Brand, Icon } from "./Icon";
import type { Plan } from "../lib/api";
import { useReveal } from "../hooks/useReveal";
import { useHeroEntrance } from "../hooks/useHeroEntrance";
import HeroBackground from "./HeroBackground";
import FeedbackCarousel from "./FeedbackCarousel";
import LandingCapabilities from "./LandingCapabilities";
import "../landing.css";

const currency = new Intl.NumberFormat("vi-VN");
const navigationItems = [
  { label: "Khám phá", href: "#tinh-nang" },
  { label: "Cách hoạt động", href: "#cach-hoat-dong" },
  { label: "Benchmark", href: "/workspace?tab=benchmark" },
  { label: "Bảng giá", href: "#bang-gia" },
  { label: "Tài liệu", href: "#huong-dan" },
];
const faqs = [
  {
    question: "Tệp của tôi được xử lý ở đâu?",
    answer:
      "Trình duyệt gửi tệp tới backend C/OpenSSL đang chạy trên chính máy của bạn. Bản web cục bộ này không gửi tệp tới dịch vụ đám mây và không được thiết kế để triển khai công khai lên Internet.",
  },
  {
    question: "Tôi có thể mã hóa những loại tệp nào?",
    answer:
      "Ảnh, video, tài liệu, tệp nén hoặc bất kỳ loại tệp nào, trong giới hạn dung lượng mà không gian mã hóa hiển thị. Mã hóa toàn bộ tệp tạo ra tệp .enc; muốn xem lại nội dung, bạn cần giải mã bằng đúng mật khẩu.",
  },
  {
    question: "Nếu quên mật khẩu thì sao?",
    answer:
      "Bạn quên mật khẩu thì chúng tôi cũng bó tay! tốt nhất hãy lưu mật khẩu vào đâu đó sau khi tạo.",
  },
  {
    question: "Hai thuật toán khác nhau như thế nào?",
    answer:
      "AES-256-GCM tích hợp mã hóa và xác thực dữ liệu. AES-256-CBC trong ứng dụng được kết hợp với HMAC-SHA256 theo Encrypt-then-MAC, dùng khóa mã hóa và xác thực riêng. Cả hai đều dùng PBKDF2-HMAC-SHA256 cùng salt và IV ngẫu nhiên.",
  },
  {
    question: "Số liệu benchmark có phải giả lập không?",
    answer:
      "Không. Backend thực sự mã hóa cùng một tệp bằng cả hai thuật toán. Thời gian gồm khởi chạy tiến trình, PBKDF2, mã hóa, xác thực và đọc/ghi tệp; không tính truyền HTTP. Đây không phải tốc độ AES thuần và kết quả phụ thuộc cấu hình, bộ nhớ đệm cùng tải máy.",
  },
  {
    question: "Plus và Pro đã mở đăng ký chưa?",
    answer:
      "Chưa. Giá và quyền lợi hiện chỉ là nội dung minh họa cho thiết kế. Không có đăng ký trả phí hay thu tiền; bạn vẫn có thể sử dụng các tính năng mã hóa, giải mã và benchmark hiện tại miễn phí.",
  },
];

function RevealLine({
  text,
  className = "",
  split = true,
}: {
  text: string;
  className?: string;
  split?: boolean;
}) {
  if (!split)
    return (
      <span className={`lp-reveal-line ${className}`} aria-hidden="true">
        {text}
      </span>
    );
  return (
    <span className={`lp-reveal-line ${className}`} aria-hidden="true">
      {text.split(" ").map((word, index) => (
        <span key={`${word}-${index}`}>
          {index ? " " : ""}
          <span className="lp-reveal-word">
            {Array.from(word).map((letter, index) => (
              <span className="lp-reveal-char" key={index}>
                {letter}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function LandingPage({
  plans,
  offline,
  onSelectPlan,
  preloadWorkspace,
}: {
  plans: Plan[];
  offline: boolean;
  onSelectPlan: (plan: Plan) => void;
  preloadWorkspace: () => void;
}) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeHref, setActiveHref] = useState(
    () => window.location.hash || "#tinh-nang",
  );
  const hero = useHeroEntrance();
  const content = useReveal();
  useEffect(() => {
    document.documentElement.classList.add("landing-theme");
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const previous = meta?.content;
    if (meta) meta.content = "#031130";
    const closeMenu = () => {
      setMobileMenu(false);
      setActiveHref(window.location.hash || "#tinh-nang");
    };
    const escapeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("hashchange", closeMenu);
    window.addEventListener("keydown", escapeMenu);
    return () => {
      document.documentElement.classList.remove("landing-theme");
      if (meta && previous) meta.content = previous;
      window.removeEventListener("hashchange", closeMenu);
      window.removeEventListener("keydown", escapeMenu);
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#noi-dung">
        Đến nội dung chính
      </a>
      <HeroBackground />
      <header className="lp-header">
        <div className="lp-nav-shell lp-container">
          <a href="/" className="lp-brand" aria-label="Crypto App — Trang chủ">
            <Brand />
          </a>
          <button
            type="button"
            className="lp-menu-toggle"
            aria-label={mobileMenu ? "Đóng menu" : "Mở menu"}
            aria-expanded={mobileMenu}
            aria-controls="site-navigation"
            onClick={() => setMobileMenu((value) => !value)}
          >
            <Icon name={mobileMenu ? "close" : "menu"} size={21} />
          </button>
          <div
            id="site-navigation"
            className={`lp-navigation ${mobileMenu ? "is-open" : ""}`}
            onClick={(event) => {
              if ((event.target as Element).closest("a")) setMobileMenu(false);
            }}
          >
            <nav className="lp-nav-links" aria-label="Điều hướng chính">
              {navigationItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="lp-nav-link"
                  aria-current={
                    activeHref === item.href ? "location" : undefined
                  }
                  onClick={() => setActiveHref(item.href)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <a
            className="lp-button lp-button-dark lp-nav-cta"
            href="/workspace"
            onMouseEnter={preloadWorkspace}
            onFocus={preloadWorkspace}
          >
            Mở ứng dụng
          </a>
        </div>
      </header>
      <main ref={content} id="noi-dung" tabIndex={-1}>
        <section ref={hero} className="lp-hero lp-container">
          <div className="lp-hero-content">
            <h1
              className="lp-title"
              aria-label="Dữ liệu của bạn. Chỉ bạn giữ chìa khóa."
            >
              <RevealLine
                className="lp-title-line font-semibold"
                text="Crypto App"
              />
              <RevealLine
                className="lp-title-line font-semibold"
                text="Mã hoá theo cách của bạn"
              />
            </h1>
            <div className="lp-hero-description">
              <p className="lp-description-copy">
                <span className="sr-only">
                  Mã hóa ảnh, video và tài liệu với OpenSSL.
                </span>
                <RevealLine
                  split={false}
                  text="Mã hóa ảnh, video và tài liệu với OpenSSL."
                />
                <RevealLine
                  split={false}
                  text="Thao tác đơn giản, dễ dàng sử dụng."
                />
              </p>
              <div className="lp-hero-actions">
                <a
                  className="lp-button lp-button-dark"
                  href="/workspace"
                  onMouseEnter={preloadWorkspace}
                  onFocus={preloadWorkspace}
                >
                  Bắt đầu mã hóa
                  <Icon name="arrow" size={18} />
                </a>
                <a
                  className="lp-button lp-button-plain"
                  href="/workspace?tab=benchmark"
                  onMouseEnter={preloadWorkspace}
                  onFocus={preloadWorkspace}
                >
                  So sánh thuật toán
                </a>
              </div>
              <p className={`lp-local-note ${offline ? "lp-is-offline" : ""}`}>
                {offline ? (
                  <>
                    <Icon name="info" size={14} />
                    Backend chưa kết nối. <a href="#huong-dan">Xem hướng dẫn</a>
                  </>
                ) : (
                  "Không cần tài khoản. Không gửi tệp lên đám mây."
                )}
              </p>
            </div>
          </div>
          <ul className="lp-hero-capabilities" aria-label="Công nghệ mã hóa">
            <li>
              <Icon name="gear" size={25} />
              <span>OpenSSL</span>
            </li>
            <li>
              <Icon name="shield" size={25} />
              <span>AES-256</span>
            </li>
            <li>
              <Icon name="key" size={25} />
              <span>PBKDF2</span>
            </li>
            <li>
              <Icon name="monitor" size={25} />
              <span>Xử lý thông minh</span>
            </li>
          </ul>
          <a
            className="lp-scroll-cue"
            href="#tinh-nang"
            aria-label="Cuộn để khám phá"
          >
            <Icon name="chevron" size={22} />
          </a>
        </section>

        <LandingCapabilities preloadWorkspace={preloadWorkspace} />

        <FeedbackCarousel />

        <section
          id="bang-gia"
          className="lp-section lp-pricing lp-container"
          data-reveal="pricing"
        >
          <div className="lp-centered-heading">
            <h2>Chọn điều phù hợp với bạn.</h2>
            <p>Bắt đầu miễn phí. Các gói trả phí vẫn đang được lên kế hoạch.</p>
          </div>
          <div className="lp-pricing-grid">
            {plans.map((plan) => (
              <article
                className={`lp-price-card ${plan.featured ? "lp-price-featured" : ""}`}
                key={plan.id}
              >
                <div className="lp-plan-title">
                  <h3 translate="no">{plan.name}</h3>
                  {plan.featured ? <span>Đề xuất</span> : null}
                </div>
                <p className="lp-plan-description">
                  {plan.id === "free"
                    ? "Cho tệp cá nhân, mỗi ngày."
                    : plan.id === "plus"
                      ? "Thêm tiện lợi cho công việc."
                      : "Cho những nhu cầu nâng cao."}
                </p>
                <div className="lp-plan-price">
                  <strong>
                    {currency.format(plan.price)}
                    <span>đ</span>
                  </strong>
                  <span>/tháng</span>
                </div>
                <p className="lp-plan-status">
                  {plan.id === "free"
                    ? "Có thể sử dụng ngay"
                    : "Giá dự kiến · chưa mở đăng ký"}
                </p>
                {plan.id === "free" ? (
                  <a className="lp-button lp-button-outline" href="/workspace">
                    Bắt đầu miễn phí
                  </a>
                ) : (
                  <button
                    type="button"
                    className={`lp-button ${plan.featured ? "lp-button-dark" : "lp-button-outline"}`}
                    onClick={() => onSelectPlan(plan)}
                  >
                    Tìm hiểu {plan.name}
                  </button>
                )}
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Icon name="check" size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="lp-pricing-note">
            <Icon name="shield" size={14} />
            Cùng một nền tảng mã hóa. Không phân hạng sự an toàn.
          </p>
        </section>

        <section
          id="cau-hoi"
          className="lp-section lp-faq lp-container"
          data-reveal="accordion"
        >
          <div>
            <h2>
              Điều bạn có thể
              <br />
              đang thắc mắc.
            </h2>
            <p>Một vài câu trả lời trước khi bắt đầu.</p>
            <a className="lp-text-link" href="#huong-dan">
              Đọc hướng dẫn sử dụng
              <Icon name="arrow" size={16} />
            </a>
          </div>
          <div className="lp-faq-list">
            {faqs.map((item) => (
              <details key={item.question} name="crypto-faq">
                <summary>
                  {item.question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-closing lp-container" data-reveal="focus">
          <span className="lp-closing-mark">
            <Icon name="lock" size={29} />
          </span>
          <h2>
            Bảo mật rất quan trọng.
            <br />
            Hãy bắt đầu mã hoá ngay.
          </h2>
          <p>Bắt đầu với tệp đầu tiên. Phần còn lại, cứ để OpenSSL.</p>
          <a
            className="lp-button lp-button-dark"
            href="/workspace"
            onMouseEnter={preloadWorkspace}
            onFocus={preloadWorkspace}
          >
            Mở không gian mã hóa
            <Icon name="arrow" size={16} />
          </a>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div className="lp-footer-main">
          <a
            className="lp-brand"
            href="/"
            aria-label="Crypto App — về đầu trang"
          >
            <Brand />
          </a>
          <p>
            Công cụ nhỏ.
            <br />
            Cho những điều riêng tư lớn.
          </p>
          <nav aria-label="Liên kết cuối trang">
            <a href="#tinh-nang">Khám phá</a>
            <a href="#bang-gia">Bảng giá</a>
            <a href="#huong-dan">Tài liệu</a>
            <a href="/workspace?tab=benchmark">Benchmark</a>
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} Crypto App</span>
          <span>
            <Icon name="lock" size={12} />
            Được xây dựng với C / OpenSSL.
          </span>
          <a href="#noi-dung">Về đầu trang ↑</a>
        </div>
      </footer>
    </>
  );
}
