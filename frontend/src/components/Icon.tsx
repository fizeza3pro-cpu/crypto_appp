import type { SVGProps } from 'react'

const paths = {
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.7-1.5M12 15v2" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h5" /></>,
  key: <><circle cx="16" cy="8" r="5" /><path d="m12.4 11.6-9.4 9.4v-4l2-2h3v-3l2-2M17 7h.01" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
  monitor: <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  laptop: <><path d="M5 17V4h14v13M2 17h20l-1 3H3z" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 5.1A13 13 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 3.6M6 6.5A20 20 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5.5-1.3" /><path d="M10 10a3 3 0 0 0 4 4" /></>,
  gear: <><path d="m9 3 1-2h4l1 2 2 1 2-.3 2 3-1 2v3l1 2-2 3-2-.3-2 1-1 2h-4l-1-2-2-1-2 .3-2-3 1-2V9L3 7l2-3 2 .3z" /><circle cx="12" cy="10.5" r="3" /></>,
  quote: <><path d="M3 14c0-5 2-8 6-9v3c-2 1-3 2-3 4h4v7H3zm12 0c0-5 2-8 6-9v3c-2 1-3 2-3 4h4v7h-7z" fill="currentColor" stroke="none" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11-2l3 3M4 16l3 3a7 7 0 0 0 11-2" /></>,
  spinner: <path d="M21 12a9 9 0 1 1-9-9" />,
} satisfies Record<string, React.ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, size = 22, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

export function Brand({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'brand-small' : ''}`} translate="no">
    <svg className="brand-mark" width="31" height="36" viewBox="0 0 36 42" aria-hidden="true"><path d="M9 19V12a9 9 0 0 1 18 0v7" fill="none" stroke="#9dbaff" strokeWidth="3.7" /><rect x="3" y="17" width="30" height="24" rx="5" fill="#79a1ff" /><circle cx="18" cy="27" r="3" fill="#122040" /><path d="M18 28v5" stroke="#122040" strokeWidth="2.5" strokeLinecap="round" /></svg>
    <span>Crypto App</span>
  </span>
}
