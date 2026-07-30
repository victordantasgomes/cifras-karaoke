import { useRef, useState } from 'react'

/**
 * Lista virtualizada leve (janela por scroll) — suporta dezenas de milhares
 * de itens sem custo de renderização.
 */
export default function VirtualList({ items, rowHeight = 46, height = 560, renderRow }) {
  const [scrollTop, setScrollTop] = useState(0)
  const ref = useRef(null)
  const total = items.length * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 5)
  const visible = Math.ceil(height / rowHeight) + 10
  const slice = items.slice(start, start + visible)

  return (
    <div ref={ref} style={{ height, overflowY: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>
          {slice.map((item, i) => renderRow(item, start + i))}
        </div>
      </div>
    </div>
  )
}
