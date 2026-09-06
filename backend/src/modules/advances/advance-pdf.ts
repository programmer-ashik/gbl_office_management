import PDFDocument from 'pdfkit'
import { AdvanceStatus } from '../../common/enums/advance-status.enum'
import { fromMinorUnits } from '../../common/utils/money'
import type { AdvanceDocument } from './advance.model'

const STATUS_LABEL: Record<AdvanceStatus, string> = {
  [AdvanceStatus.PENDING]: 'Pending',
  [AdvanceStatus.REJECTED]: 'Rejected',
  [AdvanceStatus.DISBURSED]: 'Disbursed',
  [AdvanceStatus.SUBMITTED]: 'Submitted',
  [AdvanceStatus.SETTLED]: 'Settled',
}

function moneyLabel(minor: number): string {
  return `BDT ${fromMinorUnits(minor).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateLabel(value?: Date | null): string {
  if (!value) return '—'
  return value.toISOString().slice(0, 10)
}

export async function buildAdvanceVoucherPdf(
  row: AdvanceDocument,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(16).fillColor('#0f2744').text('GBL Office')
    doc
      .fontSize(11)
      .fillColor('#5a6578')
      .text('Employee Advance Disbursement Voucher')
    doc.moveDown(0.8)
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#cfd6e0').stroke()
    doc.moveDown(1)

    doc.fillColor('#0f2744').fontSize(12)
    doc.text(`Voucher No: ${row.advanceNumber}`)
    doc.text(`Status: ${STATUS_LABEL[row.status] ?? row.status}`)
    doc.text(`Date: ${dateLabel(row.disbursedAt ?? row.requestedAt)}`)
    doc.moveDown(0.6)
    doc.text(`Employee: ${row.employeeName}`)
    doc.text(`Project: ${row.projectCode} · ${row.projectName}`)
    doc.text(`Purpose: ${row.purpose}`)
    doc.moveDown(0.8)

    doc.fontSize(11).fillColor('#152033')
    doc.text(`Requested: ${moneyLabel(row.requestedMinor)}`)
    doc.text(
      `Disbursed: ${
        row.disbursedMinor !== undefined
          ? moneyLabel(row.disbursedMinor)
          : '—'
      }`,
    )
    doc.text(
      `Treasury / GL: ${row.treasuryAccountCode ?? 'Pending disbursement'}`,
    )
    doc.text(`Disbursement JE: ${row.disbursementJournalNumber ?? '—'}`)
    if (row.spentMinor !== undefined) {
      doc.text(`Settled spend: ${moneyLabel(row.spentMinor)}`)
    }
    if (row.settlementJournalNumber) {
      doc.text(`Settlement JE: ${row.settlementJournalNumber}`)
    }

    doc.moveDown(1.2)
    doc.fontSize(9).fillColor('#5a6578')
    doc.text(
      'Accounting: Dr 1131 Employee Advances (employee + project) / Cr Cash or Bank.',
    )
    doc.text('This voucher is system-generated from posted advance records.')

    doc.end()
  })
}

export async function buildProjectAdvanceReportPdf(input: {
  projectCode: string
  projectName: string
  rows: AdvanceDocument[]
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(16).fillColor('#0f2744').text('Project Advance Summary Report')
    doc
      .fontSize(11)
      .fillColor('#5a6578')
      .text(`${input.projectCode} · ${input.projectName}`)
    doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`)
    doc.moveDown(0.8)

    const totalRequested = input.rows.reduce(
      (sum, row) => sum + row.requestedMinor,
      0,
    )
    const totalDisbursed = input.rows.reduce(
      (sum, row) => sum + (row.disbursedMinor ?? 0),
      0,
    )
    const totalSpent = input.rows.reduce(
      (sum, row) => sum + (row.spentMinor ?? 0),
      0,
    )

    doc.fillColor('#152033').fontSize(11)
    doc.text(`Advances: ${input.rows.length}`)
    doc.text(`Total requested: ${moneyLabel(totalRequested)}`)
    doc.text(`Total disbursed: ${moneyLabel(totalDisbursed)}`)
    doc.text(`Total settled spend: ${moneyLabel(totalSpent)}`)
    doc.moveDown(0.8)

    const colX = [40, 120, 250, 390, 480, 580, 680]
    const headers = [
      'Number',
      'Employee',
      'Purpose',
      'Requested',
      'Disbursed',
      'Spent',
      'Status',
    ]
    let y = doc.y
    doc.fontSize(9).fillColor('#0f2744')
    headers.forEach((header, index) => {
      const width = (colX[index + 1] ?? 780) - colX[index]! - 6
      doc.text(header, colX[index], y, { width })
    })
    y += 16
    doc.moveTo(40, y).lineTo(780, y).strokeColor('#cfd6e0').stroke()
    y += 8

    doc.fillColor('#152033')
    for (const row of input.rows) {
      if (y > 520) {
        doc.addPage()
        y = 48
      }
      const cells = [
        row.advanceNumber,
        row.employeeName,
        row.purpose.slice(0, 36),
        moneyLabel(row.requestedMinor),
        row.disbursedMinor !== undefined ? moneyLabel(row.disbursedMinor) : '—',
        row.spentMinor !== undefined ? moneyLabel(row.spentMinor) : '—',
        STATUS_LABEL[row.status] ?? row.status,
      ]
      cells.forEach((cell, index) => {
        const width = (colX[index + 1] ?? 780) - colX[index]! - 6
        doc.text(cell, colX[index], y, { width })
      })
      y += 18
    }

    doc.end()
  })
}
