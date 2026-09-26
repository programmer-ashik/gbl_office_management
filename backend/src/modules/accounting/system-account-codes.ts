/**
 * Postable leaf accounts used by system modules (journals, banking, AR/AP, etc.).
 * Must match chart_of_accounts.json leaf codes.
 */
export const SystemAccountCode = {
  /** Physical cash (1111 Cash in Hand). */
  CASH: '1111',
  CASH_IN_HAND: '1111',
  /** Cash in Bank header. New bank accounts are siblings under this code. */
  CASH_IN_BANK: '1120',
  /** DBBL Bank A/C */
  BANK_ALT: '1121',
  /** BRAC Bank A/C — default commercial bank treasury. */
  BANK: '1122',
  /** City Bank A/C */
  CITY_BANK: '1123',
  /** bKash. MOBILE_BANKING stays as the default mobile leaf. */
  BKASH: '1131',
  MOBILE_BANKING: '1131',
  NAGAD: '1132',
  ACCOUNTS_RECEIVABLE: '1151',
  ALLOWANCE_DOUBTFUL: '1159',
  EMPLOYEE_ADVANCES: '1161',
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
