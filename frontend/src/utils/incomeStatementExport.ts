import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  money,
  type IncomeStatementReport,
  type IncomeStatementSection,
} from '../types/accounting'
import {
  DEFAULT_COMPANY_LOGO_URL,
  resolveAssetUrl,
  type BalanceSheetTemplate,
} from '../types/report-template'
import { fitImageSize, imageFormatFromDataUrl, loadPdfImage } from './pdfImage'

export const INCOME_STATEMENT_TITLE = 'Statement of Profit or Loss'

export type StatementRow = {
  kind: 'section' | 'header' | 'line' | 'subtotal' | 'total'
  depth: number
  code: string
  name: string
  amount: number | null
}

function sectionRows(
  rows: StatementRow[],
  label: string,
  section: IncomeStatementSection,
  totalLabel: string,
): void {
  rows.push({ kind: 'section', depth: 0, code: '', name: label, amount: null })
  for (const line of section.lines) {
    if (!line.isHeader && Math.abs(line.amount) < 0.005) continue
    rows.push({
      kind: line.isHeader ? 'header' : 'line',
      depth: line.depth,
      code: line.code,
      name: line.name,
      amount: line.amount,
    })
  }
  rows.push({ kind: 'subtotal', depth: 0, code: '', name: totalLabel, amount: section.total })
}

const hasActivity = (section: IncomeStatementSection) =>
  Math.abs(section.total) >= 0.005 ||
  section.lines.some((line) => Math.abs(line.amount) >= 0.005)

/** Statement body in reading order; shared by the screen, PDF and CSV. */
export function incomeStatementRows(report: IncomeStatementReport): StatementRow[] {
  const rows: StatementRow[] = []
  const total = (name: string, amount: number) =>
    rows.push({ kind: 'total', depth: 0, code: '', name, amount })

  sectionRows(rows, 'Revenue', report.revenue, 'Total Revenue')
  sectionRows(rows, 'Less: Direct Project Cost (COGS)', report.directCosts, 'Total Direct Cost')
  total('GROSS PROFIT', report.grossProfit)
  sectionRows(
    rows,
    'Less: Operating & Office Overhead Expenses',
    report.operatingExpenses,
    'Total Operating Expenses',
  )
  total('OPERATING PROFIT', report.operatingProfit)
  if (hasActivity(report.otherIncome)) {
    sectionRows(rows, 'Add: Other Income', report.otherIncome, 'Total Other Income')
  }
  if (hasActivity(report.otherExpenses)) {
    sectionRows(rows, 'Less: Other Expenses', report.otherExpenses, 'Total Other Expenses')
  }
  total(report.netProfit < 0 ? 'NET LOSS' : 'NET PROFIT', report.netProfit)
  return rows
}

export function incomeStatementPeriod(report: IncomeStatementReport): string {
  const to = report.toDate.slice(0, 10)
  return report.fromDate
    ? `For the period ${report.fromDate.slice(0, 10)} to ${to}`
    : `For the period up to ${to}`
}

const MARGIN = 14
const NAVY: [number, number, number] = [15, 39, 68]
const SLATE: [number, number, number] = [241, 245, 249]
const MUTED: [number, number, number] = [90, 101, 120]

