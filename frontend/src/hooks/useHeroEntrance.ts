import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

/** Masked letters, supporting copy, then native HTML actions. */
export function useHeroEntrance() {
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    const element = root.current
    if (!element) return
    let disposed = false
    let interrupted = false
    let timeline: gsap.core.Timeline | undefined
    const characters: Animation[] = []
    const clearCharacters = () => { characters.forEach(animation => animation.cancel()); characters.length = 0 }
    const ready = () => {
      element.dataset.entranceComplete = 'true'
      element.dispatchEvent(new Event('crypto:hero-ready'))
    }
    const finish = () => { interrupted = true; timeline?.progress(1); clearCharacters(); element.classList.remove('lp-is-entering'); ready() }
    element.addEventListener('focusin', finish)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) element.classList.add('lp-is-entering')
    const media = gsap.matchMedia()
    let fontTimeout: ReturnType<typeof setTimeout>
    const boundedFonts = Promise.race([document.fonts.ready, new Promise<void>(resolve => { fontTimeout = setTimeout(resolve, 800) })])
    void boundedFonts.then(() => {
      if (disposed) return
      clearTimeout(fontTimeout)
      if (interrupted || element.contains(document.activeElement)) { finish(); return }
      media.add('(prefers-reduced-motion: no-preference)', () => {
        element.dataset.entranceStart = String(performance.now())
        const entrance = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: ready })
        timeline = entrance
        // Explicit native keyframes avoid GSAP parsing computed transforms for every glyph.
        // The compositor owns glyph motion; GSAP owns only copy/action containers.
        const origin = document.timeline.currentTime
        const letters = (selector: string, at: number, stagger: number) => {
          element.querySelectorAll<HTMLElement>(selector).forEach((node, index) => {
            if (!node.animate) return
            const animation = node.animate([
              { opacity: 0, transform: 'translate3d(0,110%,0) rotate(8deg)' },
              { opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg)' },
            ], { duration: 650, delay: (at + index * stagger) * 1000, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' })
            if (origin !== null) animation.startTime = origin
            characters.push(animation)
            void animation.finished.then(() => animation.cancel(), () => undefined)
          })
        }
        letters('.lp-title-line:first-child .lp-reveal-char', .07, .022)
        letters('.lp-title-line:last-child .lp-reveal-char', .24, .016)
        entrance.fromTo(element.querySelectorAll('.lp-description-copy .lp-reveal-line'),
          { opacity: 0, yPercent: 55 },
          { opacity: 1, yPercent: 0, duration: .5, stagger: .07, clearProps: 'all' }, .82)
        entrance.fromTo(element.querySelectorAll('.lp-hero-actions > *, .lp-local-note, .lp-scroll-cue'),
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: .45, stagger: .055, clearProps: 'all' }, 1.08)
        element.classList.remove('lp-is-entering')
        return clearCharacters
      })
      element.classList.remove('lp-is-entering')
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) ready()
    })
    return () => {
      disposed = true
      clearTimeout(fontTimeout)
      element.removeEventListener('focusin', finish)
      element.classList.remove('lp-is-entering')
      media.revert()
      clearCharacters()
      delete element.dataset.entranceStart
      delete element.dataset.entranceComplete
    }
  }, { scope: root })
  return root
}
