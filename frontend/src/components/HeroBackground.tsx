import { useEffect, useState } from 'react'
import GradientASCII from './GradientASCII/GradientASCII'

const colors = ['#1e3fd8', '#f6f8ff', '#a5d8ff', '#38bdf8']

/** Mount with the headline so both introductions play in parallel. */
export default function HeroBackground() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(motion.matches)
    motion.addEventListener('change', update)
    return () => motion.removeEventListener('change', update)
  }, [])
  return <div className="lp-hero-backdrop" aria-hidden="true" data-background={reduced ? 'static' : 'gradient-ascii'}>
    {!reduced ? <GradientASCII
      colors={colors}
      shape="horizon"
      characters=" =+xX0S8#@"
      cellSize={18}
      density={0.8}
      mouseInteraction={false}
      clickEffect="none"
    /> : null}
  </div>
}
