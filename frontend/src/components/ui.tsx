import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type SelectProps = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  required?: boolean
  searchable?: boolean
  /** Use fixed portal. Default: auto (local inside modals, portal elsewhere). */
  portal?: boolean
  id?: string
  name?: string
  className?: string
}

type PopoverCoords = {
  top: number
  left: number
  width: number
  maxHeight: number
  listMaxHeight: number
  openUp: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  searchable = false,
  portal,
  id,
  name,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<PopoverCoords | null>(null)
  const [autoPortal, setAutoPortal] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  const usePortal = portal ?? autoPortal

  useLayoutEffect(() => {
    setAutoPortal(!rootRef.current?.closest('.ui-modal-panel'))
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle),
    )
  }, [options, query])

  const placePopover = () => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const gap = 4
    const pad = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const searchH = searchable ? 44 : 0

    // Never wider than the viewport; match trigger on small screens.
    const width = Math.min(Math.max(rect.width, 160), vw - pad * 2)

    const spaceBelow = vh - rect.bottom - pad
    const spaceAbove = rect.top - pad
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
    const available = Math.max(0, (openUp ? spaceAbove : spaceBelow) - gap)

    // Cap list to viewport so options never spill off-screen.
    const maxHeight = Math.max(140, Math.min(available, Math.floor(vh * 0.5)))
    const listMaxHeight = Math.max(96, maxHeight - searchH - 8)

    if (!usePortal) {
      setCoords({
        top: 0,
        left: 0,
        width: Math.min(rect.width, vw - pad * 2),
        maxHeight,
        listMaxHeight,
        openUp,
      })
      return
    }

    let left = rect.left
    if (left + width > vw - pad) left = vw - width - pad
    if (left < pad) left = pad

    // Prefer opening in the direction with more room; keep fully on-screen.
    const usedHeight = Math.min(
      maxHeight,
      panelRef.current?.offsetHeight || maxHeight,
    )
    let top = openUp ? rect.top - gap - usedHeight : rect.bottom + gap
    if (top < pad) top = pad
    if (top + usedHeight > vh - pad) {
      top = Math.max(pad, vh - pad - usedHeight)
    }

    setCoords({ top, left, width, maxHeight, listMaxHeight, openUp })
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    placePopover()
    const frame = window.requestAnimationFrame(() => {
      placePopover()
      // Third pass after fonts/layout settle
      window.requestAnimationFrame(() => placePopover())
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, options.length, filtered.length, usePortal, searchable, query])

  useEffect(() => {
    if (!open) return

    let armed = false
    const arm = window.setTimeout(() => {
      armed = true
    }, 10)

    function onPointerDown(event: MouseEvent) {
      if (!armed) return
      const target = event.target as Node
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
      setQuery('')
    }

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        setQuery('')
      }
    }

    function onReposition() {
      placePopover()
    }

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)

    return () => {
      window.clearTimeout(arm)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, options.length, usePortal, searchable, filtered.length, query])

  useEffect(() => {
    if (open && searchable) {
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open, searchable])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  function closeAndSelect(next: string) {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const menu = open ? (
    <div
      ref={panelRef}
      className={
        usePortal
          ? 'ui-select-popover is-portal'
          : coords?.openUp
            ? 'ui-select-popover is-local is-open-up'
            : 'ui-select-popover is-local'
      }
      style={
        usePortal
          ? ({
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              width: coords?.width ?? undefined,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight:
                coords?.maxHeight ??
                (typeof window !== 'undefined'
                  ? Math.floor(window.innerHeight * 0.5)
                  : 280),
              visibility: coords ? 'visible' : 'hidden',
              zIndex: 10050,
            } satisfies CSSProperties)
          : coords
            ? ({
                maxHeight: coords.maxHeight,
                maxWidth: '100%',
                width: '100%',
              } satisfies CSSProperties)
            : undefined
      }
      role="presentation"
    >
      {searchable ? (
        <input
          ref={searchRef}
          className="ui-select-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search options"
        />
      ) : null}
      <ul
        id={listId}
        role="listbox"
        className="ui-select-menu"
        style={
          coords
            ? ({
                maxHeight: coords.listMaxHeight,
                overflowY: 'auto',
              } satisfies CSSProperties)
            : ({
                maxHeight: 200,
                overflowY: 'auto',
              } satisfies CSSProperties)
        }
      >
        {filtered.map((option) => (
          <li key={option.value || '__empty'}>
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={
                option.value === value
                  ? 'ui-select-option is-selected'
                  : 'ui-select-option'
              }
              disabled={option.disabled}
              title={option.label}
              onMouseDown={(event) => {
                // Prevent trigger blur / outside handlers from racing the click
                event.preventDefault()
              }}
              onClick={() => closeAndSelect(option.value)}
            >
              {option.label}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="ui-select-empty muted">No matches</li>
        ) : null}
      </ul>
    </div>
  ) : null

  return (
    <div
      className={`ui-select${open ? ' is-open' : ''} ${className ?? ''}`.trim()}
      ref={rootRef}
    >
      {name ? (
        <input type="hidden" name={name} value={value} required={required} />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        title={selected?.label ?? placeholder}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? 'ui-select-value' : 'ui-select-placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="ui-select-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {usePortal
        ? open && typeof document !== 'undefined'
          ? createPortal(menu, document.body)
          : null
        : menu}
    </div>
  )
}

type ActionMenuItem = {
  label: string
  onSelect: () => void
  disabled?: boolean
  disabledReason?: string
  danger?: boolean
}

type ActionMenuProps = {
  label?: string
  items: ActionMenuItem[]
  disabled?: boolean
}

export function ActionMenu({
  label = 'Actions',
  items,
  disabled = false,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  )
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const placeMenu = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuWidth = 180
    const estimatedHeight = Math.min(
      items.length * 40 + 8,
      window.innerHeight * 0.45,
    )
    const openUp =
      window.innerHeight - rect.bottom < estimatedHeight + 8 &&
      rect.top > estimatedHeight + 8
    const top = openUp
      ? Math.max(8, rect.top - estimatedHeight - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - 8)
    let left = rect.right - menuWidth
    if (left < 8) left = 8
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8
    }
    setCoords({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    placeMenu()
  }, [open, items.length])

  useEffect(() => {
    if (!open) return
    let armed = false
    const arm = window.setTimeout(() => {
      armed = true
    }, 10)

    function onPointerDown(event: MouseEvent) {
      if (!armed) return
      const target = event.target as Node
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }

    function onReposition() {
      placeMenu()
    }

    document.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.clearTimeout(arm)
      document.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, items.length])

  return (
    <div className="ui-action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="ghost ui-action-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="ui-action-panel is-portal"
              style={{ top: coords.top, left: coords.left, minWidth: 180 }}
            >
              {items.map((item) => {
                const tip = item.disabled ? item.disabledReason : undefined
                return (
                  <div key={item.label} className="ui-action-item-wrap">
                    <button
                      type="button"
                      className={
                        item.danger
                          ? 'ui-action-item is-danger'
                          : 'ui-action-item'
                      }
                      disabled={item.disabled}
                      title={tip}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (item.disabled) return
                        setOpen(false)
                        item.onSelect()
                      }}
                    >
                      <span className="ui-action-item-label">{item.label}</span>
                      {tip ? (
                        <span className="ui-action-item-hint">{tip}</span>
                      ) : null}
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

type ModalProps = {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="ui-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="ui-modal-backdrop" aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ui-modal-title"
            className={wide ? 'ui-modal-panel is-wide' : 'ui-modal-panel'}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <header className="ui-modal-header">
              <div>
                <h2 id="ui-modal-title">{title}</h2>
                {description ? <p className="muted">{description}</p> : null}
              </div>
              <button
                type="button"
                className="ghost ui-modal-close"
                onClick={onClose}
              >
                Close
              </button>
            </header>
            <div className="ui-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
