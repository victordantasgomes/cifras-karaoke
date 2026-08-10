// Ícones inline (stroke) — sem dependência externa.
const I = (path) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" {...props}>{path}</svg>
)
export const IconHome = I(<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>)
export const IconMusic = I(<><circle cx="7" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M10 18V5l10-2v13"/></>)
export const IconList = I(<><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>)
export const IconStar = I(<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>)
export const IconClock = I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>)
export const IconPlay = I(<path d="M6 4.5v15l13-7.5z"/>)
export const IconPause = I(<><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>)
export const IconSettings = I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></>)
export const IconUser = I(<><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-5.5 8-5.5S18.5 17 20 21"/></>)
export const IconExit = I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>)
export const IconMic = I(<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 19v3"/></>)
export const IconBook = I(<><path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13"/><path d="M8 7h8M8 10.5h8"/></>)
export const IconUsers = I(<><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1-3.6 3.7-5.2 6.5-5.2s5.5 1.6 6.5 5.2"/><circle cx="17" cy="8.5" r="2.6"/><path d="M15.5 15c2.3.2 4.3 1.7 5 4.3"/></>)
export const IconMetronome = I(<><path d="M7 21h10l-2.2-15H9.2z"/><path d="M10 3h4l.6 4h-5.2z"/><path d="M9.5 14 15 8.5"/></>)
export const IconTuner = I(<><path d="M9 3v7a3 3 0 0 0 6 0V3"/><path d="M12 13v8"/><path d="M9 21h6"/></>)
export const IconShield = I(<><path d="M12 3 4 6.5V11c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6.5z"/><path d="m9 12 2 2 4-4"/></>)
export const IconChart = I(<><path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/><path d="M2 20h20"/></>)
