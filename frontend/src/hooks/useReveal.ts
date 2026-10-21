import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

export function useReveal() {
  const scope = useRef<HTMLElement>(null)
  useGSAP((_, contextSafe) => {
    const root = scope.current
    if (!root || !contextSafe) return
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    const timelines = new Map<HTMLElement, gsap.core.Timeline>()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let observer: IntersectionObserver | undefined
    const reveal = contextSafe((node: HTMLElement) => {
        if (node.dataset.revealState !== 'pending') return
        observer?.unobserve(node)
        const kind = node.dataset.reveal
        const complete = () => { node.classList.add('is-visible'); node.dataset.revealState = 'complete'; timelines.delete(node) }
        // Only the section entering view pays for style reads / tween creation.
        node.dataset.revealState = 'running'
        const timeline = gsap.timeline({
          defaults: { duration: .6, ease: 'power3.out' },
          onComplete: complete,
        })
        timelines.set(node, timeline)
        const targets = (selector: string) => node.querySelectorAll(selector)
        const distance = matchMedia('(max-width: 760px)').matches ? 12 : 22
        switch (kind) {
          case 'cap-copy':
            timeline.fromTo(targets('h2, h3'), { clipPath: 'inset(0 0 100% 0)', y: 10 }, { clipPath: 'inset(0 0 0% 0)', y: 0, duration: .62, clearProps: 'clipPath,transform' })
              .fromTo(targets(':scope > p, :scope > a'), { opacity: 0, x: -distance / 2 }, { opacity: 1, x: 0, duration: .48, stagger: .07, clearProps: 'opacity,transform' }, .1)
              .fromTo(targets('dl > div'), { opacity: 0, x: distance }, { opacity: 1, x: 0, duration: .5, stagger: .08, clearProps: 'opacity,transform' }, .15)
            break
          case 'cap-image':
            timeline.fromTo(targets('img'), { scale: 1.065, xPercent: 2, opacity: .55 }, { scale: 1, xPercent: 0, opacity: 1, duration: .8, clearProps: 'transform,opacity' })
            break
          case 'cap-list':
            timeline.fromTo(targets(':scope > div, :scope > article'), { scale: .96, y: 10, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .48, stagger: .09, clearProps: 'transform,opacity' })
            break
          case 'image-wipe':
            timeline.fromTo(node, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: .7, clearProps: 'clipPath' })
              .fromTo(targets('img'), { scale: 1.045 }, { scale: 1, duration: .8, clearProps: 'transform' }, 0)
            break
          case 'feature-explorer':
            timeline.fromTo(targets('.lc-feature-sidebar'), { x: -distance, opacity: 0 }, { x: 0, opacity: 1, duration: .6, clearProps: 'transform,opacity' })
              .fromTo(targets('.lc-feature-stage'), { scale: .975, opacity: 0 }, { scale: 1, opacity: 1, duration: .62, clearProps: 'transform,opacity' }, .05)
              .fromTo(targets('.lc-feature-photo img'), { xPercent: 4 }, { xPercent: 0, duration: .75, clearProps: 'transform' }, .05)
            break
          case 'social-proof':
            // Animate wrappers only; LogoLoop keeps exclusive ownership of its tracks.
            timeline.fromTo(targets('.sp-heading'), { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: .6, clearProps: 'clipPath' })
              .fromTo(targets('.sp-technology-label'), { opacity: 0 }, { opacity: 1, duration: .35, clearProps: 'opacity' }, .08)
              .fromTo(targets('.sp-logo-reveal'), { x: distance, opacity: 0 }, { x: 0, opacity: 1, duration: .55, clearProps: 'transform,opacity' }, .12)
              .fromTo(targets('.sp-review-reveal'), { x: -distance, opacity: 0 }, { x: 0, opacity: 1, duration: .6, clearProps: 'transform,opacity' }, .16)
            break
          case 'fan':
            timeline.fromTo(targets('.lp-tool-card'), { opacity: 0, scale: .92, rotationY: -14, transformPerspective: 1000 }, { opacity: 1, scale: 1, rotationY: 0, stagger: .11, clearProps: 'all' })
            break
          case 'steps':
            timeline.fromTo(targets('.lp-step-top'), { scale: .7, rotation: -10, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, stagger: .13, clearProps: 'all' })
              .fromTo(targets('li h3, li > p'), { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', stagger: .07, clearProps: 'all' }, .16)
            break
          case 'split':
            timeline.fromTo(targets('.lp-security-visual'), { x: -35, rotation: -2, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, clearProps: 'all' })
              .fromTo(targets('.lp-security-copy > h2, .lp-security-copy > p'), { x: 35, opacity: 0 }, { x: 0, opacity: 1, stagger: .09, clearProps: 'all' }, .08)
              .fromTo(targets('dl > div, .lp-security-copy > a'), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', stagger: .08, clearProps: 'all' }, .2)
            break
          case 'spotlight':
            timeline.fromTo(targets('.lp-feedback-window'), { clipPath: 'inset(0 42% 0 42% round 30px)' }, { clipPath: 'inset(0 0% 0 0% round 30px)', duration: 1, clearProps: 'all' })
              .fromTo(targets('.lp-feedback-heading, .lp-feedback-controls'), { opacity: 0 }, { opacity: 1, duration: .55, clearProps: 'all' }, .15)
            break
          case 'pricing':
            timeline.fromTo(targets('.lp-centered-heading'), { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', clearProps: 'all' })
              .fromTo(targets('.lp-price-card'), { scale: .96, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .55, stagger: { each: .1, from: 'center' }, clearProps: 'transform,opacity' }, .06)
            break
          case 'accordion':
            timeline.fromTo(targets(':scope > div:first-child'), { x: -distance, opacity: 0 }, { x: 0, opacity: 1, duration: .55, clearProps: 'transform,opacity' })
              .fromTo(targets('details'), { x: distance, opacity: 0 }, { x: 0, opacity: 1, duration: .45, stagger: .055, clearProps: 'transform,opacity' }, .04)
            break
          case 'focus':
            timeline.fromTo(targets('.lp-closing-mark'), { rotation: -12, scale: .85, opacity: 0 }, { rotation: 0, scale: 1, opacity: 1, duration: .55, clearProps: 'transform,opacity' })
              .fromTo(targets('h2'), { scale: .975, opacity: 0 }, { scale: 1, opacity: 1, duration: .65, clearProps: 'transform,opacity' }, .04)
              .fromTo(targets('p, a'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .45, stagger: .06, clearProps: 'transform,opacity' }, .12)
            break
          default:
            timeline.fromTo(node, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', clearProps: 'all' })
        }
    })
    const revealAll = () => {
      observer?.disconnect()
      timelines.forEach(timeline => { timeline.progress(1); timeline.kill() })
      elements.forEach(node => { node.classList.add('is-visible'); node.dataset.revealState = 'complete' })
    }
    if (reduced.matches || !('IntersectionObserver' in window)) revealAll()
    else {
      elements.forEach(node => { node.dataset.revealState = 'pending' })
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target as HTMLElement) })
      }, { rootMargin: '0px 0px -9% 0px', threshold: .01 })
      elements.forEach(node => observer!.observe(node))
    }
    const focusReveal = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return
      const node = event.target.closest<HTMLElement>('[data-reveal]')
      if (node) {
        observer?.unobserve(node)
        const timeline = timelines.get(node)
        timeline?.progress(1)
        node.classList.add('is-visible'); node.dataset.revealState = 'complete'
      }
    }
    root.addEventListener('focusin', focusReveal)
    const preference = () => { if (reduced.matches) revealAll() }
    reduced.addEventListener('change', preference)
    return () => {
      observer?.disconnect()
      reduced.removeEventListener('change', preference)
      root.removeEventListener('focusin', focusReveal)
      timelines.clear()
      elements.forEach(node => { delete node.dataset.revealState; node.classList.remove('is-visible') })
    }
  }, { scope })
  return scope
}
