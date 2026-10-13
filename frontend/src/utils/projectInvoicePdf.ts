import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  DEFAULT_COMPANY_LOGO_URL,
  DEFAULT_COMPANY_NAME,
  resolveAssetUrl,
} from '../types/report-template'
import {
  formatInvoiceMoneyForPdf,
  invoiceSummaryRows,
  invoiceTotals,
  lineTotal,
  type ProjectInvoiceDraft,
} from '../types/project-invoice'
import {
  PDF_SIGNATURE_MAX_PX,
  fitImageSize,
  imageFormatFromDataUrl,
  loadPdfImage,
  shrinkImageDataUrl,
} from './pdfImage'

const YELLOW: [number, number, number] = [235, 184, 45]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [120, 120, 120]
const FOOTER_H = 18

function drawColoredNoteFooter(doc: jsPDF, note: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - FOOTER_H
  doc.setFillColor(...YELLOW)
  doc.rect(0, y, pageWidth, FOOTER_H, 'F')
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  const text = `NOTE: ${note || ''}`.trim()
  const lines = doc.splitTextToSize(text, pageWidth - 16)
  const textHeight = lines.length * 3.2
  const textY = y + (FOOTER_H - textHeight) / 2 + 2.4
  doc.text(lines.slice(0, 3), pageWidth / 2, textY, { align: 'center' })
}

