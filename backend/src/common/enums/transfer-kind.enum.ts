export enum TransferKind {
  WITHDRAWAL = 'withdrawal',
  DEPOSIT = 'deposit',
  TRANSFER = 'transfer',
}

export const ALL_TRANSFER_KINDS = Object.values(TransferKind);
