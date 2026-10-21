import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AppWorkspace from './AppWorkspace'
import { Brand, Icon } from './Icon'
import { formatBytes } from '../lib/api'
import type { Capabilities } from '../lib/api'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import GooeyNav from './GooeyNav/GooeyNav'
import '../tools.css'
import '../workspace-navigation.css'

gsap.registerPlugin(useGSAP)

const BenchmarkPanel = lazy(() => import('./BenchmarkWorkspace'))
const KeysPanel = lazy(() => import('./KeysPanel'))
const SignaturesPanel = lazy(() => import('./SignaturesPanel'))
const ToolsPanel = lazy(() => import('./ToolsPanel'))
const tabs = [
  { id: 'files', label: 'Mã hóa tệp', icon: 'lock' },
  { id: 'keys', label: 'Quản lý khóa', icon: 'key' },
  { id: 'signatures', label: 'Chữ ký số', icon: 'shield' },
  { id: 'tools', label: 'Kiểm chứng', icon: 'file' },
  { id: 'benchmark', label: 'Benchmark', icon: 'gear' },
] as const
type Tab = typeof tabs[number]['id']
const readTab = (): Tab => tabs.find(item => item.id === new URLSearchParams(window.location.search).get('tab'))?.id ?? 'files'

export default function WorkspacePage({ capabilities, offline }: { capabilities: Capabilities; offline: boolean }) {
  const [tab, setTab] = useState<Tab>(readTab)
  const [visited, setVisited] = useState(tab === 'benchmark')
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('.workspace-title, .workspace-nav', { y: 12, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: .42, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity,visibility' })
    }, root)
    return () => media.revert()
  }, { scope: root })
  useEffect(() => {
    document.title = 'Không gian mã hóa · Crypto App'
    const update = () => { const next = readTab(); setTab(next); if (next === 'benchmark') setVisited(true) }
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  function selectTab(next: Tab) {
    if (busy) return
    setTab(next)
    if (next === 'benchmark') setVisited(true)
    const url = new URL(window.location.href)
    if (next !== 'files') url.searchParams.set('tab', next)
    else url.searchParams.delete('tab')
    window.history.replaceState(null, '', url)
  }

  return <div ref={root} className="workspace-page">
    <a className="skip-link" href="#workspace-main">Đến nội dung chính</a>
    <header className="workspace-header"><div className="workspace-container workspace-header-inner">
      <a href="/" className="brand-link" aria-label="Crypto App — Trang chủ"><Brand /></a>
      <div className="workspace-header-links"><span className="local-chip"><span className="status-dot" />Chế độ cục bộ</span><a href="/" className="back-home">Về trang chủ<Icon name="arrow" size={16} /></a></div>
    </div></header>
    <main id="workspace-main" className="workspace-container workspace-main" tabIndex={-1}>
      <div className="workspace-title"><div><p className="workspace-eyebrow">CRYPTO APP / WORKSPACE</p><h1>Không gian mã hóa<span>.</span></h1><p>Bảo vệ dữ liệu. Hiểu hiệu năng. Giữ quyền kiểm soát.</p></div><span className="engine-label"><Icon name="shield" size={18} />C / OpenSSL</span></div>
      {offline ? <div className="inline-error" role="alert"><Icon name="info" size={19} /><p>Chưa kết nối được backend. Hãy khởi động lại dịch vụ và tải lại trang trước khi xử lý tệp.</p></div> : null}
      <div className="workspace-nav">
        <div className="workspace-nav-scroll">
          <GooeyNav className="workspace-gooey" mode="tabs" ariaLabel="Công cụ mã hóa"
            items={tabs.map(item => ({ label: item.label, icon: <Icon name={item.icon} size={19} />,
              id: `${item.id}-tab`, controls: `${item.id}-panel`, disabled: busy && tab !== item.id }))}
            activeIndex={tabs.findIndex(item => item.id === tab)} onChange={index => selectTab(tabs[index].id)}
            theme="dark" color="#185df1" activeTextColor="#ffffff" frame={false} size="md"
            animationTime={420} particleCount={4} timeVariance={80} spread={16} gooeyness={.35} wobble={.2} />
        </div>
      </div>
      <section id="files-panel" role="tabpanel" aria-labelledby="files-tab" hidden={tab !== 'files'}>
        <div className="encryption-layout">
          <AppWorkspace capabilities={capabilities} onBusyChange={setBusy} />
          <aside className="workspace-aside">
            <section className="workspace-assurance"><span className="assurance-icon"><Icon name="shield" size={33} /></span><p className="workspace-eyebrow">AN TOÀN TỪ NỀN TẢNG</p><h2>Dữ liệu của bạn.<br />Chỉ bạn nắm giữ chìa khóa.</h2><p>Tệp được gửi tới backend trên chính máy này để xử lý bằng OpenSSL, không phải dịch vụ đám mây.</p>
              <ul><li><Icon name="check" size={17} />Salt và IV ngẫu nhiên mỗi lần mã hóa</li><li><Icon name="check" size={17} />Xác thực dữ liệu trước khi trả tệp giải mã</li><li><Icon name="check" size={17} />Không ghi mật khẩu vào tệp đầu ra</li></ul>
            </section>
            <section className="work-panel parameter-card"><h2>Thông số nền tảng</h2><dl><div><dt>Thư viện</dt><dd>{capabilities.openssl ?? 'OpenSSL · EVP'}</dd></div><div><dt>Mã hóa tệp</dt><dd>{capabilities.algorithms.length} lựa chọn · AEAD / EtM</dd></div><div><dt>Dẫn xuất khóa</dt><dd>PBKDF2 / scrypt</dd></div><div><dt>Số vòng PBKDF2</dt><dd>{capabilities.pbkdf2_iterations.toLocaleString('vi-VN')}</dd></div><div><dt>Chia sẻ bằng khóa</dt><dd>RSA-OAEP + AES-GCM</dd></div><div><dt>Giới hạn mã hóa</dt><dd>{formatBytes(capabilities.max_file_bytes)} / tệp</dd></div></dl><p className="field-hint">Đọc được CGCRYPT1 cũ, CGCRYPT2 và CGHYBRD1. Tạo và kiểm tra khóa ở tab Quản lý khóa.</p></section>
            <div className="workspace-tip"><Icon name="key" size={21} /><p><strong>Giữ mật khẩu ở nơi an toàn.</strong> Không có chức năng khôi phục mật khẩu đã quên. Chia sẻ mật khẩu qua kênh khác với tệp mã hóa.</p></div>
          </aside>
        </div>
      </section>
      <section id="benchmark-panel" role="tabpanel" aria-labelledby="benchmark-tab" hidden={tab !== 'benchmark'}>
        {visited ? <Suspense fallback={<p className="page-loading" role="status">Đang mở công cụ so sánh…</p>}><BenchmarkPanel capabilities={capabilities} onBusyChange={setBusy} /></Suspense> : null}
      </section>
      {(['keys', 'signatures', 'tools'] as const).map(id => <section key={id} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab`} hidden={tab !== id}>{tab === id ? <Suspense fallback={<p className="page-loading" role="status">Đang mở công cụ…</p>}>{id === 'keys' ? <KeysPanel onBusyChange={setBusy} /> : id === 'signatures' ? <SignaturesPanel onBusyChange={setBusy} /> : <ToolsPanel onBusyChange={setBusy} />}</Suspense> : null}</section>)}
      <footer className="workspace-footer"><span><Icon name="lock" size={14} />Tệp gốc luôn được giữ nguyên.</span><a href="/#huong-dan">Hướng dẫn sử dụng<Icon name="arrow" size={14} /></a></footer>
    </main>
  </div>
}