export async function downloadIncomeStatementPdf(
  report: IncomeStatementReport,
  template: BalanceSheetTemplate,
  scopeLabel: string,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN * 2
  const header = template.headerConfig
  let cursorY = MARGIN

  const logoUrl = resolveAssetUrl(template.companyLogoUrl) ?? DEFAULT_COMPANY_LOGO_URL
  const dataUrl = await loadPdfImage(logoUrl)
  const format = dataUrl ? imageFormatFromDataUrl(dataUrl) : null
  if (dataUrl && format) {
    const { w, h } = fitImageSize(doc, dataUrl, 28, 14)
    try {
      doc.addImage(dataUrl, format, (pageWidth - w) / 2, cursorY, w, h, undefined, 'FAST')
      cursorY += h + 4
    } catch {
      // Unsupported logo: keep the statement.
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text(header.companyName || 'GBL Enterprise', pageWidth / 2, cursorY + 4, {
    align: 'center',
  })
  cursorY += 10
  doc.setFontSize(12)
  doc.text(INCOME_STATEMENT_TITLE, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  for (const text of [
    header.address,
    header.taxId ? `Tax ID / BIN: ${header.taxId}` : '',
    incomeStatementPeriod(report),
    scopeLabel,
  ]) {
    if (!text) continue
    doc.text(text, pageWidth / 2, cursorY, { align: 'center' })
    cursorY += 5
  }

  const body = incomeStatementRows(report)
  autoTable(doc, {
    startY: cursorY + 2,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 12 },
    head: [['Code', 'Account', 'Amount']],
    body: body.map((row) => [
      row.code,
      row.name,
      row.amount === null ? '' : money(row.amount),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      textColor: NAVY,
      lineColor: [207, 214, 224],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: contentWidth - 20 - 38 },
      2: { cellWidth: 38, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const row = body[data.row.index]
      if (!row) return
      if (row.kind === 'section') {
        data.cell.styles.fillColor = NAVY
        data.cell.styles.textColor = 255
        data.cell.styles.fontStyle = 'bold'
        return
      }
      if (row.kind === 'header') {
        data.cell.styles.fillColor = SLATE
        data.cell.styles.fontStyle = 'bold'
      }
      if ((row.kind === 'header' || row.kind === 'line') && data.column.index === 1) {
        data.cell.styles.cellPadding = {
          top: 2,
          bottom: 2,
          left: 2 + Math.max(row.depth, 1) * 2.5,
          right: 2,
        }
      }
      if (row.kind === 'subtotal' || row.kind === 'total') {
        data.cell.styles.fontStyle = 'bold'
      }
      if (row.kind === 'total') {
        data.cell.styles.fillColor = [238, 241, 245]
        data.cell.styles.fontSize = 10
      }
    },
  })

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    cursorY + 10
  const footer = template.footerConfig
  const labels = [footer.preparedByLabel, footer.checkedByLabel, footer.authorizedLabel]
  if (footer.showManagingDirector) labels.push(footer.managingDirectorLabel)
  if (footer.showAuditor) labels.push(footer.auditorLabel)
  let y = finalY + 18
  if (y > pageHeight - MARGIN - 24) {
    doc.addPage()
    y = MARGIN + 10
  }
  const colW = contentWidth / Math.min(labels.length, 3)
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  labels.forEach((label, index) => {
    const x = MARGIN + (index % 3) * colW
    const yy = y + Math.floor(index / 3) * 18
    doc.setDrawColor(...NAVY)
    doc.setLineWidth(0.3)
    doc.line(x, yy, x + colW - 8, yy)
    doc.text(label, x, yy + 5)
  })

  doc.text(`Generated on: ${new Date().toLocaleString()}`, MARGIN, pageHeight - MARGIN + 1)
  doc.save(`income-statement-${report.toDate.slice(0, 10)}.pdf`)
}

export function downloadIncomeStatementCsv(
  report: IncomeStatementReport,
  companyName: string,
  scopeLabel: string,
): void {
  const rows: string[][] = [
    ['Company', companyName],
    ['Report', INCOME_STATEMENT_TITLE],
    ['Period', incomeStatementPeriod(report)],
    ['Scope', scopeLabel],
    [],
    ['Code', 'Account', 'Amount'],
    ...incomeStatementRows(report).map((row) => [
      row.code,
      `${'  '.repeat(row.kind === 'line' || row.kind === 'header' ? row.depth : 0)}${row.name}`,
      row.amount === null ? '' : row.amount.toFixed(2),
    ]),
  ]
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `income-statement-${report.toDate.slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
