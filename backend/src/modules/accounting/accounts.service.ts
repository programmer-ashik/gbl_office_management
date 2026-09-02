import type { ClientSession } from 'mongoose';
import {
  AccountType,
  normalBalanceOf,
} from '../../common/enums/account-type.enum';
import { badRequest, conflict, notFound } from '../../common/errors/app-error';
import { AccountModel, type AccountDocument } from './account.model';
import { DEFAULT_CHART_OF_ACCOUNTS } from './coa.seed';
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

  async seedDefaults(): Promise<void> {
    const count = await AccountModel.countDocuments().exec();
    if (count > 0) {
      return;
    }

    await AccountModel.insertMany(
      DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
        ...account,
        normalBalance: normalBalanceOf(account.type),
        isSystem: true,
        isPostable: true,
        isActive: true,
      })),
    );
    console.log(
      `Seeded ${DEFAULT_CHART_OF_ACCOUNTS.length} chart of accounts records`,
    );
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
}
