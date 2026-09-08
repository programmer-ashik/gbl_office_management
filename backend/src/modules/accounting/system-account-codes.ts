/**
 * Postable leaf accounts used by system modules (journals, banking, AR/AP, etc.).
 * Must match chart_of_accounts.json leaf codes.
 */
export const SystemAccountCode = {
  /** Physical cash / hand cash (single channel). */
  CASH: '1111',
  /** @deprecated Alias of CASH — Cash in Hand was a duplicate of Hand Cash. */
  CASH_IN_HAND: '1111',
  BANK: '1112',
  BANK_ALT: '1113',
  MOBILE_BANKING: '1114',
  ACCOUNTS_RECEIVABLE: '1121',
  ALLOWANCE_DOUBTFUL: '1129',
  EMPLOYEE_ADVANCES: '1131',
  INVENTORY: '1141',
  SITE_STOCK: '1142',
  ACCOUNTS_PAYABLE: '2111',
  SUBCONTRACTOR_PAYABLE: '2113',
  EMPLOYEE_PAYABLES: '2121',
  SOURCE_TAX_PAYABLE: '2131',
  VAT_PAYABLE: '2132',
  PF_PAYABLE: '2133',
  OWNER_CAPITAL: '3100',
  RETAINED_EARNINGS: '3200',
  PROJECT_REVENUE: '4110',
  OTHER_INCOME: '4200',
  PROJECT_MATERIALS: '5110',
  PROJECT_LABOR: '5120',
  EQUIPMENT_RENTAL: '5130',
  SITE_TRANSPORT: '5140',
  OFFICE_RENT: '5210',
  UTILITIES: '5220',
  ADMIN_SALARIES: '5230',
  OFFICE_EXPENSES: '5240',
  BANK_CHARGES: '5250',
} as const;

export type SystemAccountCode =
  (typeof SystemAccountCode)[keyof typeof SystemAccountCode];
