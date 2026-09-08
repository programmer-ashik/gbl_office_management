import PDFDocument from 'pdfkit';
import { fromMinorUnits } from '../../common/utils/money';
import type { PayrollRunDocument } from './payroll-run.model';

function moneyLabel(minor: number): string {
  return `BDT ${fromMinorUnits(minor).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function buildSalarySlipPdf(
  run: PayrollRunDocument,
  employeeId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const line = run.lines.find((row) => row.employeeId.toString() === employeeId);
  if (!line) {
    throw new Error('Employee not found on this payroll run');
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0f2744').text('GBL Office');
    doc.fontSize(11).fillColor('#5a6578').text('Salary Slip');
    doc.moveDown(0.8);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#cfd6e0').stroke();
    doc.moveDown(1);

    doc.fillColor('#0f2744').fontSize(12);
    doc.text(`Sheet: ${run.sheetNumber}`);
    doc.text(`Period: ${periodLabel(run.periodYear, run.periodMonth)}`);
    doc.text(`Employee: ${line.employeeName}`);
    doc.text(
      `Paid via: ${run.treasuryAccountCode ?? '—'} · JE ${run.journalNumber ?? '—'}`,
    );
    doc.moveDown(0.8);

    doc.fontSize(11).fillColor('#152033');
    doc.text(`Basic: ${moneyLabel(line.basicMinor)}`);
    doc.text(`Allowances: ${moneyLabel(line.allowancesMinor)}`);
    doc.text(`Gross: ${moneyLabel(line.grossMinor)}`);
    doc.moveDown(0.4);
    doc.text(`Provident Fund: ${moneyLabel(line.providentFundMinor ?? 0)}`);
    doc.text(`Tax (AIT): ${moneyLabel(line.taxDeductionMinor ?? 0)}`);
    doc.text(
      `Advance (structure): ${moneyLabel(line.structureAdvanceMinor ?? 0)}`,
    );
    doc.text(
      `Advance recovery: ${moneyLabel(line.totalAdvanceDeductionMinor)}`,
    );
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Net Payable: ${moneyLabel(line.netPayMinor)}`);

    doc.moveDown(1.2);
    doc.fontSize(9).fillColor('#5a6578');
    doc.text(
      'Accrual: Dr 5120/5230 · Cr 1131 / 2133 / 2131 / 2121. Disbursement: Dr 2121 · Cr Cash/Bank.',
    );
    doc.text('This slip is system-generated after payroll disbursement.');
    doc.end();
  });

  return {
    buffer,
    filename: `${run.sheetNumber}-${line.employeeName.replace(/\s+/g, '-')}-slip.pdf`,
  };
}

export async function buildPayrollSlipsPdf(
  run: PayrollRunDocument,
): Promise<{ buffer: Buffer; filename: string }> {
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    run.lines.forEach((line, index) => {
      if (index > 0) doc.addPage();
      doc.fontSize(16).fillColor('#0f2744').text('GBL Office');
      doc.fontSize(11).fillColor('#5a6578').text('Salary Slip');
      doc.moveDown(0.8);
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#cfd6e0').stroke();
      doc.moveDown(1);
      doc.fillColor('#0f2744').fontSize(12);
      doc.text(`Sheet: ${run.sheetNumber}`);
      doc.text(`Period: ${periodLabel(run.periodYear, run.periodMonth)}`);
      doc.text(`Employee: ${line.employeeName}`);
      doc.moveDown(0.6);
      doc.fontSize(11).fillColor('#152033');
      doc.text(`Gross: ${moneyLabel(line.grossMinor)}`);
      doc.text(
        `Deductions: ${moneyLabel(
          line.structuralDeductionMinor + line.totalAdvanceDeductionMinor,
        )}`,
      );
      doc.text(`Net Payable: ${moneyLabel(line.netPayMinor)}`);
    });

    doc.end();
  });

  return {
    buffer,
    filename: `${run.sheetNumber}-salary-slips.pdf`,
  };
}
