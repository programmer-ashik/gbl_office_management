import { useId, useRef, useState, type ChangeEvent } from 'react'

type Props = {
  label: string
  accept?: string
  hint?: string
  disabled?: boolean
  onFile: (file: File) => void
}

/**
 * Compact modern file picker used on project invoice / template flows.
 */
export function FileUploadField({
  label,
  accept = 'image/*',
  hint,
  disabled,
  onFile,
}: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)
    onFile(file)
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files)
  }

  return (
    <div className="file-upload-field">
      <span className="file-upload-label">{label}</span>
      <label
        htmlFor={inputId}
        className={`file-upload-drop${dragging ? ' is-dragging' : ''}${
          disabled ? ' is-disabled' : ''
        }`}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) handleFiles(e.dataTransfer.files)
        }}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="file-upload-input"
          onChange={onChange}
        />
        <span className="file-upload-icon" aria-hidden>
          ↑
        </span>
        <span className="file-upload-copy">
          <strong>{fileName ?? 'Drop file or browse'}</strong>
          <span className="muted">
            {hint ?? 'PNG, JPG, or WebP · click to select'}
          </span>
        </span>
        <button
          type="button"
          className="ghost file-upload-browse"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault()
            inputRef.current?.click()
          }}
        >
          Browse
        </button>
      </label>
    </div>
  )
}
