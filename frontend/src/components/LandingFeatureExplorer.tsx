import { useId, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

type Feature = {
  id: string;
  label: string;
  icon: IconName;
  title: string;
  description: string;
  flow: [string, string, string];
  specs: [string, string][];
  note: string;
  action: string;
  href: string;
};

const features: Feature[] = [
  {
    id: "password",
    label: "Mã hóa tệp",
    icon: "lock",
    title: "Một mật khẩu. Bốn lựa chọn mã hóa.",
    description:
      "Bảo vệ ảnh, video và tài liệu; giải mã hoặc đổi mật khẩu khi cần.",
    flow: ["Chọn tệp", "Đặt mật khẩu", "Tải bản mã"],
    specs: [
      ["Mã hóa có xác thực", "AES-256-GCM · AES-128-GCM · ChaCha20-Poly1305"],
      ["Phương án CBC", "AES-256-CBC + HMAC-SHA256"],
      ["Dẫn xuất khóa", "PBKDF2-SHA256 hoặc scrypt"],
      ["Xử lý tệp", "Hàng đợi nhiều tệp · tự nhận diện khi giải mã"],
    ],
    note: "Salt và IV/nonce ngẫu nhiên cho mỗi bản mã. Không hỗ trợ khôi phục mật khẩu đã mất.",
    action: "Mã hóa tệp",
    href: "/workspace",
  },
  {
    id: "recipient",
    label: "Cho người nhận",
    icon: "key",
    title: "Mã hóa bằng khóa của người nhận.",
    description:
      "Bảo vệ khóa tệp bằng khóa công khai; người nhận mở bằng khóa riêng.",
    flow: ["Chọn khóa công khai", "Mã hóa tệp", "Tải bản mã"],
    specs: [
      ["Mã hóa lai", "RSA-OAEP-SHA256 + AES-256-GCM"],
      ["Tạo cặp khóa", "RSA 3072 bit"],
      ["Khóa riêng", "PEM PKCS#8 được bảo vệ bằng mật khẩu"],
      ["Đối chiếu khóa", "Fingerprint SHA-256 · danh bạ khóa công khai"],
    ],
    note: "Đối chiếu fingerprint qua kênh tin cậy. Bạn tự gửi tệp đã tải qua email, USB hoặc kênh khác.",
    action: "Tạo cặp khóa",
    href: "/workspace?tab=keys",
  },
  {
    id: "signature",
    label: "Chữ ký số",
    icon: "shield",
    title: "Ký tài liệu. Xác minh thay đổi.",
    description:
      "Tạo chữ ký riêng cho tệp và kiểm tra bằng khóa công khai tương ứng.",
    flow: ["Tệp + khóa riêng", "Ký tài liệu", "Tải chữ ký .sig"],
    specs: [
      ["Thuật toán", "RSA-PSS-SHA256"],
      ["Định dạng", "Chữ ký tách rời .sig"],
      ["Xác minh", "Tệp gốc + chữ ký + khóa công khai"],
      ["Kết quả", "Trạng thái xác minh · báo cáo JSON"],
    ],
    note: "Chữ ký không giấu nội dung và không tự chứng minh danh tính chủ khóa.",
    action: "Ký và xác minh",
    href: "/workspace?tab=signatures",
  },
  {
    id: "inspection",
    label: "Kiểm tra dữ liệu",
    icon: "eye",
    title: "Đọc thông số. Thử tính toàn vẹn.",
    description:
      "Kiểm tra cấu trúc bản mã, đối chiếu hash và thử sửa dữ liệu trên bản sao.",
    flow: ["Chọn tệp", "Chọn phép kiểm tra", "Xem kết quả"],
    specs: [
      ["Thông số bản mã", "Thuật toán · KDF · salt · IV/nonce"],
      ["Checksum", "SHA-256 · SHA-512 · SHA3-256"],
      ["Thử nghiệm giả mạo", "Sửa header, ciphertext, tag hoặc cắt tệp"],
      ["Cơ chế bảo vệ", "Không công bố bản rõ khi xác thực thất bại"],
    ],
    note: "Đọc header chưa xác thực không chứng minh tệp an toàn. Đối chiếu hash với nguồn tin cậy.",
    action: "Mở bộ kiểm tra",
    href: "/workspace?tab=tools",
  },
  {
    id: "benchmark",
    label: "Benchmark",
    icon: "gear",
    title: "So sánh tốc độ bằng phép đo thật.",
    description:
      "Tách riêng chi phí xử lý tệp, thuật toán mật mã và dẫn xuất khóa trên máy bạn.",
    flow: ["Chọn cấu hình", "Chạy phép đo", "So sánh kết quả"],
    specs: [
      ["Toàn quy trình", "KDF + mã hóa + xác thực + I/O"],
      ["Mật mã trong RAM", "Mã hóa · giải mã · kiểm tra khôi phục"],
      ["Dẫn xuất khóa", "Đo riêng PBKDF2 và scrypt"],
      ["Nguồn số liệu", "Được tạo khi bạn chạy phép đo"],
    ],
    note: "Tốc độ phụ thuộc cấu hình máy và không phải thước đo độ an toàn.",
    action: "Chạy benchmark",
    href: "/workspace?tab=benchmark",
  },
];

export default function LandingFeatureExplorer({
  preloadWorkspace,
}: {
  preloadWorkspace: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  return (
    <section
      id="cach-hoat-dong"
      className="lc-features lp-container"
      aria-labelledby={`${uid}-heading`}
    >
      <div className="lc-feature-explorer" data-reveal="feature-explorer">
        <div className="lc-feature-sidebar">
      <div className="lc-feature-heading">
        <h2 id={`${uid}-heading`}>Từ bảo vệ đến kiểm chứng.</h2>
        {/* <p>Chọn một tính năng để xem cách hoạt động và công nghệ phía sau.</p> */}
      </div>
        <div
          className="lc-feature-tabs"
          role="tablist"
          aria-label="Tính năng chi tiết"
          onKeyDown={(event) => {
            if (
              ![
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Home",
                "End",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? features.length - 1
                  : (selected +
                      (["ArrowDown", "ArrowRight"].includes(event.key)
                        ? 1
                        : features.length - 1)) %
                    features.length;
            setSelected(next);
            buttons.current[next]?.focus();
          }}
        >
          {features.map((feature, index) => (
            <button
              key={feature.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${feature.id}`}
              aria-controls={`${uid}-panel-${feature.id}`}
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
            >
              <Icon name={feature.icon} size={20} />
              <span>{feature.label}</span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
        </div>
        </div>
        <div className="lc-feature-stage">
          {features.map((feature, index) => (
            <div
              key={feature.id}
              role="tabpanel"
              className="lc-feature-panel"
              hidden={selected !== index}
              id={`${uid}-panel-${feature.id}`}
              aria-labelledby={`${uid}-tab-${feature.id}`}
              tabIndex={0}
            >
              <h3>{feature.title}</h3>
              <p className="lc-feature-description">{feature.description}</p>
              <ol className="lc-feature-flow" aria-label="Quy trình sử dụng">
                {feature.flow.map((step, stepIndex) => (
                  <li key={step}>
                    <span>{step}</span>
                    {stepIndex < feature.flow.length - 1 ? (
                      <Icon name="arrow" size={16} />
                    ) : null}
                  </li>
                ))}
              </ol>
              <dl className="lc-feature-specs">
                {feature.specs.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="lc-feature-note">
                <Icon name="info" size={16} />
                <span>{feature.note}</span>
              </p>
              <a
                href={feature.href}
                className="lc-action"
                onMouseEnter={preloadWorkspace}
                onFocus={preloadWorkspace}
              >
                {feature.action}
                <Icon name="arrow" size={17} />
              </a>
            </div>
          ))}
          <figure className="lc-feature-photo">
            <img
              src="/images/landing/security-analyst.jpg"
              width="384"
              height="640"
              loading="lazy"
              decoding="async"
              alt="Người kiểm tra dữ liệu trước các màn hình máy tính, ảnh minh họa"
            />
          </figure>
        </div>
      </div>
    </section>
  );
}
