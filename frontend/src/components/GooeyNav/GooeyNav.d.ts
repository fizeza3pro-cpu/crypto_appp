import type { CSSProperties, ReactNode } from 'react'

export interface GooeyNavItem { label: string; href?: string; icon?: ReactNode; id?: string; controls?: string; disabled?: boolean }
export interface GooeyNavProps {
  items?: GooeyNavItem[]
  initialActiveIndex?: number
  activeIndex?: number
  onChange?: (index: number, item: GooeyNavItem) => void
  mode?: 'navigation' | 'tabs'
  ariaLabel?: string
  theme?: 'dark' | 'light'
  color?: string
  activeTextColor?: string
  colors?: string[]
  size?: 'sm' | 'md' | 'lg'
  frame?: boolean
  animationTime?: number
  particleCount?: number
  timeVariance?: number
  spread?: number
  gooeyness?: number
  wobble?: number
  hoverEffect?: boolean
  className?: string
  style?: CSSProperties
}
export default function GooeyNav(props: GooeyNavProps): React.JSX.Element
