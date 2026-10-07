import { GState, jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money } from '../types/accounting'
import { PAYROLL_STATUS_LABEL, type PayrollLine, type PayrollRun } from '../types/payroll'
import { DEFAULT_COMPANY_NAME } from '../types/report-template'
import { loadCompanyBranding, type CompanyBranding } from './companyBranding'
import { amountInWords } from './journalVoucherPdf'
import { monthLabel } from './months'
import { fitImageSize, imageFormatFromDataUrl } from './pdfImage'

const ACCENT: [number, number, number] = [29, 78, 216]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [110, 110, 110]

export type SalarySheetInput = {
  run: PayrollRun
  preparedBy?: string
}

function periodTitle(run: PayrollRun): string {
  return `${monthLabel(run.periodMonth)} ${run.periodYear}`
}

export function salarySheetFileName(run: PayrollRun): string {
  return `${run.sheetNumber}-salary-sheet.pdf`
}

function otherDeductions(line: PayrollLine): number {
  return line.structureAdvance ?? 0
}

function cell(amount: number): string {
  return amount ? money(amount) : '—'
}

function sumBy(lines: PayrollLine[], pick: (line: PayrollLine) => number): number {
  return Math.round(lines.reduce((sum, line) => sum + pick(line), 0) * 100) / 100
}

