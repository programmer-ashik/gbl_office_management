import { jsPDF } from 'jspdf'
import { voucherAccentRgb, voucherSidebarTextRgb } from '../components/DebitVoucher'
import {
  JOURNAL_TYPE_LABEL,
  JournalType,
  type JournalEntry,
  type JournalLine,
} from '../types/accounting'
import {
  defaultJournalVoucherTemplate,
  defaultVoucherConfig,
  hydrateClientTemplate,
  resolveAssetUrl,
  type BalanceSheetTemplate,
  type VoucherConfig,
} from '../types/report-template'

const MUTED: [number, number, number] = [90, 101, 120]
const INK: [number, number, number] = [33, 37, 41]
const LIGHT_GRAY: [number, number, number] = [220, 220, 220]
const TOTAL_GRAY: [number, number, number] = [180, 180, 180]

export type VoucherKind = 'debit' | 'credit' | 'journal'

/** Payment / outflow → Debit Voucher; receipt / inflow → Credit Voucher. */
export function resolveVoucherKind(entry: JournalEntry): VoucherKind {
  switch (entry.journalType) {
    case JournalType.CASH_PAYMENT:
    case JournalType.BANK_WITHDRAWAL:
    case JournalType.SUPPLIER_PAYMENT:
    case JournalType.EXPENSE:
    case JournalType.PURCHASE:
    case JournalType.PROJECT_COST:
    case JournalType.OTHER_EXPENSE:
    case JournalType.EMPLOYEE_ADVANCE:
      return 'debit'
    case JournalType.CASH_RECEIPT:
    case JournalType.BANK_DEPOSIT:
    case JournalType.CUSTOMER_RECEIPT:
    case JournalType.SALES:
    case JournalType.PROJECT_REVENUE:
    case JournalType.OTHER_INCOME:
      return 'credit'
    default:
      break
  }

  // Infer from cash / bank lines when journal type is general or mixed
  let cashDebit = 0
  let cashCredit = 0
  for (const line of entry.lines) {
    const label = `${line.accountCode} ${line.accountName}`.toLowerCase()
    if (!/cash|bank|treasury|petty/.test(label)) continue
    cashDebit += line.debit || 0
    cashCredit += line.credit || 0
  }
  if (cashCredit > cashDebit && cashCredit > 0) return 'debit'
  if (cashDebit > cashCredit && cashDebit > 0) return 'credit'
  return 'journal'
}

export function voucherKindTitle(kind: VoucherKind): string {
  if (kind === 'debit') return 'Debit Voucher'
  if (kind === 'credit') return 'Credit Voucher'
  return 'Journal Voucher'
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
]

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim()
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const head = h ? `${ONES[h]} Hundred` : ''
  const tail = rest ? twoDigits(rest) : ''
  return `${head}${head && tail ? ' ' : ''}${tail}`.trim()
}

