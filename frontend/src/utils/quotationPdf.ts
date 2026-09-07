import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Quotation } from '../types/quotation'
import { money } from '../types/accounting'

const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [110, 110, 110]
const ACCENT: [number, number, number] = [15, 76, 129]

export function downloadQuotationPdf(quotation: Quotation): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ACCENT)
  doc.text('GBL Enterprise', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text('Quotation', margin, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(quotation.quotationNumber, pageWidth - margin, margin, {
    align: 'right',
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(
    `Date: ${quotation.createdAt.slice(0, 10)}`,
    pageWidth - margin,
    margin + 6,
    { align: 'right' },
  )
  doc.text(`Status: ${quotation.status}`, pageWidth - margin, margin + 11, {
    align: 'right',
  })

  y += 12
  doc.setDrawColor(220)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('Client', margin, y)
  doc.text('Project', pageWidth / 2, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(quotation.clientInfo.name, margin, y)
  doc.text(
    quotation.projectCode
      ? quotation.projectName || quotation.projectCode || '—'
      : '—',
    pageWidth / 2,
    y,
  )
  y += 4
  if (quotation.clientInfo.company) {
    doc.text(quotation.clientInfo.company, margin, y)
    y += 4
  }
  if (quotation.clientInfo.phone) {
    doc.text(`Phone: ${quotation.clientInfo.phone}`, margin, y)
    y += 4
  }
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Product', 'Qty', 'Unit Price', 'Disc %', 'Line Total']],
    body: quotation.items.map((item) => [
      item.productName,
      String(item.quantity),
      money(item.unitPrice),
      String(item.discount),
      money(item.lineTotal),
    ]),
    theme: 'striped',
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] },
    styles: { fontSize: 9, textColor: INK, cellPadding: 2.5 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  // @ts-expect-error autotable extension
  y = (doc.lastAutoTable?.finalY ?? y) + 10

  const summaryLeft = pageWidth - margin - 70
  const amountX = pageWidth - margin
  const rows: Array<[string, string]> = [
    ['Subtotal', money(quotation.subTotal)],
    [`Tax (${quotation.taxRate}%)`, money(quotation.taxAmount)],
    ['Grand Total', money(quotation.grandTotal)],
  ]
  doc.setFontSize(10)
  for (const [label, amount] of rows) {
    const isGrand = label === 'Grand Total'
    doc.setFont('helvetica', isGrand ? 'bold' : 'normal')
    doc.setTextColor(...INK)
    doc.text(label, summaryLeft, y)
    doc.text(amount, amountX, y, { align: 'right' })
    y += 6
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Terms & Conditions', margin, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const terms = doc.splitTextToSize(
    quotation.terms || 'Prices valid for 30 days.',
    pageWidth - margin * 2,
  )
  doc.text(terms, margin, y)
  y += terms.length * 3.5 + 8

  doc.setTextColor(...INK)
  doc.setFontSize(9)
  doc.text(`Prepared by: ${quotation.createdByName}`, margin, y)

  doc.save(`${quotation.quotationNumber || 'quotation'}.pdf`)
}
