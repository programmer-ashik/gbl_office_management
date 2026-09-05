import type { ClientSession } from 'mongoose';
import {
  AccountType,
  normalBalanceOf,
} from '../../common/enums/account-type.enum';
import { badRequest, conflict, notFound } from '../../common/errors/app-error';
import { TreasuryAccountModel } from '../banking/treasury-account.model';
import { AccountModel, type AccountDocument } from './account.model';
import {
  loadChartOfAccountsJson,
  normalizeChartOfAccounts,
  resolveChartOfAccountsPath,
} from './coa-from-json';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { LedgerLineModel } from './ledger.model';

export type PublicAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: 'debit' | 'credit';
  parentCode: string | null;
  description: string | null;
  isSystem: boolean;
  isPostable: boolean;
  isActive: boolean;
};

export type CoaSeedResult = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  path: string;
};

export class AccountsService {
  toPublic(account: AccountDocument): PublicAccount {
    return {
      id: account._id.toString(),
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      parentCode: account.parentCode ?? null,
      description: account.description ?? null,
      isSystem: account.isSystem,
      isPostable: account.isPostable,
      isActive: account.isActive,
    };
  }

  /**
   * App bootstrap: ensure CoA from chart_of_accounts.json is present.
   * Create-only for missing codes — never overwrites existing accounts
   * (preserves historical GL / treasury links).
   */
  async seedDefaults(): Promise<void> {
    try {
      const result = await this.seedFromChartOfAccountsJson({ forceUpdate: false });
      console.log(
        `Chart of Accounts: created=${result.created}, updated=${result.updated}, skipped=${result.skipped} (${result.path})`,
      );
    } catch (err) {
      console.warn(
        'Chart of Accounts JSON seed skipped:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  /**
   * Idempotent seed from chart_of_accounts.json (parents before children).
   * - Missing codes are inserted.
   * - forceUpdate=false: existing codes are left untouched (no duplicates).
   * - forceUpdate=true: sync name/parent/type/postable when safe
   *   (no ledger activity and not a treasury GL code).
   */
  async seedFromChartOfAccountsJson(
    options: { filePath?: string; forceUpdate?: boolean } = {},
  ): Promise<CoaSeedResult> {
    const path = options.filePath ?? resolveChartOfAccountsPath();
    const forceUpdate = options.forceUpdate === true;
    const normalized = normalizeChartOfAccounts(loadChartOfAccountsJson(path));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of normalized) {
      const existing = await AccountModel.findOne({ code: row.code }).exec();
      if (!existing) {
        await AccountModel.create(row);
        created += 1;
        continue;
      }

      if (!forceUpdate) {
        skipped += 1;
        continue;
      }

      const [hasLedger, treasuryLinked] = await Promise.all([
        LedgerLineModel.exists({ accountId: existing._id }),
        TreasuryAccountModel.exists({ glAccountCode: existing.code }),
      ]);

      if (hasLedger || treasuryLinked) {
        skipped += 1;
        continue;
      }

      let dirty = false;
      if (existing.name !== row.name) {
        existing.name = row.name;
        dirty = true;
      }
      if (existing.type !== row.type) {
        existing.type = row.type;
        dirty = true;
      }
      if (existing.normalBalance !== row.normalBalance) {
        existing.normalBalance = row.normalBalance;
        dirty = true;
      }
      const nextParent = row.parentCode ?? undefined;
      if ((existing.parentCode ?? undefined) !== nextParent) {
        existing.parentCode = nextParent;
        dirty = true;
      }
      if (existing.isPostable !== row.isPostable) {
        existing.isPostable = row.isPostable;
        dirty = true;
      }
      if (!existing.isSystem) {
        existing.isSystem = true;
        dirty = true;
      }
      if (row.description && existing.description !== row.description) {
        existing.description = row.description;
        dirty = true;
      }

      if (dirty) {
        await existing.save();
        updated += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      created,
      updated,
      skipped,
      total: normalized.length,
      path,
    };
  }

  async create(dto: CreateAccountDto): Promise<PublicAccount> {
    const existing = await AccountModel.findOne({ code: dto.code }).exec();
    if (existing) {
      throw conflict(`Account code ${dto.code} already exists`);
    }

    if (dto.parentCode) {
      const parent = await this.findByCodeOrFail(dto.parentCode);
      if (parent.type !== dto.type) {
        throw badRequest('Parent account must be the same type');
      }
    }

    const account = await AccountModel.create({
      code: dto.code,
      name: dto.name.trim(),
      type: dto.type,
      normalBalance: normalBalanceOf(dto.type),
      parentCode: dto.parentCode,
      description: dto.description?.trim(),
      isSystem: false,
      isPostable: dto.isPostable ?? true,
      isActive: true,
    });

    return this.toPublic(account);
  }

  async list(type?: AccountType): Promise<PublicAccount[]> {
    const filter = type ? { type } : {};
    const accounts = await AccountModel.find(filter).sort({ code: 1 }).exec();
    return accounts.map((account) => this.toPublic(account));
  }

  async findByIdOrFail(id: string): Promise<AccountDocument> {
    const account = await AccountModel.findById(id).exec();
    if (!account) {
      throw notFound('Account not found');
    }
    return account;
  }

  async findByCodeOrFail(code: string): Promise<AccountDocument> {
    const account = await AccountModel.findOne({
      code: code.trim().toUpperCase(),
    }).exec();
    if (!account) {
      throw notFound(`Account ${code} not found`);
    }
    return account;
  }

  async findPostableByCodes(
    codes: string[],
    session?: ClientSession,
  ): Promise<AccountDocument[]> {
    const normalized = [...new Set(codes.map((code) => code.trim().toUpperCase()))];
    const accounts = await AccountModel.find({ code: { $in: normalized } })
      .session(session ?? null)
      .exec();

    const byCode = new Map(accounts.map((account) => [account.code, account]));
    for (const code of normalized) {
      const account = byCode.get(code);
      if (!account) {
        throw notFound(`Account ${code} not found`);
      }
      if (!account.isActive) {
        throw badRequest(`Account ${code} is inactive`);
      }
      if (!account.isPostable) {
        throw badRequest(`Account ${code} is not postable`);
      }
    }

    return accounts;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<PublicAccount> {
    const account = await this.findByIdOrFail(id);

    if (dto.isActive === false && account.isSystem) {
      const posted = await LedgerLineModel.exists({ accountId: account._id });
      if (posted) {
        throw badRequest('Cannot deactivate a system account with ledger activity');
      }
    }

    if (dto.name) account.name = dto.name.trim();
    if (dto.description !== undefined) account.description = dto.description.trim();
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    if (dto.isPostable !== undefined) account.isPostable = dto.isPostable;
    await account.save();
    return this.toPublic(account);
  }

  async remove(id: string): Promise<{ id: string; code: string }> {
    const account = await this.findByIdOrFail(id);
    if (account.isSystem) {
      throw badRequest('Cannot delete a system account');
    }
    const children = await AccountModel.exists({ parentCode: account.code });
    if (children) {
      throw badRequest('Cannot delete an account that has child accounts');
    }
    const posted = await LedgerLineModel.exists({ accountId: account._id });
    if (posted) {
      throw badRequest('Cannot delete an account with ledger activity');
    }
    await account.deleteOne();
    return { id: account._id.toString(), code: account.code };
  }
}
