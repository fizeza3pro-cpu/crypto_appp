import LogoLoop, { type LogoLoopItem } from "./LogoLoop/LogoLoop";
import "../social-proof.css";

const technologies = [
  ["openssl", "OpenSSL"],
  ["react", "React"],
  ["python", "Python"],
  ["flask", "Flask"],
  ["tailwindcss", "Tailwind CSS"],
  ["c", "C"],
].map(([slug, title]) => ({
  node: (
    <span className="sp-brand">
      {slug !== "openssl" ? (
        <img
          src={`/images/technologies/${slug}.svg`}
          width="31"
          height="31"
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <strong>{title}</strong>
    </span>
  ),
  title,
}));

const feedback = [
  {
    role: "Lê Quang Huy",
    avatar: "/images/avatars/user-01.webp",
    text: "Phần mềm quá tốt so với kỳ vọng của tôi, việc mã hoá và giải mã khiến tôi cảm thấy rất thích thú! từ giờ tôi sẽ mã hoá mọi thứ.",
  },
  {
    role: "Đoàn Minh Tuất",
    avatar: "/images/avatars/user-02.webp",
    text: "Nhờ có phần mềm mã hoá, tôi có thể mã hoá đống bài tập và gửi cho thầy cô! Như thế có thể bảo đảm bảo mật, ko sợ kẻ gian sửa đổi.",
  },
  {
    role: "Long Hồ",
    avatar: "/images/avatars/user-03.webp",
    text: "Tiếc rằng phần mềm chỉ có giới hạn mã hoá, nếu không tôi sẽ mã hoá cả tập tài liệu học tập 50gb của mình để bảo đám an toàn.",
  },
];

const reviewItems = feedback.map((item, index) => ({
  node: (
    <figure className="sp-card">
      <blockquote>{item.text}</blockquote>
      <figcaption>
        <img
          className={`sp-avatar-${index + 1}`}
          src={item.avatar}
          width="44"
          height="44"
          alt="Ảnh đại diện do người dùng cung cấp"
          loading="lazy"
          decoding="async"
        />
        <span>
          <strong>{item.role}</strong>
          <small>Lớp Công nghệ thông tin 1</small>
        </span>
      </figcaption>
    </figure>
  ),
  title: item.role,
}));
const renderReview = (item: LogoLoopItem) => item.node;

export default function FeedbackCarousel() {
  return (
    <section className="sp-section" aria-labelledby="feedback-title" data-reveal="social-proof">
      <div className="sp-heading lp-container">
        <h2 id="feedback-title">Góc nhìn từ người sử dụng.</h2>
        <p>
          Từ mã hóa tài liệu đến kiểm chứng dữ liệu. Những trải nghiệm gần với
          công việc hằng ngày.
        </p>
      </div>
      <p className="sp-technology-label">
        Công nghệ trong ứng dụng, không phải danh sách khách hàng hay đối tác.
      </p>
      <div className="sp-logo-reveal"><LogoLoop
        logos={technologies}
        speed={55}
        direction="left"
        logoHeight={30}
        gap={70}
        hoverSpeed={0}
        fadeOut
        fadeOutWidth={0.12}
        ariaLabel="Công nghệ được sử dụng trong Crypto App"
        className="sp-logos"
      /></div>
      <div className="sp-review-reveal"><LogoLoop
        logos={reviewItems}
        renderItem={renderReview}
        speed={34}
        direction="right"
        logoHeight={16}
        gap={20}
        hoverSpeed={0}
        fadeOut
        fadeOutWidth={0.08}
        ariaLabel="Bình luận minh họa về Crypto App"
        className="sp-reviews"
      /></div>
    </section>
  );
}
