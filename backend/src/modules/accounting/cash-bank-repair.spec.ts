import {
  applyRepairPlan,
  planCashBankRepair,
  type AccountSnap,
} from './cash-bank-repair';

function row(
  code: string,
  name: string,
  parentCode: string | null,
  isPostable: boolean,
  isActive = true,
): AccountSnap {
  return { code, name, parentCode, isPostable, isActive };
}

describe('cash and bank chart repair', () => {
  const messy: AccountSnap[] = [
    row('1110', 'Cash & Bank Accounts', '1100', false),
    row('1111', 'Hand Cash', '1110', true),
    row('1112', 'BRAC Bank', '1119', true),
    row('1112-01', 'City Bank', '1112', true),
    row('1113', 'DBBL Bank', '1119', true),
    row('1114', 'Mobile Banking (bKash / Nagad)', '1116', true),
    row('1115', 'Cash in Bank', '1110', true, false),
    row('1116', 'Mobile Banking', '1110', false),
    row('1117', 'bKash', '1116', true),
    row('1118', 'Nagad', '1116', true),
    row('1119', 'Cash in Bank', '1110', false),
    row('1120', 'ACCOUNTS RECEIVABLE', '1100', false),
    row('1121', 'Client Receivables', '1120', true),
    row('1129', 'Allowance for Doubtful Accounts', '1120', true),
    row('1130', 'Employee Advances', '1100', false),
    row('1131', 'Advance to Staff', '1130', true),
  ];

  it('rebuilds the cash tree and moves receivables off the bank codes', () => {
    const repaired = applyRepairPlan(messy, planCashBankRepair(messy));
    const byCode = new Map(repaired.map((account) => [account.code, account]));

    expect(byCode.get('1110')).toMatchObject({
      isPostable: false,
      isActive: true,
      parentCode: '1100',
    });
    expect(byCode.get('1111')).toMatchObject({
      name: 'Cash in Hand',
      parentCode: '1110',
      isPostable: true,
    });
    expect(byCode.get('1120')).toMatchObject({
      name: 'Cash in Bank',
      parentCode: '1110',
      isPostable: false,
    });
    expect(byCode.get('1121')).toMatchObject({
      name: 'DBBL Bank A/C',
      parentCode: '1120',
      isPostable: true,
    });
    expect(byCode.get('1122')).toMatchObject({
      name: 'BRAC Bank A/C',
      parentCode: '1120',
      isPostable: true,
    });
    expect(byCode.get('1123')).toMatchObject({
      name: 'City Bank A/C',
      parentCode: '1120',
      isPostable: true,
    });
    expect(byCode.has('1130')).toBe(false);
    expect(byCode.get('1131')).toMatchObject({
      name: 'bKash',
      parentCode: '1110',
      isPostable: true,
    });
    expect(byCode.get('1132')).toMatchObject({
      name: 'Nagad',
      parentCode: '1110',
      isPostable: true,
    });

    expect(byCode.get('1150')?.name).toBe('ACCOUNTS RECEIVABLE');
    expect(byCode.get('1151')).toMatchObject({
      name: 'Client Receivables',
      parentCode: '1150',
      isPostable: true,
    });
    expect(byCode.get('1159')?.parentCode).toBe('1150');
    expect(byCode.get('1160')?.name).toBe('Employee Advances');
    expect(byCode.get('1161')).toMatchObject({
      name: 'Advance to Staff',
      parentCode: '1160',
    });

    for (const code of ['1112', '1112-01', '1113', '1114', '1115', '1116', '1117', '1118', '1119', '1130']) {
      expect(byCode.has(code)).toBe(false);
    }

    const bankChildren = repaired.filter((account) => account.parentCode === '1120');
    expect(bankChildren.map((account) => account.code).sort()).toEqual([
      '1121',
      '1122',
      '1123',
    ]);
    expect(repaired.find((account) => account.code === '1122')?.isPostable).toBe(true);
    expect(repaired.some((account) => account.parentCode === '1122')).toBe(false);
  });
});
