import { useEffect } from 'react'

const OPEN = 'clampOpen'
const TRUNCATED = 'clampTruncated'
const OWN_TITLE = 'clampTitle'

/** Cell under the global "one line with …" table rule (see index.css). */
function clampedCell(target: EventTarget | null): HTMLTableCellElement | null {
  if (!(target instanceof Element)) return null
  const cell = target.closest('td')
  if (!cell) return null
  if (cell.dataset[OPEN] !== undefined) return cell
  return getComputedStyle(cell).textOverflow === 'ellipsis' ? cell : null
}

function isCut(cell: HTMLElement): boolean {
  if (cell.scrollWidth > cell.clientWidth + 1) return true
  return Array.from(cell.children).some(
    (child) => child instanceof HTMLElement && child.scrollWidth > child.clientWidth + 1,
  )
}

function closeCell(cell: HTMLElement) {
  delete cell.dataset[OPEN]
}

/**
 * Table cells cut off with "…" expand downward (wrapped) on click instead of
 * widening the column; a second click on the text folds them again. Links in a
 * cut-off cell navigate once the full text is showing.
 */
export function useTableCellClamp(resetKey: string) {
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>('td[data-clamp-open]')
      .forEach(closeCell)
  }, [resetKey])

  useEffect(() => {
    function onPointerOver(event: PointerEvent) {
      const cell = clampedCell(event.target)
      if (!cell || cell.dataset[OPEN] !== undefined) return
      const cut = isCut(cell)
      if (cut) {
        cell.dataset[TRUNCATED] = ''
        if (!cell.hasAttribute('title')) {
          cell.title = (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
          cell.dataset[OWN_TITLE] = ''
        }
      } else {
        delete cell.dataset[TRUNCATED]
        if (cell.dataset[OWN_TITLE] !== undefined) {
          cell.removeAttribute('title')
          delete cell.dataset[OWN_TITLE]
        }
      }
    }

    function onClick(event: MouseEvent) {
      if (event.button !== 0 || window.getSelection()?.toString()) return
      const cell = clampedCell(event.target)
      if (!cell) return
      const target = event.target as Element
      if (cell.dataset[OPEN] !== undefined) {
        if (target.closest('a, button, input, select, textarea, label')) return
        event.preventDefault()
        event.stopPropagation()
        closeCell(cell)
        return
      }
      if (!isCut(cell)) return
      event.preventDefault()
      event.stopPropagation()
      cell.dataset[OPEN] = ''
      delete cell.dataset[TRUNCATED]
      if (cell.dataset[OWN_TITLE] !== undefined) {
        cell.removeAttribute('title')
        delete cell.dataset[OWN_TITLE]
      }
    }

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
