import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { resolveAssetUrl } from '../types/report-template'
import {
  formatInvoiceMoneyForPdf,
  invoiceTotals,
  lineTotal,
  type ProjectInvoiceDraft,
} from '../types/project-invoice'

const YELLOW: [number, number, number] = [235, 184, 45]
const INK: [number, number, number] = [26, 26, 26]
const MUTED: [number, number, number] = [120, 120, 120]
const FOOTER_H = 18

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg')
  ) {
    return 'JPEG'
  }
  return 'PNG'
}

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

  const logoUrl = resolveAssetUrl(draft.logoUrl)
  if (logoUrl) {
    const dataUrl = await loadImageDataUrl(logoUrl)
    const format = dataUrl ? imageFormatFromDataUrl(dataUrl) : null
    if (dataUrl && format) {
      try {
        doc.addImage(dataUrl, format, margin, y, 22, 12)
      } catch {
        // ignore
      }
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.text(draft.companyName, margin + 26, y + 8)

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

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...YELLOW)
  doc.setFontSize(10)
  doc.text('TOTAL DUE', pageWidth - margin, y - 14, { align: 'right' })
  doc.setFontSize(16)
  doc.text(
    formatInvoiceMoneyForPdf(totals.grandTotal, draft.currencyCode),
    pageWidth - margin,
    y - 6,
    { align: 'right' },
  )

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
  y = (doc.lastAutoTable?.finalY ?? y) + 8
  const summaryX = pageWidth - margin
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(
    `SUBTOTAL  ${formatInvoiceMoneyForPdf(totals.subtotal, draft.currencyCode)}`,
    summaryX,
    y,
    {
      align: 'right',
    },
  )
  y += 5
  doc.text(
    `Tax (VAT @ ${draft.taxRate}%)  ${formatInvoiceMoneyForPdf(totals.tax, draft.currencyCode)}`,
    summaryX,
    y,
    {
      align: 'right',
    },
  )
  y += 5
  doc.text(
    `Discount (${draft.discountRate}%)  -${formatInvoiceMoneyForPdf(totals.discount, draft.currencyCode)}`,
    summaryX,
    y,
    { align: 'right' },
  )
  y += 4
  doc.setFillColor(...YELLOW)
  doc.rect(pageWidth - margin - 78, y, 78, 9, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `Grand Total  ${formatInvoiceMoneyForPdf(totals.grandTotal, draft.currencyCode)}`,
    summaryX - 2,
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

  if (
    draft.useDigitalSignature &&
    draft.digitalSignatureDataUrl &&
    imageFormatFromDataUrl(draft.digitalSignatureDataUrl)
  ) {
    const format = imageFormatFromDataUrl(draft.digitalSignatureDataUrl)!
    try {
      doc.addImage(
        draft.digitalSignatureDataUrl,
        format,
        sigX,
        y + 2,
        55,
        18,
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

  doc.save(`${draft.invoiceNumber || 'invoice'}.pdf`)
}
