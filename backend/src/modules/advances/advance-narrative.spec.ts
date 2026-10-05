import {
  isAdvanceNumber,
  isAutoAdvanceLineText,
  withAdvancePurpose,
} from './advance-narrative';

describe('advance narrative', () => {
  const purpose = 'Fuel and toll for Narayanganj site visit';

  it('recognises advance numbers', () => {
    expect(isAdvanceNumber('ADV-2026-00003')).toBe(true);
    expect(isAdvanceNumber('PO-2026-00003')).toBe(false);
    expect(isAdvanceNumber(null)).toBe(false);
  });

  it('treats generated advance wording as replaceable', () => {
    expect(isAutoAdvanceLineText('Disburse ADV-2026-00003')).toBe(true);
    expect(isAutoAdvanceLineText('Advance to Rahim Uddin')).toBe(true);
    expect(isAutoAdvanceLineText('Close employee advance')).toBe(true);
    expect(isAutoAdvanceLineText('Unspent advance returned')).toBe(true);
    expect(isAutoAdvanceLineText('Excess spend due to employee')).toBe(true);
    expect(isAutoAdvanceLineText('Reimburse Rahim · ADV-2026-00003')).toBe(true);
    expect(isAutoAdvanceLineText('Site Transport', 'Site Transport')).toBe(true);
    expect(isAutoAdvanceLineText('')).toBe(true);
    expect(isAutoAdvanceLineText('Cement 10 bags', 'Project Materials')).toBe(false);
  });

  it('replaces only generated line text with the purpose', () => {
    const lines = withAdvancePurpose(
      [
        { accountName: 'Advance to Staff', description: 'Advance to Rahim' },
        { accountName: 'Hand Cash', description: 'Disburse ADV-2026-00003' },
        { accountName: 'Project Materials', description: 'Cement 10 bags' },
      ],
      purpose,
    );
    expect(lines.map((line) => line.description)).toEqual([
      purpose,
      purpose,
      'Cement 10 bags',
    ]);
  });

  it('leaves lines untouched without a purpose', () => {
    const lines = [{ accountName: 'Hand Cash', description: 'Disburse ADV-2026-00003' }];
    expect(withAdvancePurpose(lines, undefined)).toBe(lines);
  });
});
