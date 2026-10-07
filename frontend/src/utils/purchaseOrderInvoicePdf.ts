import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money } from '../types/accounting'
import {
  PO_STATUS_LABEL,
  PURCHASE_DESTINATION_LABEL,
  qty,
  type PurchaseOrder,
  type Supplier,
} from '../types/procurement'
import { DEFAULT_COMPANY_NAME } from '../types/report-template'
import { loadCompanyBranding, type CompanyBranding } from './companyBranding'
import { amountInWords } from './journalVoucherPdf'
import { fitImageSize, imageFormatFromDataUrl } from './pdfImage'

const YELLOW: [number, number, number] = [235, 184, 45]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [110, 110, 110]
const SOFT: [number, number, number] = [250, 246, 233]
const FOOTER_H = 16

export type PurchaseOrderInvoiceInput = {
  order: PurchaseOrder
  supplier?: Supplier | null
  invoiceDate?: string
}

export function purchaseOrderInvoiceNumber(order: PurchaseOrder): string {
  return order.poNumber.replace(/^PO-/i, 'PINV-')
}

function netQty(line: PurchaseOrder['lines'][number]): number {
  return Math.max(0, line.receivedQty - line.returnedQty)
}

function lineAmount(line: PurchaseOrder['lines'][number]): number {
  return Math.round(netQty(line) * line.unitCost * 100) / 100
}

function drawFooter(doc: jsPDF, branding: CompanyBranding) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - FOOTER_H
  doc.setFillColor(...YELLOW)
  doc.rect(0, y, pageWidth, FOOTER_H, 'F')
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(
    `${branding.companyName || DEFAULT_COMPANY_NAME} · Thank you for your partnership`,
    pageWidth / 2,
    y + 6.5,
    { align: 'center' },
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const address = doc.splitTextToSize(branding.address || '', pageWidth - 30)
  doc.text(address.slice(0, 1), pageWidth / 2, y + 11, { align: 'center' })
}

function drawPartyBox(
  doc: jsPDF,
  title: string,
  rows: string[],
  x: number,
  y: number,
  width: number,
): number {
  doc.setFontSize(9)
  const bodyLines = rows.flatMap((row, rowIndex) =>
    (doc.splitTextToSize(row, width - 6) as string[]).map((text) => ({
      text,
      bold: rowIndex === 0,
    })),
  )
  const height = 8 + bodyLines.length * 4.2 + 4
  doc.setFillColor(...SOFT)
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'F')
  doc.setFillColor(...YELLOW)
  doc.rect(x, y, 1.4, height, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(title.toUpperCase(), x + 4, y + 5.5)
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  let lineY = y + 10.5
  for (const line of bodyLines) {
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal')
    doc.text(line.text, x + 4, lineY)
    lineY += 4.2
  }
  return height
}

