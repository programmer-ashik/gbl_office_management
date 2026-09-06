import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { ProjectInvoiceDocument } from '../components/ProjectInvoiceDocument'
import {
  draftStorageKey,
  defaultColumnWidths,
  defaultInvoiceExtras,
  emptyInvoiceLine,
  formatInvoiceMoney,
  INVOICE_CURRENCIES,
  invoiceCurrencyByCode,
  invoiceTotals,
  linesFromProjectMaterials,
  normalizeInvoiceDraft,
  newTextBoxId,
  type InvoiceLine,
  type InvoiceTextAlign,
  type InvoiceTextBox,
  type ProjectInvoiceDraft,
} from '../types/project-invoice'
import { defaultBalanceSheetTemplate, hydrateClientTemplate } from '../types/report-template'
import { downloadProjectInvoicePdf } from '../utils/projectInvoicePdf'

function SortableLineChip({
  line,
  selected,
  onSelect,
}: {
  line: InvoiceLine
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: line.id })
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`inv-line-chip${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden>⋮⋮</span>
      <span>{line.title || 'Untitled row'}</span>
    </button>
  )
}

function InvoiceSignaturePad({ onApply }: { onApply: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function clearPad() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <div className="inv-sign-pad">
      <p className="muted">Draw signature</p>
      <canvas
        ref={canvasRef}
        width={320}
        height={110}
        onPointerDown={(e) => {
          drawing.current = true
          const ctx = canvasRef.current?.getContext('2d')
          if (!ctx) return
          const { x, y } = point(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvasRef.current?.getContext('2d')
          if (!ctx) return
          const { x, y } = point(e)
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={() => {
          drawing.current = false
        }}
        onPointerLeave={() => {
          drawing.current = false
        }}
      />
      <div className="form-actions">
        <button type="button" className="ghost" onClick={clearPad}>
          Clear pad
        </button>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current
            if (!canvas) return
            onApply(canvas.toDataURL('image/png'))
          }}
        >
          Apply signature
        </button>
      </div>
    </div>
  )
}

export function ProjectInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<ProjectInvoiceDraft | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [project, template, invoices] = await Promise.all([
          api.projectProfitability(id),
          api.balanceSheetTemplate().catch(() => null),
          api.invoices().catch(() => []),
        ])
        if (cancelled) return
        const tpl = template
          ? hydrateClientTemplate(template, defaultBalanceSheetTemplate())
          : defaultBalanceSheetTemplate()
        const existing = Array.isArray(invoices)
          ? invoices.find((row) => row.projectId === id)
          : undefined
        const storedRaw = localStorage.getItem(draftStorageKey(id))
        const materialLines = linesFromProjectMaterials(
          project.materialsSummary ?? [],
          {
            title: `${project.code} · ${project.name}`,
            description: 'Completed project deliverables per contract.',
            unitPrice: project.contractValue,
          },
        )
        if (storedRaw) {
          const stored = normalizeInvoiceDraft(
            JSON.parse(storedRaw) as ProjectInvoiceDraft,
          )
          const next = {
            ...stored,
            logoUrl: stored.logoUrl || tpl.companyLogoUrl || null,
            lines:
              (project.materialsSummary?.length ?? 0) > 0
                ? materialLines
                : stored.lines,
          }
          setDraft(next)
          localStorage.setItem(draftStorageKey(id), JSON.stringify(next))
          return
        }
        const today = new Date().toISOString().slice(0, 10)
        const due = new Date()
        due.setDate(due.getDate() + 30)
        setDraft({
          invoiceNumber: existing?.invoiceNumber ?? `DRAFT-${project.code}`,
          invoiceId: existing?.id ?? null,
          date: existing?.date?.slice(0, 10) ?? today,
          dueDate: existing?.dueDate?.slice(0, 10) ?? due.toISOString().slice(0, 10),
          currency: invoiceCurrencyByCode('USD').symbol,
          currencyCode: 'USD',
          companyName: tpl.headerConfig.companyName || 'GBL Enterprise',
          companyAddress: tpl.headerConfig.address || '',
          companyEmail: '',
          companyPhone: '',
          logoUrl: tpl.companyLogoUrl ?? null,
          billToName:
            project.client.contactName?.trim() || project.client.name,
          client: project.client.name,
          phone: project.client.phone ?? '',
          email: project.client.email ?? '',
          address: project.client.address ?? '',
          taxRate: 15,
          discountRate: 0,
          ...defaultInvoiceExtras(),
          columnWidths: { ...defaultColumnWidths },
          lines: materialLines,
          textBoxes: [],
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load invoice')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const totals = useMemo(
    () => (draft ? invoiceTotals(draft) : null),
    [draft],
  )

  const selectedLine = draft?.lines.find((row) => row.id === selectedId)
  const selectedBox = draft?.textBoxes.find((row) => row.id === selectedId)

  function persist(next: ProjectInvoiceDraft) {
    if (!id) return
    localStorage.setItem(draftStorageKey(id), JSON.stringify(next))
  }

  function patchDraft(patch: Partial<ProjectInvoiceDraft>) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }

  function changeLine(lineId: string, patch: Partial<InvoiceLine>) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        lines: prev.lines.map((row) =>
          row.id === lineId ? { ...row, ...patch } : row,
        ),
      }
      persist(next)
      return next
    })
  }

  function changeTextBox(boxId: string, patch: Partial<InvoiceTextBox>) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        textBoxes: prev.textBoxes.map((row) =>
          row.id === boxId ? { ...row, ...patch } : row,
        ),
      }
      persist(next)
      return next
    })
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !draft) return
    const oldIndex = draft.lines.findIndex((row) => row.id === active.id)
    const newIndex = draft.lines.findIndex((row) => row.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = {
      ...draft,
      lines: arrayMove(draft.lines, oldIndex, newIndex),
    }
    setDraft(next)
    persist(next)
  }

  function addRow() {
    if (!draft) return
    const line = emptyInvoiceLine({
      title: 'New item',
      description: '',
      unitPrice: 0,
      quantity: 1,
    })
    const next = { ...draft, lines: [...draft.lines, line] }
    setDraft(next)
    persist(next)
    setSelectedId(line.id)
  }

  function removeSelectedRow() {
    if (!draft || !selectedLine) return
    if (draft.lines.length <= 1) {
      setError('Keep at least one invoice row.')
      return
    }
    const next = {
      ...draft,
      lines: draft.lines.filter((row) => row.id !== selectedLine.id),
    }
    setDraft(next)
    persist(next)
    setSelectedId(null)
  }

  function addTextBox() {
    if (!draft) return
    const box: InvoiceTextBox = {
      id: newTextBoxId(),
      text: 'Text box',
      x: 20,
      y: 40,
      width: 30,
      fontSize: 14,
      bold: false,
      color: '#333333',
      align: 'left',
    }
    const next = { ...draft, textBoxes: [...draft.textBoxes, box] }
    setDraft(next)
    persist(next)
    setSelectedId(box.id)
  }

  async function ensurePostedInvoice() {
    if (!id || !draft || !totals) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      if (!draft.invoiceId) {
        const created = await api.createInvoice({
          projectId: id,
          type: 'lump_sum',
          date: draft.date,
          dueDate: draft.dueDate,
          amount: Math.max(totals.grandTotal, 0.01),
          description: `Final invoice for completed project`,
        })
        const next = {
          ...draft,
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
        }
        setDraft(next)
        persist(next)
        setMessage(`Posted AR invoice ${created.invoiceNumber}`)
      } else {
        setMessage(`Invoice ${draft.invoiceNumber} already posted`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post invoice')
    } finally {
      setSaving(false)
    }
  }

  async function onDownloadPdf() {
    if (!draft) return
    try {
      await downloadProjectInvoicePdf(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export PDF')
    }
  }

  function applyStyle(patch: Partial<InvoiceLine & InvoiceTextBox>) {
    if (selectedLine) changeLine(selectedLine.id, patch)
    else if (selectedBox) changeTextBox(selectedBox.id, patch)
  }

  if (!draft) {
    return error ? (
      <p className="form-error">{error}</p>
    ) : (
      <p className="muted">Loading invoice…</p>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Project invoice</p>
          <h1>{draft.invoiceNumber}</h1>
          <p className="muted">
            Design matches your sample layout. Edit rows, styles, and text boxes,
            then post to AR / download PDF.
          </p>
        </div>
        <div className="form-actions">
          <Link to={`/projects/${id}`} className="ghost-link">
            Project
          </Link>
          <button type="button" className="ghost" onClick={() => void onDownloadPdf()}>
            Download PDF
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void ensurePostedInvoice()}
          >
            {saving ? 'Posting…' : 'Post to receivables'}
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <div className="inv-workspace">
        <aside className="inv-toolbar table-card">
          <div className="inv-toolbar-scroll">
          <h2>Edit options</h2>
          <div className="form-actions">
            <button type="button" onClick={addRow}>
              Add row
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!selectedLine}
              onClick={removeSelectedRow}
            >
              Remove row
            </button>
            <button type="button" className="ghost" onClick={addTextBox}>
              Add text box
            </button>
          </div>

          <h3>Row order (drag)</h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={draft.lines.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="inv-line-list">
                {draft.lines.map((line) => (
                  <SortableLineChip
                    key={line.id}
                    line={line}
                    selected={selectedId === line.id}
                    onSelect={() => setSelectedId(line.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <h3>Text style</h3>
          <p className="muted inv-toolbar-hint">
            Select a row or text box on the invoice, then adjust.
          </p>
          <div className="inv-style-grid">
            <label>
              Font size
              <input
                type="number"
                min={10}
                max={32}
                value={selectedLine?.fontSize ?? selectedBox?.fontSize ?? 13}
                disabled={!selectedLine && !selectedBox}
                onChange={(e) =>
                  applyStyle({ fontSize: Number(e.target.value) || 13 })
                }
              />
            </label>
            <label className="inv-check">
              <input
                type="checkbox"
                checked={Boolean(selectedLine?.bold ?? selectedBox?.bold)}
                disabled={!selectedLine && !selectedBox}
                onChange={(e) => applyStyle({ bold: e.target.checked })}
              />
              <span>Bold</span>
            </label>
            <label>
              Text color
              <input
                type="color"
                value={selectedLine?.color ?? selectedBox?.color ?? '#1a1a1a'}
                disabled={!selectedLine && !selectedBox}
                onChange={(e) => applyStyle({ color: e.target.value })}
              />
            </label>
            <label>
              Align
              <select
                value={selectedLine?.align ?? selectedBox?.align ?? 'left'}
                disabled={!selectedLine && !selectedBox}
                onChange={(e) =>
                  applyStyle({
                    align: e.target.value as InvoiceTextAlign,
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          <h3>Column widths %</h3>
          {(
            [
              ['item', 'Item'],
              ['description', 'Description'],
              ['unitPrice', 'Unit price'],
              ['quantity', 'Quantity'],
              ['total', 'Total'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="range"
                min={10}
                max={60}
                value={draft.columnWidths[key]}
                onChange={(e) =>
                  patchDraft({
                    columnWidths: {
                      ...draft.columnWidths,
                      [key]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}

          <h3>Totals</h3>
          <label>
            Currency
            <select
              value={draft.currencyCode}
              onChange={(e) => {
                const selected = invoiceCurrencyByCode(e.target.value)
                patchDraft({
                  currencyCode: selected.code,
                  currency: selected.symbol,
                })
              }}
            >
              {INVOICE_CURRENCIES.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tax %
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.taxRate}
              onChange={(e) =>
                patchDraft({ taxRate: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label>
            Discount %
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.discountRate}
              onChange={(e) =>
                patchDraft({ discountRate: Number(e.target.value) || 0 })
              }
            />
          </label>
          <p className="muted">
            Grand total{' '}
            {formatInvoiceMoney(totals?.grandTotal ?? 0, draft.currencyCode)}
          </p>

          <h3>Company / payment</h3>
          <label>
            Company name
            <input
              value={draft.companyName}
              onChange={(e) => patchDraft({ companyName: e.target.value })}
            />
          </label>
          <label>
            Address
            <input
              value={draft.companyAddress}
              onChange={(e) => patchDraft({ companyAddress: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              value={draft.companyEmail}
              onChange={(e) => patchDraft({ companyEmail: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={draft.companyPhone}
              onChange={(e) => patchDraft({ companyPhone: e.target.value })}
            />
          </label>
          <label className="inv-check">
            <input
              type="checkbox"
              checked={draft.showPaymentMethods}
              onChange={(e) =>
                patchDraft({ showPaymentMethods: e.target.checked })
              }
            />
            <span>Show payment methods</span>
          </label>
          {draft.showPaymentMethods ? (
            <>
              <label>
                PayPal
                <input
                  value={draft.paymentPaypal}
                  onChange={(e) =>
                    patchDraft({ paymentPaypal: e.target.value })
                  }
                  placeholder="paypal.me/…"
                />
              </label>
              <label className="inv-check">
                <input
                  type="checkbox"
                  checked={draft.acceptCard}
                  onChange={(e) =>
                    patchDraft({ acceptCard: e.target.checked })
                  }
                />
                <span>Accept card payment</span>
              </label>
            </>
          ) : null}

          <h3>Authorization signature</h3>
          <label>
            Section label
            <input
              value={draft.authorizedLabel}
              onChange={(e) =>
                patchDraft({ authorizedLabel: e.target.value })
              }
            />
          </label>
          <label>
            Signer name
            <input
              value={draft.authorizedName}
              onChange={(e) =>
                patchDraft({ authorizedName: e.target.value })
              }
              placeholder="Full name"
            />
          </label>
          <label>
            Title
            <input
              value={draft.authorizedTitle}
              onChange={(e) =>
                patchDraft({ authorizedTitle: e.target.value })
              }
            />
          </label>
          <label className="inv-check">
            <input
              type="checkbox"
              checked={draft.useDigitalSignature}
              onChange={(e) =>
                patchDraft({
                  useDigitalSignature: e.target.checked,
                  digitalSignatureDataUrl: e.target.checked
                    ? draft.digitalSignatureDataUrl
                    : null,
                })
              }
            />
            <span>Use digital signature</span>
          </label>
          {draft.useDigitalSignature ? (
            <div className="inv-sign-tools">
              <label>
                Upload signature image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      patchDraft({
                        digitalSignatureDataUrl: String(reader.result || ''),
                      })
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
              <InvoiceSignaturePad
                onApply={(dataUrl) =>
                  patchDraft({ digitalSignatureDataUrl: dataUrl })
                }
              />
              {draft.digitalSignatureDataUrl ? (
                <div className="inv-sign-preview">
                  <img src={draft.digitalSignatureDataUrl} alt="Signature" />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      patchDraft({ digitalSignatureDataUrl: null })
                    }
                  >
                    Clear signature
                  </button>
                </div>
              ) : (
                <p className="muted">Draw or upload a signature to apply.</p>
              )}
            </div>
          ) : (
            <p className="muted">Blank signature line will appear for wet ink.</p>
          )}

          <h3>PDF footer note</h3>
          <label>
            Note (colored footer)
            <textarea
              value={draft.note}
              rows={3}
              onChange={(e) => patchDraft({ note: e.target.value })}
            />
          </label>
          <p className="muted">
            Logo comes from Balance Sheet template
            {draft.logoUrl ? ' (loaded).' : ' (none uploaded yet).'}
          </p>
          </div>
        </aside>

        <div className="inv-canvas">
          <ProjectInvoiceDocument
            draft={draft}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPatchDraft={patchDraft}
            onChangeLine={changeLine}
            onChangeTextBox={changeTextBox}
            onMoveTextBox={(boxId, x, y) => changeTextBox(boxId, { x, y })}
          />
        </div>
      </div>
    </>
  )
}
