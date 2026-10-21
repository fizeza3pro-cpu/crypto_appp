import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import posterDesktop from '../assets/vault-poster-desktop.png'
import posterMobile from '../assets/vault-poster-mobile.png'

const VaultScene = lazy(() => import('./VaultScene'))

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? null : this.props.children }
}

/** Useful permanent illustration for loading, unsupported WebGL, and context loss. */
function VaultFallback() {
  return <div className="lp-vault-fallback" aria-hidden="true">
    <div className="lp-fallback-file lp-fallback-file-left"><Icon name="file" size={34} /><i /><i /><i /><span>document.pdf</span></div>
    <div className="lp-fallback-file lp-fallback-file-right"><Icon name="file" size={34} /><i /><i /><i /><span>memories.mp4</span></div>
    <div className="lp-lock"><div className="lp-lock-shackle" /><div className="lp-lock-body"><div className="lp-keyhole" /><span>Crypto App</span></div></div>
  </div>
}

export default function HeroVisual({ staticOnly = false }: { staticOnly?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [enhanced, setEnhanced] = useState(false)
  const [posterFailed, setPosterFailed] = useState(false)
  const [active, setActive] = useState(true)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const onReady = useCallback(() => setReady(true), [])
  const onFailure = useCallback(() => setFailed(true), [])
  useEffect(() => {
    if (reduced || staticOnly) { setReady(false); return }
    if (!active || enhanced || failed) return
    const hero = root.current?.closest<HTMLElement>('.lp-hero')
    let scheduled = false
    let idle: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const enable = () => setEnhanced(true)
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      clearTimeout(timer)
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(enable, { timeout: 700 })
      else timer = setTimeout(enable, 32)
    }
    if (hero?.dataset.entranceComplete === 'true') schedule()
    else {
      hero?.addEventListener('crypto:hero-ready', schedule, { once: true })
      timer = setTimeout(schedule, 3000)
    }
    return () => {
      clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback(idle)
      hero?.removeEventListener('crypto:hero-ready', schedule)
    }
  }, [active, enhanced, failed, reduced, staticOnly])
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduced(motion.matches)
    let inView = true
    const updateActive = () => setActive(inView && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; updateActive() })
    if (root.current) observer.observe(root.current)
    motion.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateActive)
    return () => { observer.disconnect(); motion.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateActive) }
  }, [])
  const live = ready && !reduced && !staticOnly
  return <div ref={root} className="lp-hero-visual" role="img" aria-label="Minh họa 3D: khóa bảo vệ ảnh, video và tài liệu riêng tư. Không phải dữ liệu người dùng." data-scene-state={failed ? 'fallback' : reduced ? 'static' : ready ? 'ready' : enhanced ? 'loading' : 'poster'}>
    <div className="lp-scene-stage">
      <div className="lp-scene-aura" aria-hidden="true" />
      <div className={`lp-scene-fallback ${live && !failed ? 'is-hidden' : ''}`}>
        {posterFailed ? <VaultFallback /> : <picture className="lp-vault-poster" aria-hidden="true"><source media="(max-width: 600px)" srcSet={posterMobile} /><img src={posterDesktop} width="1216" height="340" alt="" fetchPriority="high" decoding="async" onError={() => setPosterFailed(true)} /></picture>}
      </div>
      {!failed && enhanced && !reduced && !staticOnly ? <div className={`lp-scene-canvas ${live ? 'is-ready' : ''}`} aria-hidden="true"><SceneBoundary onFailure={onFailure}><Suspense fallback={null}><VaultScene active={active} reduced={reduced} onReady={onReady} onFailure={onFailure} /></Suspense></SceneBoundary></div> : null}
    </div>
  </div>
}
