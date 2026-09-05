import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, type JournalEntry } from '../types/accounting'
import {
  defaultJournalVoucherTemplate,
  hydrateClientTemplate,
  isBlockVisible,
  resolveAssetUrl,
  type BalanceSheetTemplate,
} from '../types/report-template'

const MARGIN = 14
const NAVY: [number, number, number] = [15, 39, 68]
const MUTED: [number, number, number] = [90, 101, 120]

function imageFormatFromDataUrl(
  dataUrl: string,
): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
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

export async function buildJournalVoucherPdf(
  entry: JournalEntry,
  templateInput?: BalanceSheetTemplate | null,
): Promise<jsPDF> {
  const template = hydrateClientTemplate(
    templateInput,
    defaultJournalVoucherTemplate(),
  )
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const header = template.headerConfig
  const blocks = [...template.layoutStructure]
    .filter(isBlockVisible)
    .sort((a, b) => a.position - b.position)

  let cursorY = MARGIN

  for (const block of blocks) {
    if (block.type === 'LOGO') {
      const logoUrl = resolveAssetUrl(template.companyLogoUrl)
      if (logoUrl) {
        const dataUrl = await loadImageDataUrl(logoUrl)
        const format = dataUrl ? imageFormatFromDataUrl(dataUrl) : null
        if (dataUrl && format) {
          const align = block.styles?.logoAlign ?? 'center'
          const logoW = 28
          const logoH = 14
          let x = MARGIN
          if (align === 'center') x = (pageWidth - logoW) / 2
          if (align === 'right') x = pageWidth - MARGIN - logoW
          try {
            doc.addImage(dataUrl, format, x, cursorY, logoW, logoH)
            cursorY += logoH + 4
          } catch {
            // skip bad logo
          }
        }
      }
    }

    if (block.type === 'COMPANY_HEADER') {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(...NAVY)
      doc.text(header.companyName || 'GBL Enterprise', pageWidth / 2, cursorY + 4, {
        align: 'center',
      })
      cursorY += 8
      doc.setDrawColor(207, 214, 224)
      doc.setLineWidth(0.4)
      doc.line(MARGIN, cursorY, pageWidth - MARGIN, cursorY)
      cursorY += 7
      doc.setFontSize(12)
      doc.text(header.reportTitle || 'Journal Voucher', pageWidth / 2, cursorY, {
        align: 'center',
      })
      cursorY += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...MUTED)
      if (header.address) {
        doc.text(header.address, pageWidth / 2, cursorY, { align: 'center' })
        cursorY += 5
      }
      if (header.taxId) {
        doc.text(`Tax ID / BIN: ${header.taxId}`, pageWidth / 2, cursorY, {
          align: 'center',
        })
        cursorY += 5
      }
      cursorY += 2
    }

    if (block.type === 'VOUCHER_META') {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...NAVY)
      doc.text(`Voucher No: ${entry.entryNumber}`, MARGIN, cursorY)
      cursorY += 6
      if (header.showDate !== false) {
        doc.text(`Date: ${entry.date.slice(0, 10)}`, MARGIN, cursorY)
        cursorY += 6
      }
      if (header.showStatusBadge !== false) {
        doc.text(`Status: ${entry.status}`, MARGIN, cursorY)
        cursorY += 6
      }
      doc.text(`Memo: ${entry.memo}`, MARGIN, cursorY, {
        maxWidth: contentWidth,
      })
      cursorY += 12
    }

    if (block.type === 'LINES_TABLE') {
      const showCodes = block.styles?.showAccountCodes !== false
      autoTable(doc, {
        startY: cursorY,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Account', 'Description', 'Debit', 'Credit']],
        body: entry.lines.map((line) => [
          showCodes
            ? `${line.accountCode} · ${line.accountName}`
            : line.accountName,
          line.description ?? '—',
          line.debit > 0 ? money(line.debit) : '',
          line.credit > 0 ? money(line.credit) : '',
        ]),
        foot: [
          ['Totals', '', money(entry.totalDebit), money(entry.totalCredit)],
        ],
        styles: { fontSize: 9, cellPadding: 2.2, textColor: NAVY },
        headStyles: { fillColor: NAVY, textColor: 255 },
        footStyles: {
          fillColor: [238, 241, 245],
          textColor: [21, 32, 51],
          fontStyle: 'bold',
        },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
      })
      cursorY =
        (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? cursorY + 40
      cursorY += 8
    }

    if (block.type === 'FOOTER_SIGNATURES') {
      const footer = template.footerConfig
      const labels = [
        footer.preparedByLabel,
        footer.checkedByLabel,
        footer.authorizedLabel,
      ]
      if (footer.showManagingDirector) labels.push(footer.managingDirectorLabel)
      if (footer.showAuditor) labels.push(footer.auditorLabel)

      let y = cursorY + 8
      if (y > pageHeight - MARGIN - 24) {
        doc.addPage()
        y = MARGIN + 10
      }
      const colW = contentWidth / Math.min(labels.length, 3)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      labels.forEach((label, index) => {
        const col = index % 3
        const row = Math.floor(index / 3)
        const x = MARGIN + col * colW
        const yy = y + row * 18
        doc.setDrawColor(...NAVY)
        doc.setLineWidth(0.3)
        doc.line(x, yy, x + colW - 8, yy)
        doc.text(label, x, yy + 5)
      })
    }
  }

  return doc
}

let cachedJournalTemplate: BalanceSheetTemplate | null = null

export async function loadJournalVoucherTemplate(
  fetcher: () => Promise<BalanceSheetTemplate>,
): Promise<BalanceSheetTemplate> {
  if (cachedJournalTemplate) return cachedJournalTemplate
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
  const doc = await buildJournalVoucherPdf(entry, template)
  doc.save(`${entry.entryNumber}-voucher.pdf`)
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
