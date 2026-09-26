import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api/client";
import { FileUploadField } from "../components/FileUploadField";
import {
  BalanceSheetDocument,
  sampleBalanceSheetReport,
} from "../components/BalanceSheetDocument";
import {
  DebitCreditVoucherView,
  VOUCHER_COLOR_THEMES,
  type VoucherThemeId,
} from "../components/DebitVoucher";
import {
  BLOCK_LABELS,
  defaultBalanceSheetTemplate,
  defaultJournalVoucherTemplate,
  defaultVoucherConfig,
  hydrateClientTemplate,
  normalizeTemplateLayout,
  type BalanceSheetTemplate,
  type LogoAlign,
  type ReportTemplateBlockType,
  type TemplateBlock,
  type VoucherConfig,
} from "../types/report-template";
import {
  clearJournalVoucherTemplateCache,
  amountInWords,
} from "../utils/journalVoucherPdf";
import { type JournalEntry } from "../types/accounting";

function SortableBlockCard({
  block,
  selected,
  onSelect,
}: {
  block: TemplateBlock;
  selected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      type='button'
      ref={setNodeRef}
      style={style}
      className={`tpl-block-card${selected ? " is-selected" : ""}${
        isDragging ? " is-dragging" : ""
      }${block.visible === false ? " is-hidden-block" : ""}`}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span className='tpl-drag-handle' aria-hidden>
        ⋮⋮
      </span>
      <span className='tpl-block-label'>{BLOCK_LABELS[block.type]}</span>
      <span className='muted'>
        {block.visible !== false ? "Visible" : "Hidden"}
      </span>
    </button>
  );
}

function sampleJournalEntry(): JournalEntry {
  return {
    id: "sample",
    entryNumber: "JV-0001",
    date: new Date().toISOString(),
    memo: "Sample office expense voucher",
    reference: null,
    status: "posted",
    source: "manual",
    journalType: "expense",
    projectId: null,
    totalDebit: 3499.5,
    totalCredit: 3499.5,
    postedAt: null,
    createdBy: null,
    approvedBy: null,
    approvedAt: null,
    reversedByEntryId: null,
    reversesEntryId: null,
    lines: [
      {
        accountCode: "5230",
        accountName: "Office Expense",
        debit: 2450,
        credit: 0,
        description: "Brand Identity Design & UI Guidelines Package",
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: "Apex Global Technologies Ltd.",
      },
      {
        accountCode: "5230",
        accountName: "Office Expense",
        debit: 850.5,
        credit: 0,
        description: "Website Front-end Development & Integration",
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: "Apex Global Technologies Ltd.",
      },
      {
        accountCode: "5230",
        accountName: "Office Expense",
        debit: 199,
        credit: 0,
        description: "Social Media Banner Collaterals",
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: null,
      },
      {
        accountCode: "1111",
        accountName: "Cash in Hand",
        debit: 0,
        credit: 3499.5,
        description: "Cash payment",
        projectId: null,
        entityType: null,
        entityId: null,
        entityName: null,
      },
    ],
  };
}

function JournalVoucherPreview({
  template,
  previewKind,
}: {
  template: BalanceSheetTemplate;
  previewKind: "debit" | "credit";
}) {
  const entry = useMemo(() => sampleJournalEntry(), []);
  const vc: VoucherConfig = {
    ...defaultVoucherConfig(),
    ...(template.voucherConfig ?? {}),
  };
  const d = entry.date.slice(0, 10).split("-");
  const items = entry.lines
    .filter((l) => (previewKind === "debit" ? l.debit > 0 : l.credit > 0))
    .map((l, i) => {
      const amt = previewKind === "debit" ? l.debit : l.credit;
      const whole = Math.floor(amt);
      const cents = Math.round((amt - whole) * 100);
      return {
        id: String(i),
        description: l.description || `${l.accountCode} · ${l.accountName}`,
        major: whole.toLocaleString("en-US"),
        minor: String(cents).padStart(2, "0"),
      };
    });

  return (
    <div className='tpl-voucher-preview-wrap'>
      <DebitCreditVoucherView
        kind={previewKind}
        companyName={template.headerConfig.companyName}
        companySubtitle={vc.companySubtitle}
        companyLogoUrl={template.companyLogoUrl}
        voucherNo={entry.entryNumber}
        day={d[2] ?? ""}
        month={d[1] ?? ""}
        year={d[0] ?? ""}
        receivedBy=''
        partyName={
          entry.lines.find((l) => l.entityName)?.entityName ??
          "Sample Party Ltd."
        }
        currencyLabel={vc.currencyLabel}
        majorUnitLabel={vc.majorUnitLabel}
        minorUnitLabel={vc.minorUnitLabel}
        amountInWordsLabel={vc.amountInWordsLabel}
        amountInWords={amountInWords(entry.totalDebit)}
        items={
          items.length
            ? items
            : [
                {
                  id: "1",
                  description: entry.memo,
                  major: String(Math.floor(entry.totalDebit)),
                  minor: "00",
                },
              ]
        }
        signatories={vc.signatoryTitles.map((title, i) => ({
          id: `s${i}`,
          title,
        }))}
        themeId={vc.theme}
        showWatermark={vc.showWatermark}
      />
      <p className='muted' style={{ marginTop: 12, fontSize: 12 }}>
        Save the template. Journal preview and download use this color, logo,
        and sidebar text.
      </p>
    </div>
  );
}

