/** Receivable parties owe us; payable parties are owed by us. */
export type OtherPartyKind = 'receivable' | 'payable'

export type OtherParty = {
  id: string
  name: string
  kind: OtherPartyKind
  phone: string | null
  note: string | null
  isActive: boolean
  /** Posted balance on its natural side. */
  balance: number
}

/** Debit-normal accounts hold receivable parties; credit-normal hold payable ones. */
export function otherPartyKindFor(normalBalance: 'debit' | 'credit'): OtherPartyKind {
  return normalBalance === 'debit' ? 'receivable' : 'payable'
}