export async function downloadProjectInvoicePdf(
  draft: ProjectInvoiceDraft,
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentBottom = pageHeight - FOOTER_H - 8
  let y = margin
  const totals = invoiceTotals(draft)

  const title = draft.documentTitle?.trim()
  if (title) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...INK)
    doc.text(title.toUpperCase(), pageWidth / 2, y + 4, { align: 'center' })
    const titleW = doc.getTextWidth(title.toUpperCase())
    doc.setDrawColor(...YELLOW)
    doc.setLineWidth(1.2)
    doc.line(pageWidth / 2 - titleW / 2, y + 7, pageWidth / 2 + titleW / 2, y + 7)
    y += 14
  }

  const logoUrl = resolveAssetUrl(draft.logoUrl) ?? DEFAULT_COMPANY_LOGO_URL
  const logoData =
    (await loadPdfImage(logoUrl)) ??
    (logoUrl !== DEFAULT_COMPANY_LOGO_URL
      ? await loadPdfImage(DEFAULT_COMPANY_LOGO_URL)
      : null)
  const logoFormat = logoData ? imageFormatFromDataUrl(logoData) : null
  if (logoData && logoFormat) {
    try {
      const { w, h } = fitImageSize(doc, logoData, 22, 12)
      doc.addImage(logoData, logoFormat, margin, y, w, h, undefined, 'FAST')
    } catch {
      // ignore
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.text(draft.companyName || DEFAULT_COMPANY_NAME, margin + 26, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const contact = [
    draft.companyAddress,
    draft.companyEmail,
    draft.companyPhone,
  ].filter(Boolean)
  doc.text(contact.join('\n') || ' ', pageWidth - margin, y, { align: 'right' })
  y += 22

  const metaY = y
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(
    [
      `No: ${draft.invoiceNumber}`,
      `Date: ${draft.date.slice(0, 10)}`,
      `Due: ${draft.dueDate.slice(0, 10)}`,
    ],
    pageWidth - margin,
    metaY,
    { align: 'right' },
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(`Bill To: ${draft.billToName}`, margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Client: ${draft.client}`, margin, y)
  y += 4
  doc.text(`Phone: ${draft.phone || '—'}`, margin, y)
  y += 4
  doc.text(`Email: ${draft.email || '—'}`, margin, y)
  y += 4
  doc.text(`Address: ${draft.address || '—'}`, margin, y)

  y += 10
  autoTable(doc, {
    startY: y,
    head: [['Item', 'Description', 'Unit Price', 'Quantity', 'Total']],
    body: draft.lines.map((line) => [
      line.title,
      line.description || '—',
      formatInvoiceMoneyForPdf(line.unitPrice, draft.currencyCode),
      String(Math.round(line.quantity)).padStart(2, '0'),
      formatInvoiceMoneyForPdf(lineTotal(line), draft.currencyCode),
    ]),
    theme: 'plain',
    headStyles: {
      fillColor: YELLOW,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    styles: { fontSize: 9, textColor: INK, cellPadding: 3 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  // @ts-expect-error autotable extension
  y = (doc.lastAutoTable?.finalY ?? y) + 10

  const summaryWidth = 88
  const summaryLeft = pageWidth - margin - summaryWidth
  const labelX = summaryLeft
  const amountX = pageWidth - margin
  const rowGap = 7

  function drawSummaryRow(
    label: string,
    amount: string,
    opts?: { bold?: boolean },
  ) {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.text(label, labelX, y)
    doc.text(amount, amountX, y, { align: 'right' })
    y += rowGap
  }

  doc.setTextColor(...INK)
  for (const row of invoiceSummaryRows(draft)) {
    const amount = formatInvoiceMoneyForPdf(row.amount, draft.currencyCode)
    drawSummaryRow(row.label, row.negative ? `-${amount}` : amount)
  }

  y += 1
  doc.setFillColor(...YELLOW)
  doc.rect(summaryLeft, y - 1, summaryWidth, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Grand Total', labelX + 3, y + 6)
  doc.text(
    formatInvoiceMoneyForPdf(totals.grandTotal, draft.currencyCode),
    amountX - 2,
    y + 6,
    { align: 'right' },
  )

  y += 16

  if (draft.showPaymentMethods) {
    if (y > contentBottom - 28) {
      drawColoredNoteFooter(doc, draft.note)
      doc.addPage()
      y = margin
    }
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Payment Method We Accept', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    if (draft.paymentPaypal.trim()) {
      doc.text(`PayPal · ${draft.paymentPaypal.trim()}`, margin, y)
      y += 4
    }
    if (draft.acceptCard) {
      doc.text('Card Payment · Visa / Mastercard / Amex', margin, y)
      y += 4
    }
    if (!draft.paymentPaypal.trim() && !draft.acceptCard) {
      doc.text('Contact us for payment options.', margin, y)
      y += 4
    }
    y += 6
  }

  if (y > contentBottom - 36) {
    drawColoredNoteFooter(doc, draft.note)
    doc.addPage()
    y = margin
  }

  const sigX = pageWidth - margin - 70
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(draft.authorizedLabel || 'Authorized Signature', sigX, y)

  const signature =
    draft.useDigitalSignature && draft.digitalSignatureDataUrl
      ? await shrinkImageDataUrl(
          draft.digitalSignatureDataUrl,
          PDF_SIGNATURE_MAX_PX,
        )
      : null
  if (signature && imageFormatFromDataUrl(signature)) {
    const format = imageFormatFromDataUrl(signature)!
    try {
      doc.addImage(
        signature,
        format,
        sigX,
        y + 2,
        55,
        18,
        undefined,
        'FAST',
      )
      y += 22
    } catch {
      doc.setDrawColor(...MUTED)
      doc.line(sigX, y + 14, sigX + 60, y + 14)
      y += 16
    }
  } else {
    doc.setDrawColor(...MUTED)
    doc.setLineWidth(0.3)
    doc.line(sigX, y + 14, sigX + 60, y + 14)
    y += 16
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK)
  if (draft.authorizedName.trim()) {
    doc.text(draft.authorizedName.trim(), sigX, y)
    y += 4
  }
  if (draft.authorizedTitle.trim()) {
    doc.setTextColor(...MUTED)
    doc.text(draft.authorizedTitle.trim(), sigX, y)
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    drawColoredNoteFooter(doc, draft.note)
  }

  // Free text boxes sit where they were placed on the first page (x/y are % of the sheet).
  doc.setPage(1)
  for (const box of draft.textBoxes) {
    const text = box.text.trim()
    if (!text) continue
    const boxW = (pageWidth * box.width) / 100
    const left = (pageWidth * box.x) / 100
    const top = (pageHeight * box.y) / 100
    const x = box.align === 'center' ? left + boxW / 2 : box.align === 'right' ? left + boxW : left
    doc.setFont('helvetica', box.bold ? 'bold' : 'normal')
    doc.setFontSize(Math.max(6, box.fontSize * 0.75))
    doc.setTextColor(box.color || '#333333')
    doc.text(doc.splitTextToSize(text, boxW) as string[], x, top + 4, { align: box.align })
  }

  doc.save(`${draft.invoiceNumber || 'invoice'}.pdf`)
}