export function buildPurchaseOrderInvoicePdf(
  input: PurchaseOrderInvoiceInput,
  branding: CompanyBranding,
): jsPDF {
  const { order, supplier } = input
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentBottom = pageHeight - FOOTER_H - 8
  let y = margin

  let textX = margin
  const logo = branding.logoDataUrl
  const logoFormat = logo ? imageFormatFromDataUrl(logo) : null
  if (logo && logoFormat) {
    try {
      const { w, h } = fitImageSize(doc, logo, 24, 18)
      doc.addImage(logo, logoFormat, margin, y, w, h, undefined, 'FAST')
      textX = margin + w + 4
    } catch {
      /* ignore bad logo */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...INK)
  doc.text(branding.companyName || DEFAULT_COMPANY_NAME, textX, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  const companyLines = [
    ...(doc.splitTextToSize(branding.address || '', 88) as string[]),
    ...(branding.taxId ? [`Tax ID / BIN: ${branding.taxId}`] : []),
  ]
  doc.text(companyLines, textX, y + 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('INVOICE', pageWidth - margin, y + 6, { align: 'right' })
  const titleW = doc.getTextWidth('INVOICE')
  doc.setDrawColor(...YELLOW)
  doc.setLineWidth(1.2)
  doc.line(pageWidth - margin - titleW, y + 8.5, pageWidth - margin, y + 8.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Purchase order invoice', pageWidth - margin, y + 13, {
    align: 'right',
  })

  y += Math.max(26, 11 + companyLines.length * 3.6 + 4)
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  const invoiceDate = (input.invoiceDate ?? new Date().toISOString()).slice(0, 10)
  const meta: Array<[string, string]> = [
    ['Invoice No', purchaseOrderInvoiceNumber(order)],
    ['Invoice Date', invoiceDate],
    ['PO No', order.poNumber],
    ['PO Date', order.date.slice(0, 10)],
    ['Status', PO_STATUS_LABEL[order.status] ?? order.status],
  ]
  const metaWidth = 62
  const metaX = pageWidth - margin - metaWidth
  const boxGap = 5
  const boxWidth = (metaX - margin - boxGap * 2) / 2

  const supplierRows = [
    order.supplierName,
    `Supplier No: ${supplier?.supplierNumber ?? order.supplierNumber}`,
    supplier?.contactName ? `Attn: ${supplier.contactName}` : '',
    supplier?.phone ? `Phone: ${supplier.phone}` : '',
    supplier?.email ? `Email: ${supplier.email}` : '',
    supplier?.address ? supplier.address : '',
    supplier?.taxId ? `Tax ID: ${supplier.taxId}` : '',
  ].filter(Boolean)
  const deliverRows = [
    order.projectName
      ? `${order.projectCode ? `${order.projectCode} · ` : ''}${order.projectName}`
      : order.warehouseName || order.warehouseCode || '—',
    PURCHASE_DESTINATION_LABEL[order.destination] ?? order.destination,
    order.projectName && (order.warehouseName || order.warehouseCode)
      ? `Warehouse: ${order.warehouseName || order.warehouseCode}`
      : '',
  ].filter(Boolean)

  const supplierH = drawPartyBox(doc, 'Supplier', supplierRows, margin, y, boxWidth)
  const deliverH = drawPartyBox(
    doc,
    'Deliver to',
    deliverRows,
    margin + boxWidth + boxGap,
    y,
    boxWidth,
  )

  doc.setFontSize(8.5)
  let metaY = y + 4
  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, metaX, metaY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(value, pageWidth - margin, metaY, { align: 'right' })
    metaY += 5.2
  }

  y += Math.max(supplierH, deliverH, meta.length * 5.2 + 2) + 8

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item', 'Unit Cost', 'Ordered', 'Received', 'Returned', 'Amount']],
    body: order.lines.map((line, index) => [
      String(index + 1).padStart(2, '0'),
      `${line.name}\n${line.sku}`,
      money(line.unitCost),
      `${qty(line.quantity)} ${line.unit}`,
      qty(line.receivedQty),
      line.returnedQty ? qty(line.returnedQty) : '—',
      money(lineAmount(line)),
    ]),
    theme: 'plain',
    headStyles: { fillColor: YELLOW, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, textColor: INK, cellPadding: 2.6, valign: 'middle' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin, bottom: FOOTER_H + 8 },
    didParseCell: (data) => {
      if (data.section !== 'head') return
      if (data.column.index === 0) data.cell.styles.halign = 'center'
      if (data.column.index >= 2) data.cell.styles.halign = 'right'
    },
  })

  // @ts-expect-error autotable extension
  y = (doc.lastAutoTable?.finalY ?? y) + 8
  if (y > contentBottom - 50) {
    doc.addPage()
    y = margin
  }

  const grandTotal = order.outstandingPayable
  const summaryWidth = 82
  const summaryLeft = pageWidth - margin - summaryWidth
  const amountX = pageWidth - margin
  const summary: Array<[string, string]> = [
    ['Ordered value', money(order.orderedAmount)],
    ['Received value', money(order.receivedAmount)],
    ['Less: returns', order.returnedAmount ? `-${money(order.returnedAmount)}` : money(0)],
  ]
  const summaryTop = y
  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  for (const [label, amount] of summary) {
    doc.setFont('helvetica', 'normal')
    doc.text(label, summaryLeft, y)
    doc.text(amount, amountX, y, { align: 'right' })
    y += 6.5
  }
  doc.setFillColor(...YELLOW)
  doc.rect(summaryLeft - 3, y - 1.5, summaryWidth + 3, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text('Grand Total (BDT)', summaryLeft, y + 5)
  doc.text(money(grandTotal), amountX - 1, y + 5, { align: 'right' })
  y += 14

  const leftWidth = summaryLeft - margin - 10
  let leftY = summaryTop
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('Amount in words', margin, leftY)
  leftY += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const words = doc.splitTextToSize(amountInWords(grandTotal), leftWidth) as string[]
  doc.text(words, margin, leftY)
  leftY += words.length * 4 + 4
  const notes = order.notes?.trim()
  if (notes) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('Notes', margin, leftY)
    leftY += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    const noteLines = doc.splitTextToSize(notes, leftWidth) as string[]
    doc.text(noteLines.slice(0, 6), margin, leftY)
    leftY += Math.min(noteLines.length, 6) * 4 + 2
  }

  y = Math.max(y, leftY) + 18
  if (y > contentBottom - 12) {
    doc.addPage()
    y = margin + 18
  }
  const sigWidth = 58
  const signatures = ['Prepared by', 'Received by', 'Authorized signature']
  const step = (pageWidth - margin * 2 - sigWidth) / (signatures.length - 1)
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...INK)
  signatures.forEach((label, index) => {
    const x = margin + step * index
    doc.line(x, y, x + sigWidth, y)
    doc.text(label, x + sigWidth / 2, y + 4.5, { align: 'center' })
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    drawFooter(doc, branding)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - FOOTER_H - 3,
      { align: 'right' },
    )
  }

  return doc
}

export async function purchaseOrderInvoicePreviewUrl(
  input: PurchaseOrderInvoiceInput,
): Promise<string> {
  const doc = buildPurchaseOrderInvoicePdf(input, await loadCompanyBranding())
  return URL.createObjectURL(doc.output('blob'))
}

export async function downloadPurchaseOrderInvoicePdf(
  input: PurchaseOrderInvoiceInput,
): Promise<void> {
  const doc = buildPurchaseOrderInvoicePdf(input, await loadCompanyBranding())
  doc.save(`${purchaseOrderInvoiceNumber(input.order)}.pdf`)
}
