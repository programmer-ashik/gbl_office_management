import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export type ReportBranding = {
  companyName: string
  address: string
  logoDataUrl: string | null
}

export type ReportExport = {
  title: string
  filters: Array<{ label: string; value: string }>
  headers: string[]
  rows: string[][]
  totals?: string[][]
  branding?: ReportBranding
}

const NAVY: [number, number, number] = [15, 39, 68]

export function downloadReportCsv(input: ReportExport): void {
  const lines = [
    input.branding?.companyName ?? '',
    input.title,
    ...input.filters.map((row) => `${row.label},${csvCell(row.value)}`),
    '',
    input.headers.map(csvCell).join(','),
    ...input.rows.map((row) => row.map(csvCell).join(',')),
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

  autoTable(doc, {
    startY: y,
    head: [input.headers],
    body: [...input.rows, ...(input.totals ?? [])],
    styles: { fontSize: 8 },
    headStyles: { fillColor: NAVY, textColor: 255 },
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
