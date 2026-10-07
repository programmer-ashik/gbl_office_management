import PDFDocument from 'pdfkit';
import { fromMinorUnits } from '../../common/utils/money';
import { resolveCompanyLogoForPdf } from '../pdf/company-logo';
import type { IPayrollEarnings, PayrollRunDocument } from './payroll-run.model';

function moneyLabel(minor: number): string {
  return `BDT ${fromMinorUnits(minor).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "September 2026" */
function salaryMonthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "06 October 2026", in Bangladesh time. */
function issueDateLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });
}

type SlipLine = PayrollRunDocument['lines'][number];

/** Earnings split keyed by employee id; employees without one print Allowances as a total. */
export type SlipEarnings = Map<string, IPayrollEarnings>;

async function drawSlip(
  doc: PDFKit.PDFDocument,
  run: PayrollRunDocument,
  line: SlipLine,
  logoPath: string | null,
  companyName: string,
  earnings: IPayrollEarnings | undefined,
): Promise<void> {
  const left = 48;
  const right = 547;
  const width = right - left;

  if (logoPath) {
    try {
      doc.image(logoPath, left, 40, { height: 36 });
    } catch {
      /* ignore bad logo */
    }
  }

  doc
    .fontSize(16)
    .fillColor('#0f2744')
    .text(companyName, logoPath ? left + 90 : left, 44, {
      width: width - (logoPath ? 90 : 0),
    });
  doc.fontSize(10).fillColor('#5a6578').text('Salary Slip', {
    width: width - (logoPath ? 90 : 0),
  });

  doc
    .fontSize(10)
    .fillColor('#0f2744')
    .text(run.sheetNumber, left, 44, { width, align: 'right' });
  doc
    .fillColor('#5a6578')
    .text(
      `Month of Salary: ${salaryMonthLabel(run.periodYear, run.periodMonth)}`,
      { width, align: 'right' },
    )
    .text(`Issue Date: ${issueDateLabel(new Date())}`, { width, align: 'right' });

  doc.moveDown(1.2);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#1d4ed8').lineWidth(1.2).stroke();
  doc.moveDown(0.8);

  doc.fillColor('#0f2744').fontSize(11);
  doc.text(`Employee: ${line.employeeName}`, left);
  doc.moveDown(0.8);

  const startY = doc.y;
  const colW = width / 2 - 8;

  // Earnings box
  doc.rect(left, startY, colW, 18).fill('#1d4ed8');
  doc.fillColor('#ffffff').fontSize(10).text('Earnings', left + 8, startY + 4, {
    width: colW - 16,
  });
  doc
    .fillColor('#ffffff')
    .text('Amount', left + 8, startY + 4, { width: colW - 16, align: 'right' });

  let y = startY + 22;
  const earningRows: Array<{ label: string; value: string; strong?: boolean }> =
    earnings
      ? [
          { label: 'Basic', value: moneyLabel(line.basicMinor) },
          { label: 'House Rent', value: moneyLabel(earnings.houseRentMinor) },
          { label: 'Medical', value: moneyLabel(earnings.medicalAllowanceMinor) },
          { label: 'Conveyance', value: moneyLabel(earnings.conveyanceAllowanceMinor) },
          { label: 'Other', value: moneyLabel(earnings.otherAllowancesMinor) },
        ]
      : [
          { label: 'Basic', value: moneyLabel(line.basicMinor) },
          { label: 'Allowances', value: moneyLabel(line.allowancesMinor) },
        ];
  earningRows.push(
    { label: 'Gross', value: moneyLabel(line.grossMinor), strong: true },
    {
      label: 'Net (Gross - PF / Tax)',
      value: moneyLabel(line.grossMinor - (line.structuralDeductionMinor ?? 0)),
    },
  );
  if (earnings) {
    earningRows.push({
      label: 'Custom override',
      value: earnings.customBreakdownApplied ? 'Yes' : 'No',
    });
  }
  for (const row of earningRows) {
    if (row.strong) {
      doc.rect(left, y - 2, colW, 18).fill('#e8eefc');
    }
    doc.fillColor('#152033').fontSize(9).text(row.label, left + 8, y, {
      width: colW - 16,
    });
    doc.text(row.value, left + 8, y, {
      width: colW - 16,
      align: 'right',
    });
    y += 16;
  }

  // Deductions box
  const dLeft = left + colW + 16;
  doc.rect(dLeft, startY, colW, 18).fill('#1d4ed8');
  doc
    .fillColor('#ffffff')
    .fontSize(10)
    .text('Deductions', dLeft + 8, startY + 4, { width: colW - 16 });
  doc.text('Amount', dLeft + 8, startY + 4, {
    width: colW - 16,
    align: 'right',
  });

  let dy = startY + 22;
  const deductionRows: Array<[string, number]> = [
    ['Provident fund', line.providentFundMinor ?? 0],
    ['Tax (AIT)', line.taxDeductionMinor ?? 0],
  ];
  if ((line.structureAdvanceMinor ?? 0) > 0) {
    deductionRows.push(['Structure advance', line.structureAdvanceMinor ?? 0]);
  }
  for (const item of line.advanceDeductions ?? []) {
    deductionRows.push([
      `Project adv. ${item.advanceNumber}`,
      item.amountMinor,
    ]);
  }
  for (const item of line.facilityDeductions ?? []) {
    deductionRows.push([item.label, item.amountMinor]);
  }
  const totalDed =
    (line.structuralDeductionMinor ?? 0) +
    line.totalAdvanceDeductionMinor +
    (line.totalFacilityDeductionMinor ?? 0);
  deductionRows.push(['Total deductions', totalDed]);
  deductionRows.forEach(([label, amount], idx) => {
    if (idx === deductionRows.length - 1) {
      doc.rect(dLeft, dy - 2, colW, 18).fill('#e8eefc');
    }
    doc.fillColor('#152033').fontSize(9).text(label, dLeft + 8, dy, {
      width: colW - 16,
    });
    doc.text(moneyLabel(amount), dLeft + 8, dy, {
      width: colW - 16,
      align: 'right',
    });
    dy += 16;
  });

  const netTop = Math.max(y, dy) + 16;
  doc.y = netTop;
  doc.rect(left, doc.y, width, 36).fill('#1d4ed8');
  doc
    .fillColor('#ffffff')
    .fontSize(10)
    .text('Net payable', left + 12, doc.y + 6);
  doc
    .fontSize(14)
    .text(moneyLabel(line.netPayMinor), left + 12, doc.y + 4, {
      width: width - 24,
      align: 'right',
    });

  const signY = netTop + 36 + 70;
  const signW = 180;
  const signatures: Array<[string, string, number]> = [
    ['Employee signature', line.employeeName, left],
    ['Authorized signature', 'For the company', right - signW],
  ];
  doc.strokeColor('#5a6578').lineWidth(0.6);
  for (const [label, caption, x] of signatures) {
    doc.moveTo(x, signY).lineTo(x + signW, signY).stroke();
    doc
      .fillColor('#152033')
      .fontSize(9.5)
      .text(label, x, signY + 5, { width: signW, align: 'center' });
    doc
      .fillColor('#5a6578')
      .fontSize(8)
      .text(caption, x, signY + 18, { width: signW, align: 'center' });
  }

  doc.x = left;
  doc.y = signY + 44;
}

export async function buildSalarySlipPdf(
  run: PayrollRunDocument,
  employeeId: string,
  earnings: SlipEarnings = new Map(),
): Promise<{ buffer: Buffer; filename: string }> {
  const line = run.lines.find((row) => row.employeeId.toString() === employeeId);
  if (!line) {
    throw new Error('Employee not found on this payroll run');
  }
  const brand = await resolveCompanyLogoForPdf();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    void drawSlip(
      doc,
      run,
      line,
      brand.absolutePath,
      brand.companyName,
      earnings.get(employeeId) ?? line.earnings,
    ).then(() => doc.end());
  });

  return {
    buffer,
    filename: `${run.sheetNumber}-${line.employeeName.replace(/\s+/g, '-')}-slip.pdf`,
  };
}

export async function buildPayrollSlipsPdf(
  run: PayrollRunDocument,
  earnings: SlipEarnings = new Map(),
): Promise<{ buffer: Buffer; filename: string }> {
  const brand = await resolveCompanyLogoForPdf();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    void (async () => {
      for (let index = 0; index < run.lines.length; index += 1) {
        if (index > 0) doc.addPage();
        await drawSlip(
          doc,
          run,
          run.lines[index],
          brand.absolutePath,
          brand.companyName,
          earnings.get(run.lines[index].employeeId.toString()) ??
            run.lines[index].earnings,
        );
      }
      doc.end();
    })().catch(reject);
  });

  return {
    buffer,
    filename: `${run.sheetNumber}-salary-slips.pdf`,
  };
}
