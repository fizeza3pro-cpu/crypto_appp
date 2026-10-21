import type { CSSProperties, ReactNode } from 'react'

export interface LogoLoopItem {
  node?: ReactNode
  src?: string
  alt?: string
  title?: string
  ariaLabel?: string
  href?: string
  width?: number
  height?: number
}

export interface LogoLoopProps {
  logos: LogoLoopItem[]
  speed?: number
  direction?: 'left' | 'right' | 'up' | 'down'
  width?: number | string
  logoHeight?: number
  gap?: number
  pauseOnHover?: boolean
  hoverSpeed?: number
  fadeOut?: boolean
  fadeOutWidth?: number
  scaleOnHover?: boolean
  intro?: boolean
  draggable?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  renderItem?: (item: LogoLoopItem, key: string) => ReactNode
}

export default function LogoLoop(props: LogoLoopProps): React.JSX.Element