type Kind = "balance-sheet" | "journal-voucher";

const KIND_META: Record<
  Kind,
  {
    title: string;
    fallback: () => BalanceSheetTemplate;
    load: () => Promise<BalanceSheetTemplate>;
    save: (body: BalanceSheetTemplate) => Promise<BalanceSheetTemplate>;
    allowed: ReportTemplateBlockType[];
  }
> = {
  "balance-sheet": {
    title: "Balance Sheet Template",
    fallback: defaultBalanceSheetTemplate,
    load: () => api.balanceSheetTemplate(),
    save: (body) =>
      api.saveBalanceSheetTemplate({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? "",
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure,
        footerConfig: body.footerConfig,
      }),
    allowed: [
      "LOGO",
      "COMPANY_HEADER",
      "METRIC_TILES",
      "ASSETS_SECTION",
      "LIABILITIES_SECTION",
      "EQUITY_SECTION",
      "FOOTER_SIGNATURES",
    ],
  },
  "journal-voucher": {
    title: "Debit / Credit Voucher Template",
    fallback: defaultJournalVoucherTemplate,
    load: () => api.journalVoucherTemplate(),
    save: (body) =>
      api.saveJournalVoucherTemplate({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? null,
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure.map((block) => ({
          id: block.id,
          type: block.type,
          position: block.position,
          visible: block.visible !== false,
          styles: block.styles ?? {},
        })),
        footerConfig: body.footerConfig,
        voucherConfig: body.voucherConfig
          ? {
              theme: body.voucherConfig.theme,
              companySubtitle: body.voucherConfig.companySubtitle ?? "",
              currencyLabel: body.voucherConfig.currencyLabel,
              majorUnitLabel: body.voucherConfig.majorUnitLabel,
              minorUnitLabel: body.voucherConfig.minorUnitLabel,
              amountInWordsLabel: body.voucherConfig.amountInWordsLabel,
              showWatermark: body.voucherConfig.showWatermark,
              signatoryTitles: body.voucherConfig.signatoryTitles ?? [],
            }
          : null,
      }),
    allowed: [
      "LOGO",
      "COMPANY_HEADER",
      "VOUCHER_META",
      "LINES_TABLE",
      "FOOTER_SIGNATURES",
    ],
  },
};

