import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  money,
  type BalanceSheetLine,
  type BalanceSheetReport,
  type BalanceSheetSection,
} from '../types/accounting'
import {
  defaultBalanceSheetTemplate,
  hydrateClientTemplate,
  isBlockVisible,
  resolveAssetUrl,
  type BalanceSheetTemplate,
  type TemplateBlock,
} from '../types/report-template'

type PdfRowKind = 'section' | 'header' | 'line' | 'subtotal' | 'total' | 'spacer'

type PdfRow = {
  kind: PdfRowKind
  depth: number
  code: string
  name: string
  amount: string
}

const MARGIN = 14
const NAVY: [number, number, number] = [15, 39, 68]
const SLATE: [number, number, number] = [241, 245, 249]
const MUTED: [number, number, number] = [90, 101, 120]

function showCodes(block: TemplateBlock | undefined): boolean {
  return block?.styles?.showAccountCodes !== false
}

function lineToRow(line: BalanceSheetLine, withCodes: boolean): PdfRow {
  const isHeader = line.isHeader || !line.isPostable
  return {
    kind: isHeader ? 'header' : 'line',
    depth: Math.max(0, line.depth),
    code: withCodes ? line.code : '',
    name: line.name,
    amount: money(line.balance),
  }
}

function pushSectionLines(
  rows: PdfRow[],
  section: BalanceSheetSection,
  withCodes: boolean,
): void {
  for (const line of section.lines) {
    const isHeader = line.isHeader || !line.isPostable
    if (!isHeader && Math.abs(line.balance) < 0.005) continue
    rows.push(lineToRow(line, withCodes))
  }
}

function drawDoubleUnderline(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
): void {
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.35)
  doc.line(x, y, x + width, y)
  doc.setLineWidth(0.9)
  doc.line(x, y + 1.2, x + width, y + 1.2)
}

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

function buildBodyFromTemplate(
  report: BalanceSheetReport,
  template: BalanceSheetTemplate,
): PdfRow[] {
  const rows: PdfRow[] = []
  const blocks = [...template.layoutStructure]
    .filter(isBlockVisible)
    .sort((a, b) => a.position - b.position)

  for (const block of blocks) {
    const codes = showCodes(block)
    if (block.type === 'ASSETS_SECTION') {
      rows.push({
        kind: 'section',
        depth: 0,
        code: '',
        name: 'ASSETS',
        amount: '',
      })
      pushSectionLines(rows, report.assets.current, codes)
      pushSectionLines(rows, report.assets.fixed, codes)
      rows.push({
        kind: 'total',
        depth: 0,
        code: '',
        name: 'TOTAL ASSETS',
        amount: money(report.assets.total),
      })
      rows.push({ kind: 'spacer', depth: 0, code: '', name: '', amount: '' })
    }
    if (block.type === 'LIABILITIES_SECTION') {
      rows.push({
        kind: 'section',
        depth: 0,
        code: '',
        name: 'LIABILITIES',
        amount: '',
      })
      pushSectionLines(rows, report.liabilities.current, codes)
      pushSectionLines(rows, report.liabilities.longTerm, codes)
      rows.push({
        kind: 'subtotal',
        depth: 0,
        code: '',
        name: 'TOTAL LIABILITIES',
        amount: money(report.liabilities.total),
      })
      rows.push({ kind: 'spacer', depth: 0, code: '', name: '', amount: '' })
    }
    if (block.type === 'EQUITY_SECTION') {
      rows.push({
        kind: 'section',
        depth: 0,
        code: '',
        name: 'EQUITY',
        amount: '',
      })
      pushSectionLines(rows, report.equity.section, codes)
      rows.push({
        kind: 'subtotal',
        depth: 0,
        code: '',
        name: 'TOTAL EQUITY',
        amount: money(report.equity.total),
      })
      rows.push({
        kind: 'total',
        depth: 0,
        code: '',
        name: 'TOTAL LIABILITIES & EQUITY',
        amount: money(report.totalLiabilitiesAndEquity),
      })
    }
  }

  // Never return an empty statement body — fall back to full default sections
  if (rows.length === 0) {
    return buildBodyFromTemplate(report, defaultBalanceSheetTemplate())
  }

  return rows
}

