export enum AdvanceStatus {
  PENDING = 'pending',
  REJECTED = 'rejected',
  DISBURSED = 'disbursed',
  SUBMITTED = 'submitted',
  SETTLED = 'settled',
}

export const ALL_ADVANCE_STATUSES = Object.values(AdvanceStatus);

export enum SettlementCase {
  EQUAL = 'equal',
  LESS = 'less',
  MORE = 'more',
}
