import { useEffect } from 'react'

/** Atalhos de teclado. map: { 'Space': fn, 'ArrowLeft': fn, ... } */
export function useHotkeys(map, deps = []) {
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      const key = e.code === 'Space' ? 'Space' : e.key
      const fn = map[key] || map[e.code]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