export async function downloadBalanceSheetPdf(
  report: BalanceSheetReport,
  templateInput?: BalanceSheetTemplate | null,
): Promise<void> {
  const template = hydrateClientTemplate(
    templateInput,
    defaultBalanceSheetTemplate(),
  )
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const asOf = report.asOf.slice(0, 10)
  const generatedAt = new Date().toLocaleString()
  const header = template.headerConfig
  const blocks = [...template.layoutStructure]
    .filter(isBlockVisible)
    .sort((a, b) => a.position - b.position)

  let cursorY = MARGIN

  const logoBlock = blocks.find((b) => b.type === 'LOGO')
  if (logoBlock) {
    const logoUrl = resolveAssetUrl(template.companyLogoUrl)
    if (logoUrl) {
      const dataUrl = await loadImageDataUrl(logoUrl)
      const format = dataUrl ? imageFormatFromDataUrl(dataUrl) : null
      if (dataUrl && format) {
        const align = logoBlock.styles?.logoAlign ?? 'center'
        const logoW = 28
        const logoH = 14
        let x = MARGIN
        if (align === 'center') x = (pageWidth - logoW) / 2
        if (align === 'right') x = pageWidth - MARGIN - logoW
        try {
          doc.addImage(dataUrl, format, x, cursorY, logoW, logoH)
          cursorY += logoH + 4
        } catch {
          // Skip corrupt/unsupported logos — do not blank the PDF
        }
      }
    }
  }

  if (blocks.some((b) => b.type === 'COMPANY_HEADER')) {
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
    cursorY += 8

    doc.setFontSize(12)
    doc.text(
      header.reportTitle || 'Statement of Financial Position',
      pageWidth / 2,
      cursorY,
      { align: 'center' },
    )
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
    if (header.showDate !== false) {
      doc.text(`As of ${asOf}`, pageWidth / 2, cursorY, { align: 'center' })
      cursorY += 5
    }
    if (header.showStatusBadge !== false) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...NAVY)
      doc.text(
        report.isBalanced
          ? 'Status: Balanced'
          : `Status: Imbalance (${money(report.difference)})`,
        pageWidth / 2,
        cursorY,
        { align: 'center' },
      )
      cursorY += 6
    }
  }

  // Ensure we never start the table off-page
  if (cursorY < MARGIN) cursorY = MARGIN
  if (cursorY > pageHeight - 40) cursorY = MARGIN

  const body = buildBodyFromTemplate(report, template)
  autoTable(doc, {
    startY: Math.max(cursorY + 2, MARGIN + 2),
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 18 },
    head: [['Code', 'Account', 'Amount']],
    body: body.map((row) => [row.code, row.name, row.amount]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
      textColor: NAVY,
      lineColor: [207, 214, 224],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: contentWidth - 22 - 36 },
      2: { cellWidth: 36, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const row = body[data.row.index]
      if (!row) return
      if (row.kind === 'spacer') {
        data.cell.styles.minCellHeight = 4
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.lineWidth = 0
        return
      }
      if (row.kind === 'section') {
        data.cell.styles.fillColor = NAVY
        data.cell.styles.textColor = 255
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 10
        return
      }
      if (row.kind === 'header') {
        data.cell.styles.fillColor = SLATE
        data.cell.styles.fontStyle = 'bold'
        if (data.column.index === 1) {
          data.cell.styles.cellPadding = {
            top: 2.4,
            bottom: 2.4,
            left: 2 + row.depth * 2.5,
            right: 2,
          }
        }
        return
      }
      if (row.kind === 'line' && data.column.index === 1) {
        data.cell.styles.cellPadding = {
          top: 2.1,
          bottom: 2.1,
          left: 2 + Math.max(row.depth, 1) * 2.5,
          right: 2,
        }
      }
      if (row.kind === 'subtotal' || row.kind === 'total') {
        data.cell.styles.fontStyle = 'bold'
        if (row.kind === 'total') {
          data.cell.styles.fillColor = [238, 241, 245]
          data.cell.styles.fontSize = 10
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      const row = body[data.row.index]
      if (!row) return
      if (
        (row.kind === 'subtotal' || row.kind === 'total') &&
        data.column.index === 0
      ) {
        doc.setDrawColor(...NAVY)
        doc.setLineWidth(0.4)
        doc.line(
          data.cell.x,
          data.cell.y,
          data.cell.x + contentWidth,
          data.cell.y,
        )
      }
      if (row.kind === 'total' && data.column.index === 2) {
        drawDoubleUnderline(
          doc,
          data.cell.x + 1,
          data.cell.y + data.cell.height - 1.2,
          data.cell.width - 2,
        )
      }
    },
  })

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? cursorY + 10

  if (blocks.some((b) => b.type === 'FOOTER_SIGNATURES')) {
    const footer = template.footerConfig
    const labels = [
      footer.preparedByLabel,
      footer.checkedByLabel,
      footer.authorizedLabel,
    ]
    if (footer.showManagingDirector) labels.push(footer.managingDirectorLabel)
    if (footer.showAuditor) labels.push(footer.auditorLabel)

    let y = finalY + 16
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

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.setDrawColor(207, 214, 224)
  doc.setLineWidth(0.3)
  doc.line(
    MARGIN,
    pageHeight - MARGIN - 4,
    pageWidth - MARGIN,
    pageHeight - MARGIN - 4,
  )
  doc.text(`Generated on: ${generatedAt}`, MARGIN, pageHeight - MARGIN + 1)
  const pageCount = doc.getNumberOfPages()
  doc.text(
    `Page ${pageCount} of ${pageCount}`,
    pageWidth - MARGIN,
    pageHeight - MARGIN + 1,
    { align: 'right' },
  )

  doc.save(`balance-sheet-${asOf}.pdf`)
}

export function downloadBalanceSheetCsv(
  report: BalanceSheetReport,
  templateInput?: BalanceSheetTemplate | null,
): void {
  const template = hydrateClientTemplate(
    templateInput,
    defaultBalanceSheetTemplate(),
  )
  const asOf = report.asOf.slice(0, 10)
  const rows: string[][] = [
    ['Company', template.headerConfig.companyName],
    ['Report', template.headerConfig.reportTitle],
    ['As of', asOf],
    [],
    ['Section', 'Code', 'Account', 'Amount'],
  ]

  const pushSection = (
    sectionLabel: string,
    section: BalanceSheetSection,
    withCodes: boolean,
  ) => {
    for (const line of section.lines) {
      if (Math.abs(line.balance) < 0.005 && !line.isHeader) continue
      rows.push([
        sectionLabel,
        withCodes ? line.code : '',
        line.name,
        line.balance.toFixed(2),
      ])
    }
    rows.push([
      sectionLabel,
      '',
      `Total ${section.title}`,
      section.total.toFixed(2),
    ])
  }

  for (const block of [...template.layoutStructure]
    .filter(isBlockVisible)
    .sort((a, b) => a.position - b.position)) {
    const codes = showCodes(block)
    if (block.type === 'ASSETS_SECTION') {
      pushSection('Current Assets', report.assets.current, codes)
      pushSection('Fixed Assets', report.assets.fixed, codes)
      rows.push(['Assets', '', 'TOTAL ASSETS', report.assets.total.toFixed(2)])
    }
    if (block.type === 'LIABILITIES_SECTION') {
      pushSection('Current Liabilities', report.liabilities.current, codes)
      pushSection('Long-Term Liabilities', report.liabilities.longTerm, codes)
      rows.push([
        'Liabilities',
        '',
        'TOTAL LIABILITIES',
        report.liabilities.total.toFixed(2),
      ])
    }
    if (block.type === 'EQUITY_SECTION') {
      pushSection('Equity', report.equity.section, codes)
      rows.push(['Equity', '', 'TOTAL EQUITY', report.equity.total.toFixed(2)])
      rows.push([
        'Total',
        '',
        'TOTAL LIABILITIES & EQUITY',
        report.totalLiabilitiesAndEquity.toFixed(2),
      ])
    }
  }

  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `balance-sheet-${asOf}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
