import { jsPDF } from 'jspdf'
import autoTable, { type CellHookData } from 'jspdf-autotable'

export type ReportBranding = {
  companyName: string
  address: string
  logoDataUrl: string | null
}

export type ReportSection = {
  title: string
  rows: string[][]
  totals?: string[][]
}

export type ReportExport = {
  title: string
  filters: Array<{ label: string; value: string }>
  headers: string[]
  rows: string[][]
  /** When set, rows are printed grouped under these headings instead of `rows`. */
  sections?: ReportSection[]
  /** Column indexes printed right-aligned (amounts). */
  rightAlign?: number[]
  /** Row indexes that start a group (e.g. a journal); groups get a divider and alternate shading. */
  groupStarts?: number[]
  totals?: string[][]
  branding?: ReportBranding
}

const NAVY: [number, number, number] = [15, 39, 68]

export function downloadReportCsv(input: ReportExport): void {
  const bodyRows = input.sections
    ? input.sections.flatMap((section) => [
        [section.title],
        ...section.rows,
        ...(section.totals ?? []),
      ])
    : input.rows
  const lines = [
    input.branding?.companyName ?? '',
    input.title,
    ...input.filters.map((row) => `${row.label},${csvCell(row.value)}`),
    '',
    input.headers.map(csvCell).join(','),
    ...bodyRows.map((row) => row.map(csvCell).join(',')),
    ...(input.totals ?? []).map((row) => row.map(csvCell).join(',')),
    '',
    input.branding?.address ?? '',
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `${slug(input.title)}.csv`)
}

export function downloadReportPdf(input: ReportExport): void {
  buildReportPdf(input).save(`${slug(input.title)}.pdf`)
}

export function previewReportPdf(input: ReportExport): void {
  const url = buildReportPdf(input).output('bloburl')
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function buildReportPdf(input: ReportExport): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const company = input.branding?.companyName || 'GBL Enterprise'
  const address = input.branding?.address || ''
  let y = 14

  if (input.branding?.logoDataUrl) {
    try {
      const format = imageFormat(input.branding.logoDataUrl)
      doc.addImage(input.branding.logoDataUrl, format, 14, 10, 18, 18)
    } catch {
      /* skip broken logo */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text(company, input.branding?.logoDataUrl ? 36 : 14, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(input.title, input.branding?.logoDataUrl ? 36 : 14, y + 10)
  y = 34

  doc.setFontSize(9)
  doc.setTextColor(40, 40, 40)
  const filterLine = input.filters
    .map((row) => `${row.label}: ${row.value}`)
    .join('   ·   ')
  const wrapped = doc.splitTextToSize(filterLine, 260)
  doc.text(wrapped, 14, y)
  y += wrapped.length * 4 + 4

  const sectionStyle = {
    fontStyle: 'bold' as const,
    fillColor: [226, 232, 240] as [number, number, number],
    textColor: NAVY,
  }
  const totalStyle = {
    fontStyle: 'bold' as const,
    fillColor: [241, 245, 249] as [number, number, number],
  }
  const styled = (rows: string[][]) =>
    rows.map((row) => row.map((content) => ({ content, styles: totalStyle })))
  const body = input.sections
    ? [
        ...input.sections.flatMap((section) => [
          [
            {
              content: section.title,
              colSpan: input.headers.length,
              styles: sectionStyle,
            },
          ],
          ...section.rows,
          ...styled(section.totals ?? []),
        ]),
        ...styled(input.totals ?? []),
      ]
    : [...input.rows, ...(input.totals ?? [])]

  const starts = new Set(input.sections ? [] : (input.groupStarts ?? []))
  const groupOfRow: number[] = []
  let group = -1
  input.rows.forEach((_, index) => {
    if (starts.has(index)) group += 1
    groupOfRow[index] = group
  })

  autoTable(doc, {
    startY: y,
    head: [input.headers],
    body,
    columnStyles: Object.fromEntries(
      (input.rightAlign ?? []).map((index) => [index, { halign: 'right' as const }]),
    ),
    styles: { fontSize: 8 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    ...(starts.size
      ? {
          alternateRowStyles: {},
          didParseCell: (data: CellHookData) => {
            if (data.section !== 'body' || data.row.index >= input.rows.length) return
            const current = groupOfRow[data.row.index] ?? 0
            data.cell.styles.fillColor =
              current % 2 === 1 ? [241, 245, 249] : [255, 255, 255]
          },
          didDrawCell: (data: CellHookData) => {
            if (data.section !== 'body' || !starts.has(data.row.index)) return
            doc.setDrawColor(...NAVY)
            doc.setLineWidth(0.3)
            doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y)
          },
        }
      : {}),
    margin: { left: 14, right: 14, bottom: 18 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages()
      const height = doc.internal.pageSize.getHeight()
      const width = doc.internal.pageSize.getWidth()
      doc.setFontSize(8)
      doc.setTextColor(90, 101, 120)
      const footer = address || company
      doc.text(doc.splitTextToSize(footer, width - 50), 14, height - 8)
      doc.text(`Page ${page}`, width - 14, height - 8, { align: 'right' })
    },
  })

  return doc
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return 'JPEG'
  }
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'PNG'
}

function csvCell(value: string): string {
  const text = value ?? ''
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
