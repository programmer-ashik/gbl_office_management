import { useEffect, useMemo, useState } from 'react'
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
import { api } from '../api/client'
import { FileUploadField } from '../components/FileUploadField'
import {
  BalanceSheetDocument,
  sampleBalanceSheetReport,
} from '../components/BalanceSheetDocument'
import {
  BLOCK_LABELS,
  defaultBalanceSheetTemplate,
  defaultJournalVoucherTemplate,
  hydrateClientTemplate,
  normalizeTemplateLayout,
  type BalanceSheetTemplate,
  type LogoAlign,
  type ReportTemplateBlockType,
  type TemplateBlock,
} from '../types/report-template'
import { clearJournalVoucherTemplateCache } from '../utils/journalVoucherPdf'
import { money, type JournalEntry } from '../types/accounting'

function SortableBlockCard({
  block,
  selected,
  onSelect,
}: {
  block: TemplateBlock
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      className={`tpl-block-card${selected ? ' is-selected' : ''}${
        isDragging ? ' is-dragging' : ''
      }${block.visible === false ? ' is-hidden-block' : ''}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span className="tpl-drag-handle" aria-hidden>
        ⋮⋮
      </span>
      <span className="tpl-block-label">{BLOCK_LABELS[block.type]}</span>
      <span className="muted">
        {block.visible !== false ? 'Visible' : 'Hidden'}
      </span>
    </button>
  )
}

function sampleJournalEntry(): JournalEntry {
  return {
    id: 'sample',
    entryNumber: 'JV-0001',
    date: new Date().toISOString(),
    memo: 'Sample office expense voucher',
    reference: null,
    status: 'posted',
    source: 'manual',
    journalType: 'general',
    projectId: null,
    totalDebit: 25000,
    totalCredit: 25000,
    postedAt: null,
    createdBy: null,
    approvedBy: null,
    approvedAt: null,
    reversedByEntryId: null,
    reversesEntryId: null,
    lines: [
      {
        accountCode: '5230',
        accountName: 'Admin Salaries',
        debit: 25000,
        credit: 0,
        description: 'Sample line',
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: null,
      },
      {
        accountCode: '1112',
        accountName: 'BRAC Bank',
        debit: 0,
        credit: 25000,
        description: 'Sample line',
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: null,
      },
    ],
  }
}

function JournalVoucherPreview({
  template,
}: {
  template: BalanceSheetTemplate
}) {
  const entry = useMemo(() => sampleJournalEntry(), [])
  const blocks = [...template.layoutStructure]
    .filter((b) => b.visible !== false)
    .sort((a, b) => a.position - b.position)

  return (
    <div className="bs-report bs-document">
      {blocks.map((block) => {
        if (block.type === 'LOGO') {
          return (
            <div
              key={block.id}
              className={`bs-logo-block bs-logo-${block.styles?.logoAlign ?? 'center'}`}
            >
              {template.companyLogoUrl ? (
                <img
                  src={template.companyLogoUrl}
                  alt="Logo"
                  className="bs-logo-img"
                />
              ) : (
                <div className="bs-logo-placeholder">Logo</div>
              )}
            </div>
          )
        }
        if (block.type === 'COMPANY_HEADER') {
          return (
            <header key={block.id} className="bs-doc-header">
              <h2 className="bs-doc-company">
                {template.headerConfig.companyName}
              </h2>
              <p className="bs-doc-title">{template.headerConfig.reportTitle}</p>
              {template.headerConfig.address ? (
                <p className="muted">{template.headerConfig.address}</p>
              ) : null}
            </header>
          )
        }
        if (block.type === 'VOUCHER_META') {
          return (
            <div key={block.id} className="tpl-voucher-meta">
              <p>
                <strong>Voucher No:</strong> {entry.entryNumber}
              </p>
              <p>
                <strong>Date:</strong> {entry.date.slice(0, 10)}
              </p>
              <p>
                <strong>Status:</strong> {entry.status}
              </p>
              <p>
                <strong>Memo:</strong> {entry.memo}
              </p>
            </div>
          )
        }
        if (block.type === 'LINES_TABLE') {
          const showCodes = block.styles?.showAccountCodes !== false
          return (
            <div key={block.id} className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Description</th>
                    <th>Debit</th>
                    <th>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        {showCodes
                          ? `${line.accountCode} · ${line.accountName}`
                          : line.accountName}
                      </td>
                      <td>{line.description}</td>
                      <td className="bs-amount">
                        {line.debit ? money(line.debit) : ''}
                      </td>
                      <td className="bs-amount">
                        {line.credit ? money(line.credit) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.type === 'FOOTER_SIGNATURES') {
          const f = template.footerConfig
          const labels = [f.preparedByLabel, f.checkedByLabel, f.authorizedLabel]
          if (f.showManagingDirector) labels.push(f.managingDirectorLabel)
          if (f.showAuditor) labels.push(f.auditorLabel)
          return (
            <footer key={block.id} className="bs-signature-grid">
              {labels.map((label) => (
                <div key={label} className="bs-signature-slot">
                  <div className="bs-signature-line" />
                  <p>{label}</p>
                </div>
              ))}
            </footer>
          )
        }
        return null
      })}
    </div>
  )
}

type Kind = 'balance-sheet' | 'journal-voucher'

const KIND_META: Record<
  Kind,
  {
    title: string
    fallback: () => BalanceSheetTemplate
    load: () => Promise<BalanceSheetTemplate>
    save: (body: BalanceSheetTemplate) => Promise<BalanceSheetTemplate>
    allowed: ReportTemplateBlockType[]
  }
> = {
  'balance-sheet': {
    title: 'Balance Sheet Template',
    fallback: defaultBalanceSheetTemplate,
    load: () => api.balanceSheetTemplate(),
    save: (body) =>
      api.saveBalanceSheetTemplate({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? '',
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure,
        footerConfig: body.footerConfig,
      }),
    allowed: [
      'LOGO',
      'COMPANY_HEADER',
      'METRIC_TILES',
      'ASSETS_SECTION',
      'LIABILITIES_SECTION',
      'EQUITY_SECTION',
      'FOOTER_SIGNATURES',
    ],
  },
  'journal-voucher': {
    title: 'Journal Voucher Template',
    fallback: defaultJournalVoucherTemplate,
    load: () => api.journalVoucherTemplate(),
    save: (body) =>
      api.saveJournalVoucherTemplate({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? '',
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure,
        footerConfig: body.footerConfig,
      }),
    allowed: [
      'LOGO',
      'COMPANY_HEADER',
      'VOUCHER_META',
      'LINES_TABLE',
      'FOOTER_SIGNATURES',
    ],
  },
}

export function ReportTemplateBuilderPage({ kind }: { kind: Kind }) {
  const meta = KIND_META[kind]
  const [draft, setDraft] = useState<BalanceSheetTemplate>(meta.fallback)
  const [selectedId, setSelectedId] = useState('logo')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const sampleBs = useMemo(() => sampleBalanceSheetReport(), [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const template = hydrateClientTemplate(
          await meta.load(),
          meta.fallback(),
        )
        if (cancelled) return
        setDraft(template)
        setSelectedId(template.layoutStructure[0]?.id ?? 'logo')
      } catch (err: unknown) {
        if (cancelled) return
        setDraft(meta.fallback())
        setError(err instanceof Error ? err.message : 'Unable to load template')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when kind changes
  }, [kind])

  const selected = draft.layoutStructure.find((b) => b.id === selectedId)

  function updateBlocks(next: TemplateBlock[]) {
    setDraft((prev) => ({
      ...prev,
      layoutStructure: normalizeTemplateLayout(next),
    }))
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = draft.layoutStructure.findIndex((b) => b.id === active.id)
    const newIndex = draft.layoutStructure.findIndex((b) => b.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    updateBlocks(arrayMove(draft.layoutStructure, oldIndex, newIndex))
  }

  function patchBlock(id: string, patch: Partial<TemplateBlock>) {
    updateBlocks(
      draft.layoutStructure.map((block) =>
        block.id === id
          ? {
              ...block,
              ...patch,
              styles: { ...block.styles, ...(patch.styles ?? {}) },
            }
          : block,
      ),
    )
  }

  async function onUploadLogo(file: File | null) {
    if (!file) return
    setError(null)
    try {
      const { url } = await api.uploadTemplateLogo(file)
      setDraft((prev) => ({ ...prev, companyLogoUrl: url }))
      setMessage('Logo uploaded')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Logo upload failed')
    }
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = hydrateClientTemplate(await meta.save(draft), meta.fallback())
      setDraft(saved)
      setSelectedId(saved.layoutStructure[0]?.id ?? selectedId)
      if (kind === 'journal-voucher') clearJournalVoucherTemplateCache()
      setMessage('Template saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function onReset() {
    const next = meta.fallback()
    setDraft(next)
    setSelectedId(next.layoutStructure[0]?.id ?? 'logo')
    setMessage('Reset to default (not saved yet)')
  }

  if (loading) {
    return <p className="muted">Loading template builder…</p>
  }

  return (
    <>
      <header className="workspace-header tpl-sticky-bar">
        <div>
          <h1>{meta.title}</h1>
          <p className="muted">
            Drag blocks to reorder. Saved layout drives on-screen and PDF output.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onReset}>
            Reset to Default
          </button>
          <button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <div className="tpl-builder">
        <aside className="tpl-sidebar table-card">
          <h2>Settings</h2>
          <label>
            Template name
            <input
              value={draft.templateName}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, templateName: e.target.value }))
              }
            />
          </label>
          <FileUploadField
            label="Company logo"
            accept="image/*"
            hint="Used on invoices, JV, salary slips, and other PDFs"
            onFile={(file) => void onUploadLogo(file)}
          />
          {draft.companyLogoUrl ? (
            <button
              type="button"
              className="action-link"
              onClick={() =>
                setDraft((prev) => ({ ...prev, companyLogoUrl: null }))
              }
            >
              Remove logo
            </button>
          ) : null}

          <h3>Header</h3>
          <label>
            Company name
            <input
              value={draft.headerConfig.companyName}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: {
                    ...prev.headerConfig,
                    companyName: e.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Report title
            <input
              value={draft.headerConfig.reportTitle}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: {
                    ...prev.headerConfig,
                    reportTitle: e.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Address
            <input
              value={draft.headerConfig.address}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: {
                    ...prev.headerConfig,
                    address: e.target.value,
                  },
                }))
              }
            />
          </label>
          <label>
            Tax ID / BIN
            <input
              value={draft.headerConfig.taxId}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: { ...prev.headerConfig, taxId: e.target.value },
                }))
              }
            />
          </label>
          <label className="tpl-check">
            <input
              type="checkbox"
              checked={draft.headerConfig.showDate}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: {
                    ...prev.headerConfig,
                    showDate: e.target.checked,
                  },
                }))
              }
            />
            Show date
          </label>
          <label className="tpl-check">
            <input
              type="checkbox"
              checked={draft.headerConfig.showStatusBadge}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  headerConfig: {
                    ...prev.headerConfig,
                    showStatusBadge: e.target.checked,
                  },
                }))
              }
            />
            Show status badge
          </label>

          <h3>Signatures</h3>
          <label className="tpl-check">
            <input
              type="checkbox"
              checked={draft.footerConfig.showManagingDirector}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  footerConfig: {
                    ...prev.footerConfig,
                    showManagingDirector: e.target.checked,
                  },
                }))
              }
            />
            Show Managing Director signature
          </label>
          <label className="tpl-check">
            <input
              type="checkbox"
              checked={draft.footerConfig.showAuditor}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  footerConfig: {
                    ...prev.footerConfig,
                    showAuditor: e.target.checked,
                  },
                }))
              }
            />
            Show Auditor signature
          </label>

          <h3>Layout blocks</h3>
          <p className="muted">Drag to reorder. Click to edit visibility.</p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={draft.layoutStructure.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="tpl-block-list">
                {draft.layoutStructure.map((block) => (
                  <SortableBlockCard
                    key={block.id}
                    block={block}
                    selected={block.id === selectedId}
                    onSelect={() => setSelectedId(block.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {selected ? (
            <div className="tpl-block-editor">
              <h3>{BLOCK_LABELS[selected.type]}</h3>
              <label className="tpl-check">
                <input
                  type="checkbox"
                  checked={selected.visible !== false}
                  onChange={(e) =>
                    patchBlock(selected.id, { visible: e.target.checked })
                  }
                />
                Visible on report
              </label>
              {selected.type === 'LOGO' ? (
                <label>
                  Logo alignment
                  <select
                    value={selected.styles?.logoAlign ?? 'center'}
                    onChange={(e) =>
                      patchBlock(selected.id, {
                        styles: {
                          ...selected.styles,
                          logoAlign: e.target.value as LogoAlign,
                        },
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              ) : null}
              {(selected.type === 'ASSETS_SECTION' ||
                selected.type === 'LIABILITIES_SECTION' ||
                selected.type === 'EQUITY_SECTION' ||
                selected.type === 'LINES_TABLE') && (
                <>
                  <label className="tpl-check">
                    <input
                      type="checkbox"
                      checked={selected.styles?.showAccountCodes !== false}
                      onChange={(e) =>
                        patchBlock(selected.id, {
                          styles: {
                            ...selected.styles,
                            showAccountCodes: e.target.checked,
                          },
                        })
                      }
                    />
                    Show account codes
                  </label>
                  {(selected.type === 'ASSETS_SECTION' ||
                    selected.type === 'LIABILITIES_SECTION') && (
                    <label className="tpl-check">
                      <input
                        type="checkbox"
                        checked={selected.styles?.showPartyBreakdown === true}
                        onChange={(e) =>
                          patchBlock(selected.id, {
                            styles: {
                              ...selected.styles,
                              showPartyBreakdown: e.target.checked,
                            },
                          })
                        }
                      />
                      Show party names (receivables, advances, payables,
                      unpaid salaries)
                    </label>
                  )}
                </>
              )}
            </div>
          ) : null}
        </aside>

        <section className="tpl-canvas table-card">
          <div className="table-head">
            <h2>Live preview</h2>
            <p className="muted">Sample data — save to apply on real reports</p>
          </div>
          {kind === 'balance-sheet' ? (
            <BalanceSheetDocument
              report={sampleBs}
              template={draft}
              interactive={false}
            />
          ) : (
            <JournalVoucherPreview template={draft} />
          )}
        </section>
      </div>
    </>
  )
}

export function BalanceSheetTemplateBuilderPage() {
  return <ReportTemplateBuilderPage kind="balance-sheet" />
}

export function JournalVoucherTemplateBuilderPage() {
  return <ReportTemplateBuilderPage kind="journal-voucher" />
}
