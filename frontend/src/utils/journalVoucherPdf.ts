import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { money, type JournalEntry } from '../types/accounting'

export function buildJournalVoucherPdf(entry: JournalEntry): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('GBL Enterprise', pageWidth / 2, 18, { align: 'center' })
  doc.setFontSize(12)
  doc.text('Journal Voucher', pageWidth / 2, 26, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const metaY = 36
  doc.text(`Voucher No: ${entry.entryNumber}`, 14, metaY)
  doc.text(`Date: ${entry.date.slice(0, 10)}`, 14, metaY + 6)
  doc.text(`Status: ${entry.status}`, 14, metaY + 12)
  doc.text(`Memo: ${entry.memo}`, 14, metaY + 18, { maxWidth: pageWidth - 28 })

  autoTable(doc, {
    startY: metaY + 28,
    head: [['Account', 'Description', 'Debit', 'Credit']],
    body: entry.lines.map((line) => [
      `${line.accountCode} · ${line.accountName}`,
      line.description ?? '—',
      line.debit > 0 ? money(line.debit) : '',
      line.credit > 0 ? money(line.credit) : '',
    ]),
    foot: [['Totals', '', money(entry.totalDebit), money(entry.totalCredit)]],
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 39, 68], textColor: 255 },
    footStyles: { fillColor: [238, 241, 245], textColor: [21, 32, 51], fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  const finalY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    120
  doc.setFontSize(9)
  doc.text('Prepared by ________________', 14, finalY + 18)
  doc.text('Checked by ________________', 80, finalY + 18)
  doc.text('Approved by ________________', 146, finalY + 18)

  return doc
}

export function downloadJournalVoucher(entry: JournalEntry): void {
  const doc = buildJournalVoucherPdf(entry)
  doc.save(`${entry.entryNumber}-voucher.pdf`)
}

export function previewJournalVoucher(entry: JournalEntry): void {
  const doc = buildJournalVoucherPdf(entry)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
