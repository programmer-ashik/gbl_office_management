import { AccountType, normalBalanceOf } from '../../common/enums/account-type.enum';
import { AccountModel } from './account.model';
import { SystemAccountCode } from './system-account-codes';

type PdcAccountSpec = {
  code: string;
  name: string;
  type: AccountType;
  parentCode: string;
  description: string;
};

export const PDC_ACCOUNT_SPECS: PdcAccountSpec[] = [
  {
    code: SystemAccountCode.PDC_RECEIVABLE,
    name: 'PDC Receivable',
    type: AccountType.ASSET,
    parentCode: '1150',
    description:
      'Post-dated cheques received from customers, held until the cheque date clears into the bank.',
  },
  {
    code: SystemAccountCode.PDC_PAYABLE,
    name: 'PDC Payable',
    type: AccountType.LIABILITY,
    parentCode: '2110',
    description:
      'Post-dated cheques issued to suppliers, held until the cheque is presented at the bank.',
  },
];

export type EnsurePdcAccountsResult = {
  created: string[];
  existing: string[];
  conflicts: string[];
};

/**
 * Idempotent: creates PDC Receivable (1152) and PDC Payable (2112) when missing.
 * Never renames, retypes or deletes an existing account. A code already used
 * by a different kind of account is reported as a conflict instead.
 */
export async function ensurePdcAccounts(): Promise<EnsurePdcAccountsResult> {
  const result: EnsurePdcAccountsResult = { created: [], existing: [], conflicts: [] };

  for (const spec of PDC_ACCOUNT_SPECS) {
    const existing = await AccountModel.findOne({ code: spec.code }).exec();
    if (!existing) {
      const parent = await AccountModel.findOne({ code: spec.parentCode })
        .select('_id')
        .lean()
        .exec();
      await AccountModel.create({
        code: spec.code,
        name: spec.name,
        type: spec.type,
        normalBalance: normalBalanceOf(spec.type),
        parentCode: parent ? spec.parentCode : undefined,
        description: spec.description,
        isSystem: true,
        isPostable: true,
        isActive: true,
      });
      result.created.push(spec.code);
      continue;
    }

    if (existing.type !== spec.type || !existing.isPostable) {
      result.conflicts.push(
        `${spec.code} is "${existing.name}" (${existing.type}${existing.isPostable ? '' : ', header'}) — expected a postable ${spec.type} for ${spec.name}`,
      );
      continue;
    }

    if (!existing.isActive) {
      existing.isActive = true;
      await existing.save();
    }
    result.existing.push(spec.code);
  }

  return result;
}

/** Throws when a PDC clearing account cannot be used for posting. */
export async function assertPdcAccountsReady(): Promise<void> {
  const result = await ensurePdcAccounts();
  if (result.conflicts.length > 0) {
    throw new Error(
      `PDC clearing accounts are not usable: ${result.conflicts.join('; ')}`,
    );
  }
}
