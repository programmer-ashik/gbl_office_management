import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  id?: string
  name?: string
  className?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  searchable = false,
  id,
  name,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle),
    )
  }, [options, query])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

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

  return (
    <div className={`ui-select ${className ?? ''}`.trim()} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={id}
        className="ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? '' : 'ui-select-placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <span className="ui-select-chevron" aria-hidden>
          ▾
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="ui-select-popover"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
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
            <ul id={listId} role="listbox" className="ui-select-menu">
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
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="ui-select-empty muted">No matches</li>
              ) : null}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const placeMenu = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuWidth = 220
    const estimatedHeight = Math.min(items.length * 52 + 8, window.innerHeight * 0.45)
    const openUp =
      window.innerHeight - rect.bottom < estimatedHeight + 8 &&
      rect.top > estimatedHeight + 8
    const top = openUp
      ? Math.max(8, rect.top - estimatedHeight - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - estimatedHeight - 8)
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    )
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

    let active = false
    const arm = window.setTimeout(() => {
      active = true
    }, 0)

    function onPointerDown(event: MouseEvent) {
      if (!active) return
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    function onReposition() {
      placeMenu()
    }

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)

    return () => {
      window.clearTimeout(arm)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        {label} ▾
      </button>
      {open && coords && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className="ui-action-panel is-portal"
              style={{ top: coords.top, left: coords.left }}
            >
              {items.map((item) => {
                const tip =
                  item.disabled && item.disabledReason ? item.disabledReason : undefined
                return (
                  <div
                    key={item.label}
                    className="ui-action-item-wrap"
                    title={tip}
                    role="none"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className={
                        item.danger ? 'ui-action-item is-danger' : 'ui-action-item'
                      }
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      aria-description={tip}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (item.disabled) return
                        setOpen(false)
                        item.onSelect()
                      }}
                    >
                      <span className="ui-action-item-label">{item.label}</span>
                      {tip ? <span className="ui-action-item-hint">{tip}</span> : null}
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
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="ui-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <button
            type="button"
            className="ui-modal-backdrop"
            aria-label="Close dialog"
            onClick={onClose}
          />
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
              <button type="button" className="ghost ui-modal-close" onClick={onClose}>
                Close
              </button>
            </header>
            <div className="ui-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
