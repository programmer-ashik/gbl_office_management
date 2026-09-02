import { AccountType } from '../../common/enums/account-type.enum';

export type SeedAccount = {
  code: string;
  name: string;
  type: AccountType;
  description: string;
};

export const DEFAULT_CHART_OF_ACCOUNTS: SeedAccount[] = [
  {
    code: '1000',
    name: 'Cash in Hand',
    type: AccountType.ASSET,
    description: 'Physical cash on hand',
  },
  {
    code: '1010',
    name: 'Bank Accounts',
    type: AccountType.ASSET,
    description: 'Commercial bank balances',
  },
  {
    code: '1020',
    name: 'Mobile Banking',
    type: AccountType.ASSET,
    description: 'bKash, Nagad and similar wallets',
  },
  {
    code: '1100',
    name: 'Accounts Receivable',
    type: AccountType.ASSET,
    description: 'Amounts owed by clients',
  },
  {
    code: '1200',
    name: 'Inventory',
    type: AccountType.ASSET,
    description: 'Warehouse stock at cost',
  },
  {
    code: '1300',
    name: 'Employee Advances',
    type: AccountType.ASSET,
    description: 'Unsettled employee advances (not expenses)',
  },
  {
    code: '2000',
    name: 'Accounts Payable',
    type: AccountType.LIABILITY,
    description: 'Amounts owed to suppliers',
  },
  {
    code: '2100',
    name: 'Employee Payables',
    type: AccountType.LIABILITY,
    description: 'Amounts owed to employees',
  },
  {
    code: '3000',
    name: "Owner's Equity",
    type: AccountType.EQUITY,
    description: 'Owner capital contributions',
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    type: AccountType.EQUITY,
    description: 'Accumulated retained earnings',
  },
  {
    code: '4000',
    name: 'Project Revenue',
    type: AccountType.REVENUE,
    description: 'Contract and project income',
  },
  {
    code: '4100',
    name: 'Other Income',
    type: AccountType.REVENUE,
    description: 'Non-project income',
  },
  {
    code: '5000',
    name: 'Project Materials',
    type: AccountType.EXPENSE,
    description: 'Materials consumed on projects',
  },
  {
    code: '5100',
    name: 'Labor Cost',
    type: AccountType.EXPENSE,
    description: 'Allocated payroll and site labor',
  },
  {
    code: '5200',
    name: 'Office Expenses',
    type: AccountType.EXPENSE,
    description: 'Administrative overhead',
  },
  {
    code: '5300',
    name: 'Travel & Conveyance',
    type: AccountType.EXPENSE,
    description: 'Travel related to operations',
  },
];