export function buildSalarySheetPdf(
  input: SalarySheetInput,
  branding: CompanyBranding,
): jsPDF {
  const { run } = input
  const isDraft = run.status === 'draft'
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10
  let y = margin

  let textX = margin
  const logo = branding.logoDataUrl
  const logoFormat = logo ? imageFormatFromDataUrl(logo) : null
  if (logo && logoFormat) {
    try {
      const { w, h } = fitImageSize(doc, logo, 22, 16)
      doc.addImage(logo, logoFormat, margin, y, w, h, undefined, 'FAST')
      textX = margin + w + 4
    } catch {
      /* ignore bad logo */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.text(branding.companyName || DEFAULT_COMPANY_NAME, textX, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const address = doc.splitTextToSize(branding.address || '', 120) as string[]
  doc.text(address.slice(0, 2), textX, y + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(...INK)
  doc.text('SALARY SHEET', pageWidth - margin, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(`For the month of ${periodTitle(run)}`, pageWidth - margin, y + 11, {
    align: 'right',
  })

  y += 20
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  const meta: Array<[string, string]> = [
    ['Sheet No', run.sheetNumber],
    ['Status', isDraft ? 'Draft · awaiting approval' : PAYROLL_STATUS_LABEL[run.status]],
    ['Employees', String(run.lines.length)],
    ['Prepared on', new Date().toISOString().slice(0, 10)],
  ]
  const metaStep = (pageWidth - margin * 2) / meta.length
  doc.setFontSize(8.5)
  meta.forEach(([label, value], index) => {
    const x = margin + metaStep * index
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, x, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(value, x, y + 4.5)
  })
  y += 9

  const lines = run.lines
  const totals = {
    basic: sumBy(lines, (line) => line.basic),
    allowances: sumBy(lines, (line) => line.allowances),
    gross: sumBy(lines, (line) => line.gross),
    pf: sumBy(lines, (line) => line.providentFund ?? 0),
    tax: sumBy(lines, (line) => line.taxDeduction ?? 0),
    other: sumBy(lines, otherDeductions),
    advance: sumBy(lines, (line) => line.totalAdvanceDeductions ?? 0),
    installments: sumBy(lines, (line) => line.totalFacilityDeductions ?? 0),
    net: sumBy(lines, (line) => line.netPay),
  }

  autoTable(doc, {
    startY: y,
    head: [
      [
        'SL',
        'Employee',
        'Basic',
        'Allowances',
        'Gross',
        'PF',
        'Tax',
        'Other ded.',
        'Advance recovery',
        'Loan / salary adv.',
        'Net payable',
        'Employee signature',
      ],
    ],
    body: lines.map((line, index) => [
      String(index + 1),
      line.employeeName,
      cell(line.basic),
      cell(line.allowances),
      money(line.gross),
      cell(line.providentFund ?? 0),
      cell(line.taxDeduction ?? 0),
      cell(otherDeductions(line)),
      [
        cell(line.totalAdvanceDeductions ?? 0),
        ...line.advanceDeductions.map((row) => row.advanceNumber),
      ].join('\n'),
      [
        cell(line.totalFacilityDeductions ?? 0),
        ...line.facilityDeductions.map((row) => row.facilityNumber),
      ].join('\n'),
      money(line.netPay),
      '',
    ]),
    foot: [
      [
        '',
        'Total',
        money(totals.basic),
        money(totals.allowances),
        money(totals.gross),
        money(totals.pf),
        money(totals.tax),
        money(totals.other),
        money(totals.advance),
        money(totals.installments),
        money(totals.net),
        '',
      ],
    ],
    showFoot: 'lastPage',
    theme: 'grid',
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [232, 238, 252], textColor: INK, fontStyle: 'bold' },
    styles: {
      fontSize: 8,
      textColor: INK,
      cellPadding: 1.8,
      valign: 'middle',
      lineColor: [210, 214, 222],
      lineWidth: 0.2,
      minCellHeight: 13,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 36 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 26, halign: 'right' },
      9: { cellWidth: 24, halign: 'right' },
      10: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      11: { cellWidth: 36 },
    },
    margin: { left: margin, right: margin, bottom: 14 },
    didParseCell: (data) => {
      if (data.section === 'body') return
      const index = data.column.index
      data.cell.styles.halign =
        index === 0 ? 'center' : index >= 2 && index <= 10 ? 'right' : 'left'
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 11) return
      const { x, y: top, width, height } = data.cell
      const lineY = top + height - 3.5
      doc.setDrawColor(...MUTED)
      doc.setLineWidth(0.25)
      doc.line(x + 3, lineY, x + width - 3, lineY)
    },
  })

  // @ts-expect-error autotable extension
  y = (doc.lastAutoTable?.finalY ?? y) + 7
  const signatureBlockH = 42
  if (y > pageHeight - 14 - signatureBlockH) {
    doc.addPage()
    y = margin + 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...INK)
  doc.text('Net payable in words:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const words = doc.splitTextToSize(amountInWords(totals.net), pageWidth - margin * 2 - 36) as string[]
  doc.text(words, margin + 35, y)
  y += words.length * 4 + 2
  if (isDraft) {
    doc.setFontSize(8)
    doc.text(
      'Draft for approval: amounts are final only after the Managing Director signs and the payroll is posted.',
      margin,
      y,
    )
  }

  y += 24
  const signatures: Array<[string, string]> = [
    [
      'Employee signature',
      lines.length === 1 ? lines[0]!.employeeName : 'Salary received in full',
    ],
    ['Prepared by', input.preparedBy ?? 'Payroll / Accounts'],
    ['Checked by', 'Accounts / Finance'],
    ['Authorized signature', 'Approved by Managing Director'],
  ]
  const sigWidth = 56
  const step = (pageWidth - margin * 2 - sigWidth) / (signatures.length - 1)
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  signatures.forEach(([label, role], index) => {
    const x = margin + step * index
    doc.line(x, y, x + sigWidth, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    doc.text(label, x + sigWidth / 2, y + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(role, x + sigWidth / 2, y + 8.5, { align: 'center' })
    doc.text('Date: ____________', x + sigWidth / 2, y + 12.5, { align: 'center' })
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    if (isDraft) {
      doc.saveGraphicsState()
      doc.setGState(new GState({ opacity: 0.07 }))
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(64)
      doc.setTextColor(...INK)
      doc.text('DRAFT · FOR APPROVAL', pageWidth / 2, pageHeight / 2 + 20, {
        align: 'center',
        angle: 18,
      })
      doc.restoreGraphicsState()
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(
      `${run.sheetNumber} · Salary sheet ${periodTitle(run)} · System generated`,
      margin,
      pageHeight - 6,
    )
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 6, {
      align: 'right',
    })
  }

  return doc
}

export async function salarySheetPreviewUrl(input: SalarySheetInput): Promise<string> {
  const doc = buildSalarySheetPdf(input, await loadCompanyBranding())
  return URL.createObjectURL(doc.output('blob'))
}

export async function downloadSalarySheetPdf(input: SalarySheetInput): Promise<void> {
  const doc = buildSalarySheetPdf(input, await loadCompanyBranding())
  doc.save(salarySheetFileName(input.run))
}
