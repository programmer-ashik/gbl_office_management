import { useState } from 'react'

type Props = {
  text: string | null | undefined
  maxChars?: number
  empty?: string
  className?: string
}

/** Truncate long table text; click to expand/collapse full content. */
export function ExpandableText({
  text,
  maxChars = 48,
  empty = '—',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const value = (text ?? '').trim()
  if (!value) return <span className={className}>{empty}</span>
  if (value.length <= maxChars) {
    return (
      <span className={className} title={value}>
        {value}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`expandable-text ${className ?? ''}`}
      title={open ? 'Hide details' : 'Show full description'}
      onClick={() => setOpen((prev) => !prev)}
    >
      {open ? value : `${value.slice(0, maxChars).trimEnd()}…`}
    </button>
  )
}