export function ReportTemplateBuilderPage({ kind }: { kind: Kind }) {
  const meta = KIND_META[kind];
  const [draft, setDraft] = useState<BalanceSheetTemplate>(meta.fallback);
  const [selectedId, setSelectedId] = useState("logo");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voucherPreviewKind, setVoucherPreviewKind] = useState<
    "debit" | "credit"
  >("debit");
  const sampleBs = useMemo(() => sampleBalanceSheetReport(), []);

  function patchVoucherConfig(patch: Partial<VoucherConfig>) {
    setDraft((prev) => ({
      ...prev,
      voucherConfig: {
        ...defaultVoucherConfig(),
        ...(prev.voucherConfig ?? {}),
        ...patch,
      },
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const template = hydrateClientTemplate(
          await meta.load(),
          meta.fallback(),
        );
        if (cancelled) return;
        setDraft(template);
        setSelectedId(template.layoutStructure[0]?.id ?? "logo");
      } catch (err: unknown) {
        if (cancelled) return;
        setDraft(meta.fallback());
        setError(
          err instanceof Error ? err.message : "Unable to load template",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when kind changes
  }, [kind]);

  const selected = draft.layoutStructure.find((b) => b.id === selectedId);

  function updateBlocks(next: TemplateBlock[]) {
    setDraft((prev) => ({
      ...prev,
      layoutStructure: normalizeTemplateLayout(next),
    }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.layoutStructure.findIndex((b) => b.id === active.id);
    const newIndex = draft.layoutStructure.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    updateBlocks(arrayMove(draft.layoutStructure, oldIndex, newIndex));
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
    );
  }

  async function onUploadLogo(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const { url } = await api.uploadTemplateLogo(file);
      setDraft((prev) => ({ ...prev, companyLogoUrl: url }));
      setMessage("Logo uploaded");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = hydrateClientTemplate(
        await meta.save(draft),
        meta.fallback(),
      );
      setDraft(saved);
      setSelectedId(saved.layoutStructure[0]?.id ?? selectedId);
      if (kind === "journal-voucher") clearJournalVoucherTemplateCache();
      setMessage("Template saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    const next = meta.fallback();
    setDraft(next);
    setSelectedId(next.layoutStructure[0]?.id ?? "logo");
    setMessage("Reset to default (not saved yet)");
  }

  if (loading) {
    return <p className='muted'>Loading template builder…</p>;
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>{meta.title}</h1>
          <p className='muted'>
            Drag blocks to reorder. Saved layout drives on-screen and PDF
            output.
          </p>
        </div>
        <div className='header-actions'>
          <button type='button' onClick={onReset}>
            Reset to Default
          </button>
          <button type='button' disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </header>

      {error ? <p className='form-error'>{error}</p> : null}
      {message ? <p className='muted'>{message}</p> : null}

      <div className='tpl-builder'>
        <aside className='max-h-screen overflow-y-auto tpl-sidebar'>
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
            label='Company logo'
            accept='image/*'
            hint='Used on invoices, JV, salary slips, and other PDFs'
            onFile={(file) => void onUploadLogo(file)}
          />
          {draft.companyLogoUrl ? (
            <button
              type='button'
              className='action-link'
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
          <label className='tpl-check'>
            <input
              type='checkbox'
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
          <label className='tpl-check'>
            <input
              type='checkbox'
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
          <label className='tpl-check'>
            <input
              type='checkbox'
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
          <label className='tpl-check'>
            <input
              type='checkbox'
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

          {kind === "journal-voucher" ? (
            <>
              <h3>Debit / Credit voucher style</h3>
              <p className='muted'>
                Landscape template used for payment &amp; receipt journals.
              </p>
              <label className='text-xs font-bold uppercase tracking-wider block mb-2'>
                Color theme
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {VOUCHER_COLOR_THEMES.map((theme) => {
                  const active =
                    (draft.voucherConfig?.theme ?? "color") === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type='button'
                      title={theme.name}
                      onClick={() =>
                        patchVoucherConfig({
                          theme: theme.id as VoucherThemeId,
                        })
                      }
                      style={{
                        height: 40,
                        borderRadius: 8,
                        border: active
                          ? "2px solid #0f172a"
                          : "2px solid #e2e8f0",
                        background: theme.id === "bw" ? "#ffffff" : theme.accent,
                        color: theme.id === "bw" ? "#111111" : theme.sidebarText,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {theme.name}
                    </button>
                  );
                })}
              </div>
              <label>
                Company subtitle
                <input
                  value={draft.voucherConfig?.companySubtitle ?? ""}
                  onChange={(e) =>
                    patchVoucherConfig({ companySubtitle: e.target.value })
                  }
                  placeholder='e.g. Creative Studio'
                />
              </label>
              <label>
                Currency label
                <input
                  value={
                    draft.voucherConfig?.currencyLabel ??
                    defaultVoucherConfig().currencyLabel
                  }
                  onChange={(e) =>
                    patchVoucherConfig({ currencyLabel: e.target.value })
                  }
                />
              </label>
              <div className='name-row'>
                <label>
                  Major unit
                  <input
                    value={
                      draft.voucherConfig?.majorUnitLabel ??
                      defaultVoucherConfig().majorUnitLabel
                    }
                    onChange={(e) =>
                      patchVoucherConfig({ majorUnitLabel: e.target.value })
                    }
                  />
                </label>
                <label>
                  Minor unit
                  <input
                    value={
                      draft.voucherConfig?.minorUnitLabel ??
                      defaultVoucherConfig().minorUnitLabel
                    }
                    onChange={(e) =>
                      patchVoucherConfig({ minorUnitLabel: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Amount in words label
                <input
                  value={
                    draft.voucherConfig?.amountInWordsLabel ??
                    defaultVoucherConfig().amountInWordsLabel
                  }
                  onChange={(e) =>
                    patchVoucherConfig({ amountInWordsLabel: e.target.value })
                  }
                />
              </label>
              <label>
                Sidebar signatory titles (one per line)
                <textarea
                  rows={6}
                  value={(
                    draft.voucherConfig?.signatoryTitles ??
                    defaultVoucherConfig().signatoryTitles
                  ).join("\n")}
                  onChange={(e) =>
                    patchVoucherConfig({
                      signatoryTitles: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className='tpl-check'>
                <input
                  type='checkbox'
                  checked={draft.voucherConfig?.showWatermark !== false}
                  onChange={(e) =>
                    patchVoucherConfig({ showWatermark: e.target.checked })
                  }
                />
                Show watermark in preview
              </label>
            </>
          ) : null}

          <h3>Layout blocks</h3>
          <p className='muted'>Drag to reorder. Click to edit visibility.</p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={draft.layoutStructure.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className='tpl-block-list'>
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
            <div className='tpl-block-editor'>
              <h3>{BLOCK_LABELS[selected.type]}</h3>
              <label className='tpl-check'>
                <input
                  type='checkbox'
                  checked={selected.visible !== false}
                  onChange={(e) =>
                    patchBlock(selected.id, { visible: e.target.checked })
                  }
                />
                Visible on report
              </label>
              {selected.type === "LOGO" ? (
                <label>
                  Logo alignment
                  <select
                    value={selected.styles?.logoAlign ?? "center"}
                    onChange={(e) =>
                      patchBlock(selected.id, {
                        styles: {
                          ...selected.styles,
                          logoAlign: e.target.value as LogoAlign,
                        },
                      })
                    }
                  >
                    <option value='left'>Left</option>
                    <option value='center'>Center</option>
                    <option value='right'>Right</option>
                  </select>
                </label>
              ) : null}
              {(selected.type === "ASSETS_SECTION" ||
                selected.type === "LIABILITIES_SECTION" ||
                selected.type === "EQUITY_SECTION" ||
                selected.type === "LINES_TABLE") && (
                <>
                  <label className='tpl-check'>
                    <input
                      type='checkbox'
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
                  {(selected.type === "ASSETS_SECTION" ||
                    selected.type === "LIABILITIES_SECTION") && (
                    <label className='tpl-check'>
                      <input
                        type='checkbox'
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
                      Show party names (receivables, advances, payables, unpaid
                      salaries)
                    </label>
                  )}
                </>
              )}
            </div>
          ) : null}
        </aside>

        <section className='tpl-canvas table-card'>
          <div className='table-head'>
            <div>
              <h2>Live preview</h2>
              <p className='muted'>
                Sample data — save to apply on real reports
              </p>
            </div>
            {kind === "journal-voucher" ? (
              <div className='form-actions'>
                <button
                  type='button'
                  className={
                    voucherPreviewKind === "debit" ? undefined : "ghost"
                  }
                  onClick={() => setVoucherPreviewKind("debit")}
                >
                  Debit
                </button>
                <button
                  type='button'
                  className={
                    voucherPreviewKind === "credit" ? undefined : "ghost"
                  }
                  onClick={() => setVoucherPreviewKind("credit")}
                >
                  Credit
                </button>
              </div>
            ) : null}
          </div>
          {kind === "balance-sheet" ? (
            <BalanceSheetDocument
              report={sampleBs}
              template={draft}
              interactive={false}
            />
          ) : (
            <JournalVoucherPreview
              template={draft}
              previewKind={voucherPreviewKind}
            />
          )}
        </section>
      </div>
    </>
  );
}

export function BalanceSheetTemplateBuilderPage() {
  return <ReportTemplateBuilderPage kind='balance-sheet' />;
}

export function JournalVoucherTemplateBuilderPage() {
  return <ReportTemplateBuilderPage kind='journal-voucher' />;
}
