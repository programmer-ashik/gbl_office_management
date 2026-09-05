export enum TreasuryKind {
  COMMERCIAL_BANK = 'commercial_bank',
  CASH = 'cash',
  PETTY_CASH = 'petty_cash',
  MOBILE_BANKING = 'mobile_banking',
}

export const ALL_TREASURY_KINDS = Object.values(TreasuryKind);

export const TREASURY_PARENT_CODE: Record<TreasuryKind, string> = {
  [TreasuryKind.COMMERCIAL_BANK]: '1112',
  [TreasuryKind.CASH]: '1111',
  [TreasuryKind.PETTY_CASH]: '1111',
  [TreasuryKind.MOBILE_BANKING]: '1114',
};

export function isCashLike(kind: TreasuryKind): boolean {
  return kind === TreasuryKind.CASH || kind === TreasuryKind.PETTY_CASH;
}

export function isBankLike(kind: TreasuryKind): boolean {
  return (
    kind === TreasuryKind.COMMERCIAL_BANK ||
    kind === TreasuryKind.MOBILE_BANKING
  );
}
