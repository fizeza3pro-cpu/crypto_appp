import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Icon } from './components/Icon'
import DialogShell from './components/DialogShell'
import WorkspaceBoundary from './components/WorkspaceBoundary'
import { defaultCapabilities, getJson } from './lib/api'
import type { Plan } from './lib/api'
import LandingPage from './components/LandingPage'

const WorkspacePage = lazy(() => import('./components/WorkspacePage'))
const preloadWorkspace = () => { void import('./components/WorkspacePage').catch(() => undefined) }
const draftPlans: Plan[] = [
  { id: 'free', name: 'Free', price: 0, featured: false, features: ['Mã hóa và giải mã tệp', 'AES-256 với OpenSSL', 'Xử lý cục bộ'] },
  { id: 'plus', name: 'Plus', price: 99000, featured: true, features: ['Mọi tính năng của Free', 'Xử lý nhiều tệp (dự kiến)', 'Lưu tùy chọn (dự kiến)'] },
  { id: 'pro', name: 'Pro', price: 199000, featured: false, features: ['Mọi tính năng của Plus', 'Tùy chỉnh quy trình (dự kiến)', 'Hỗ trợ ưu tiên (dự kiến)'] },
]
function Guide({ onClose }: { onClose: () => void }) {
  return <DialogShell title="Hướng dẫn sử dụng" subtitle="Một vài điều cần biết trước khi bắt đầu." onClose={onClose}>
    <div className="guide-content">
      <section><h3><Icon name="lock" />Mã hóa tệp</h3><ol><li>Chọn “Mở ứng dụng” và chuyển sang Mã hóa.</li><li>Chọn tệp trên máy, chọn thuật toán và đặt mật khẩu.</li><li>Nhấn “Mã hóa tệp”, sau đó tải tệp .enc về máy.</li></ol></section>
      <section><h3><Icon name="unlock" />Khôi phục tệp</h3><ol><li>Chuyển sang Giải mã và chọn tệp .enc do Crypto App tạo.</li><li>Nhập đúng mật khẩu đã dùng. Thuật toán được nhận diện tự động.</li><li>Tải tệp được khôi phục. Tệp đầu vào luôn được giữ nguyên.</li></ol></section>
      <section><h3><Icon name="key" />Gửi tệp bằng khóa công khai</h3><ol><li>Người nhận tạo cặp khóa trong tab Quản lý khóa và giữ khóa riêng có mật khẩu.</li><li>Người gửi chọn phương thức “Bằng khóa người nhận”, nhập public PEM và đối chiếu fingerprint.</li><li>Mã hóa, tải bản mã rồi gửi qua kênh bạn chọn. Người nhận dùng private PEM và mật khẩu khóa riêng để giải mã.</li></ol></section>
      <section><h3><Icon name="shield" />Ký và xác minh tài liệu</h3><ol><li>Chữ ký số → Ký tệp: chọn tài liệu và khóa riêng, tải tệp .sig.</li><li>Xác minh: chọn tài liệu, .sig và khóa công khai của người ký.</li><li>Đối chiếu fingerprint để xác nhận chủ sở hữu khóa. Chữ ký không giấu nội dung và không có dấu thời gian tin cậy.</li></ol></section>
      <div className="guide-note"><Icon name="info" /><p>Giữ mật khẩu và khóa riêng ở nơi an toàn. Ứng dụng không có chức năng khôi phục mật khẩu hoặc khóa riêng bị mất. Danh bạ trình duyệt chỉ lưu khóa công khai.</p></div>
      <p className="text-muted text-sm leading-7">Web gọi dịch vụ C/OpenSSL chạy cục bộ trên máy này. Không hỗ trợ giải mã các định dạng .enc khác chỉ dựa vào phần mở rộng. Gói Plus và Pro hiện là thiết kế dự kiến, chưa mở thanh toán.</p>
      <a className="button button-primary w-full" href="/workspace">Mở không gian mã hóa<Icon name="arrow" size={18} /></a>
    </div>
  </DialogShell>
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  const [plans, setPlans] = useState(draftPlans)
  const [capabilities, setCapabilities] = useState(defaultCapabilities)
  const [offline, setOffline] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  useEffect(() => {
    const update = () => {
      if (window.location.hash === '#ung-dung') { window.location.replace('/workspace'); return }
      setHash(window.location.hash)
    }
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.allSettled([
      getJson<typeof defaultCapabilities>('capabilities', controller.signal),
      getJson<{ items: Plan[] }>('plans', controller.signal),
    ]).then(([capabilityResult, planResult]) => {
      if (controller.signal.aborted) return
      if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value)
      else setOffline(true)
      if (planResult.status === 'fulfilled' && planResult.value.items.length) setPlans(planResult.value.items)
    })
    return () => controller.abort()
  }, [])
  const closeRoute = useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setHash('')
  }, [])
  if (window.location.pathname === '/workspace' || window.location.pathname === '/workspace/') {
    return <WorkspaceBoundary><Suspense fallback={<main className="page-loading" role="status"><Icon name="spinner" className="spinner" />Đang mở không gian mã hóa…</main>}><WorkspacePage capabilities={capabilities} offline={offline} /></Suspense></WorkspaceBoundary>
  }
  return <div className="landing-page">
    <LandingPage plans={plans} offline={offline} onSelectPlan={setSelectedPlan} preloadWorkspace={preloadWorkspace} />
    {hash === '#huong-dan' ? <Guide onClose={closeRoute} /> : selectedPlan ? <DialogShell title={`Gói ${selectedPlan.name} đang được hoàn thiện`} subtitle="Cảm ơn bạn đã quan tâm đến Crypto App." onClose={() => setSelectedPlan(null)}><div className="guide-content"><div className="plan-interest-icon"><Icon name="shield" size={34} /></div><p className="leading-8 text-muted">Giá và quyền lợi hiện là nội dung minh họa cho thiết kế. Chúng tôi chưa mở đăng ký hoặc thu phí cho gói này.</p><p className="leading-8">Bạn vẫn có thể sử dụng tính năng mã hóa và giải mã hiện tại miễn phí.</p><a className="button button-primary w-full" href="/workspace" onClick={() => setSelectedPlan(null)}>Bắt đầu miễn phí<Icon name="arrow" size={18} /></a></div></DialogShell> : null}
  </div>
}