/** Amount in words for voucher footers (BDT). */
export function amountInWords(amount: number): string {
  const safe = Math.round(Math.abs(amount) * 100) / 100
  const taka = Math.floor(safe)
  const paisa = Math.round((safe - taka) * 100)
  if (taka === 0 && paisa === 0) return 'Zero Taka Only'

  const crore = Math.floor(taka / 10000000)
  const lakh = Math.floor((taka % 10000000) / 100000)
  const thousand = Math.floor((taka % 100000) / 1000)
  const hundred = taka % 1000

  const parts: string[] = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`)
  if (hundred) parts.push(threeDigits(hundred))

  let text = `${parts.join(' ')} Taka`
  if (paisa) text += ` and ${twoDigits(paisa)} Paisa`
  return `${text} Only`
}

function imageFormatFromDataUrl(
  dataUrl: string,
): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg')
  ) {
    return 'JPEG'
  }
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return null
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function parseVoucherDate(iso: string): { day: string; month: string; year: string } {
  const d = iso.slice(0, 10)
  const [y, m, day] = d.split('-')
  return {
    day: day || '',
    month: m || '',
    year: y || '',
  }
}

function partyLabel(entry: JournalEntry, kind: 'debit' | 'credit'): string {
  const preferred =
    kind === 'debit'
      ? entry.lines.find((l) => l.debit > 0 && l.entityName)?.entityName
      : entry.lines.find((l) => l.credit > 0 && l.entityName)?.entityName
  if (preferred) return preferred
  const any = entry.lines.find((l) => l.entityName)?.entityName
  if (any) return any
  const expenseLike = entry.lines.find(
    (l) =>
      l.debit > 0 &&
      !/cash|bank|treasury/i.test(`${l.accountCode} ${l.accountName}`),
  )
  if (kind === 'debit' && expenseLike) {
    return `${expenseLike.accountCode} · ${expenseLike.accountName}`
  }
  const incomeLike = entry.lines.find(
    (l) =>
      l.credit > 0 &&
      !/cash|bank|treasury/i.test(`${l.accountCode} ${l.accountName}`),
  )
  if (kind === 'credit' && incomeLike) {
    return `${incomeLike.accountCode} · ${incomeLike.accountName}`
  }
  return ''
}

function voucherLineItems(
  entry: JournalEntry,
  kind: 'debit' | 'credit',
): Array<{ description: string; major: string; minor: string }> {
  const lines: JournalLine[] =
    kind === 'debit'
      ? entry.lines.filter((l) => l.debit > 0)
      : entry.lines.filter((l) => l.credit > 0)
  const source = lines.length > 0 ? lines : entry.lines
  return source.map((line) => {
    const amt = kind === 'debit' ? line.debit || line.credit : line.credit || line.debit
    const whole = Math.floor(Math.abs(amt))
    const cents = Math.round((Math.abs(amt) - whole) * 100)
    const desc =
      line.description?.trim() ||
      `${line.accountCode} · ${line.accountName}` ||
      entry.memo
    return {
      description: desc,
      major: whole.toLocaleString('en-US'),
      minor: String(cents).padStart(2, '0'),
    }
  })
}

function resolveVoucherConfig(template: BalanceSheetTemplate): VoucherConfig {
  return {
    ...defaultVoucherConfig(),
    ...(template.voucherConfig ?? {}),
    signatoryTitles:
      template.voucherConfig?.signatoryTitles?.length
        ? template.voucherConfig.signatoryTitles
        : defaultVoucherConfig().signatoryTitles,
  }
}

/**
 * Landscape sidebar Debit / Credit voucher matching DebitVoucher.tsx design.
 */
async function buildDebitCreditVoucherPdf(
  entry: JournalEntry,
  kind: 'debit' | 'credit',
  template: BalanceSheetTemplate,
  options?: { forceTitle?: string },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const SIDEBAR_W = 58
  const PAD = 8
  const contentX = SIDEBAR_W + PAD
  const contentRight = pageW - PAD
  const contentW = contentRight - contentX

  const header = template.headerConfig
  const vc = resolveVoucherConfig(template)
  const accent = voucherAccentRgb(vc.theme)
  const sidebarText = voucherSidebarTextRgb(vc.theme)
  const company = header.companyName || 'GBL Enterprise'
  const { day, month, year } = parseVoucherDate(entry.date)
  const amount = entry.totalDebit
  const party = partyLabel(entry, kind)
  const items = voucherLineItems(entry, kind)
  const title =
    options?.forceTitle ??
    (kind === 'debit' ? 'DEBIT VOUCHER' : 'CREDIT VOUCHER')
  const partyField = kind === 'debit' ? 'Paid to:' : 'Received from:'

  // —— Accent left sidebar ——
  doc.setFillColor(...accent)
  doc.rect(0, 0, SIDEBAR_W, pageH, 'F')

  // Logo only — no background box (matches DebitVoucher.tsx preview)
  // h-12 w-12 ≈ 12.7mm square
  const logoSize = 12.7
  const logoUrl = resolveAssetUrl(template.companyLogoUrl)
  let logoDrawn = false
  if (logoUrl) {
    const dataUrl = await loadImageDataUrl(logoUrl)
    const format = dataUrl ? imageFormatFromDataUrl(dataUrl) : null
    if (dataUrl && format) {
      try {
        const logoX = (SIDEBAR_W - logoSize) / 2
        doc.addImage(dataUrl, format, logoX, 10, logoSize, logoSize)
        logoDrawn = true
      } catch {
        logoDrawn = false
      }
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...sidebarText)
  const nameY = logoDrawn ? 10 + logoSize + 5 : 16
  doc.text(company.toUpperCase(), SIDEBAR_W / 2, nameY, { align: 'center' })
  if (vc.companySubtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...sidebarText)
    doc.text(vc.companySubtitle.toUpperCase(), SIDEBAR_W / 2, nameY + 4, {
      align: 'center',
    })
  }

  // Signatories
  let sigY = Math.max(nameY + (vc.companySubtitle ? 12 : 8), 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...sidebarText)
  for (const label of vc.signatoryTitles) {
    doc.text(`${label}:`, 10, sigY)
    doc.setDrawColor(...sidebarText)
    doc.setLineWidth(0.35)
    doc.line(10, sigY + 8, SIDEBAR_W - 10, sigY + 8)
    sigY += 20
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...sidebarText)
  doc.text('OFFICIAL FINANCIAL DOCUMENT', 10, pageH - 8)

  // —— Main content ——
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text('DATE', contentX, 14)

  const boxW = 16
  const boxH = 10
  const boxY = 16
  ;[
    { label: 'DAY', value: day },
    { label: 'MONTH', value: month },
    { label: 'YEAR', value: year },
  ].forEach((box, i) => {
    const x = contentX + i * (boxW + 3)
    doc.setDrawColor(180, 180, 180)
    doc.setFillColor(255, 255, 255)
    doc.setLineWidth(0.4)
    doc.rect(x, boxY, boxW, boxH, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(box.value, x + boxW / 2, boxY + 5.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(...MUTED)
    doc.text(box.label, x + boxW / 2, boxY + boxH + 3, { align: 'center' })
  })

  // Title + accent underline
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text(title, contentRight, 22, { align: 'right' })
  const titleW = doc.getTextWidth(title)
  doc.setDrawColor(...accent)
  doc.setLineWidth(1.6)
  doc.line(contentRight - Math.min(titleW, 42), 24.5, contentRight, 24.5)

  // Voucher Nu# + Received By
  let y = 38
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(`Voucher Nu#  ${entry.entryNumber}`, contentRight, y, {
    align: 'right',
  })
  y = 46
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Received By:', contentX, y)
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.35)
  doc.line(contentX + 28, y + 1, contentRight, y + 1)

  // Detail table
  y = 52
  const tableTop = y
  const amountColW = 52
  const amtX = contentRight - amountColW
  const descW = amtX - contentX
  const headerH = 14
  const bodyH = Math.max(42, 10 + items.length * 7)
  const totalH = 14
  const tableH = headerH + bodyH + totalH
  const half = amountColW / 2

  doc.setDrawColor(...INK)
  doc.setLineWidth(0.5)
  doc.rect(contentX, tableTop, contentW, tableH)
  doc.line(amtX, tableTop, amtX, tableTop + tableH)
  doc.line(contentX, tableTop + headerH, contentRight, tableTop + headerH)
  doc.line(
    contentX,
    tableTop + headerH + bodyH,
    contentRight,
    tableTop + headerH + bodyH,
  )

  // Header: party + amount labels
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(partyField, contentX + 2, tableTop + 6)
  if (party) {
    doc.setFont('helvetica', 'normal')
    doc.text(party, contentX + 22, tableTop + 6, { maxWidth: descW - 24 })
  }
  doc.setFillColor(248, 248, 248)
  doc.rect(amtX, tableTop, amountColW, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(vc.currencyLabel, amtX + amountColW / 2, tableTop + 5, {
    align: 'center',
  })
  doc.setLineWidth(0.3)
  doc.line(amtX, tableTop + 7, contentRight, tableTop + 7)
  doc.line(amtX + half, tableTop + 7, amtX + half, tableTop + headerH + bodyH)
  doc.setFontSize(6.5)
  doc.setTextColor(...MUTED)
  doc.text(vc.majorUnitLabel, amtX + half / 2, tableTop + 11.5, {
    align: 'center',
  })
  doc.text(vc.minorUnitLabel, amtX + half + half / 2, tableTop + 11.5, {
    align: 'center',
  })

  // Body rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Being the amount', contentX + 2, tableTop + headerH + 5)

  doc.setDrawColor(...LIGHT_GRAY)
  doc.setLineWidth(0.2)
  for (let i = 0; i < 5; i++) {
    const ly = tableTop + headerH + 10 + i * 6.5
    if (ly < tableTop + headerH + bodyH - 2) {
      doc.setLineDashPattern([0.7, 0.7], 0)
      doc.line(contentX + 2, ly, amtX - 3, ly)
      doc.setLineDashPattern([], 0)
    }
  }

  doc.setTextColor(...INK)
  doc.setFontSize(8.5)
  items.forEach((item, idx) => {
    const ly = tableTop + headerH + 10 + idx * 6.5
    if (ly >= tableTop + headerH + bodyH - 2) return
    doc.setFillColor(255, 255, 255)
    const tw = Math.min(doc.getTextWidth(item.description) + 2, descW - 4)
    doc.rect(contentX + 1.5, ly - 3.5, tw, 4.5, 'F')
    doc.text(item.description, contentX + 2, ly, { maxWidth: descW - 6 })
    doc.setFont('helvetica', 'bold')
    doc.text(item.major, amtX + half - 2, ly, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(item.minor, contentRight - 2, ly, { align: 'right' })
    doc.setTextColor(...INK)
  })

  // TOTAL + words
  const totalY = tableTop + headerH + bodyH
  doc.setFillColor(...TOTAL_GRAY)
  doc.rect(amtX, totalY, amountColW, totalH, 'F')
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.5)
  doc.rect(amtX, totalY, amountColW, totalH)
  doc.line(amtX + half, totalY, amtX + half, totalY + totalH)

  const whole = Math.floor(Math.abs(amount))
  const cents = Math.round((Math.abs(amount) - whole) * 100)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(vc.amountInWordsLabel, contentX + 2, totalY + 5)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text(amountInWords(amount), contentX + 2, totalY + 10, {
    maxWidth: descW - 4,
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('TOTAL', amtX - 18, totalY + 9)
  doc.text(whole.toLocaleString('en-US'), amtX + half - 2, totalY + 9, {
    align: 'right',
  })
  doc.text(String(cents).padStart(2, '0'), contentRight - 2, totalY + 9, {
    align: 'right',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED)
  const typeLabel =
    JOURNAL_TYPE_LABEL[entry.journalType as JournalType] ?? entry.journalType
  doc.text(
    `${typeLabel} · ${entry.status}${entry.reference ? ` · Ref ${entry.reference}` : ''}`,
    contentX,
    pageH - 6,
  )
  doc.text('System Generated Voucher', contentRight, pageH - 6, {
    align: 'right',
  })

  return doc
}

export async function buildJournalVoucherPdf(
  entry: JournalEntry,
  templateInput?: BalanceSheetTemplate | null,
): Promise<jsPDF> {
  const template = hydrateClientTemplate(
    templateInput,
    defaultJournalVoucherTemplate(),
  )
  const kind = resolveVoucherKind(entry)
  // Always use the landscape Debit/Credit template (Settings customizations).
  // Pure journals without cash movement still get a titled landscape voucher.
  const landscapeKind: 'debit' | 'credit' =
    kind === 'credit' ? 'credit' : kind === 'debit' ? 'debit' : 'debit'
  if (kind === 'journal') {
    // Neutral journals: still landscape, titled as Journal via debit layout
    // with kind overridden in PDF title when needed.
    return buildDebitCreditVoucherPdf(entry, landscapeKind, template, {
      forceTitle: 'JOURNAL VOUCHER',
    })
  }
  return buildDebitCreditVoucherPdf(entry, kind, template)
}

let cachedJournalTemplate: BalanceSheetTemplate | null = null

export async function loadJournalVoucherTemplate(
  fetcher: () => Promise<BalanceSheetTemplate>,
  options?: { force?: boolean },
): Promise<BalanceSheetTemplate> {
  if (cachedJournalTemplate && !options?.force) {
    return cachedJournalTemplate
  }
  try {
    cachedJournalTemplate = hydrateClientTemplate(
      await fetcher(),
      defaultJournalVoucherTemplate(),
    )
  } catch {
    cachedJournalTemplate = defaultJournalVoucherTemplate()
  }
  return cachedJournalTemplate
}

export function clearJournalVoucherTemplateCache(): void {
  cachedJournalTemplate = null
}

export async function downloadJournalVoucher(
  entry: JournalEntry,
  template?: BalanceSheetTemplate | null,
): Promise<void> {
  const kind = resolveVoucherKind(entry)
  const doc = await buildJournalVoucherPdf(entry, template)
  doc.save(`${entry.entryNumber}-${kind}-voucher.pdf`)
}

export async function previewJournalVoucher(
  entry: JournalEntry,
  template?: BalanceSheetTemplate | null,
): Promise<void> {
  const doc = await buildJournalVoucherPdf(entry, template)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
