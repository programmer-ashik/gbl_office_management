import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { getConfig } from '../../config';
import { Role } from '../../common/enums/role.enum';
import {
  conflict,
  unauthorized,
} from '../../common/errors/app-error';
import type {
  AuthenticatedUser,
  JwtPayload,
  RequestMeta,
} from '../../common/interfaces/authenticated-user.interface';
import {
  comparePassword,
  generateRefreshToken,
  hashPassword,
  hashToken,
  refreshTokenExpiryDate,
} from '../../common/utils/crypto.util';
import { withTransaction } from '../../database/connection';
import { UsersService, type PublicUser } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import { RefreshTokenModel } from './refresh-token.model';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async bootstrapAdmin(): Promise<void> {
    const { email, password } = getConfig().bootstrapAdmin;
    if (!email || !password) {
      return;
    }

    const count = await this.usersService.count();
    if (count > 0) {
      return;
    }

    const hashed = await hashPassword(password);
    await this.usersService.create({
      email,
      password: hashed,
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
    });
    console.log(`Bootstrap administrator created (${email})`);
  }

  async signup(dto: SignupDto, meta: RequestMeta): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw conflict('Email is already registered');
    }

    const isFirstUser = (await this.usersService.count()) === 0;
    const password = await hashPassword(dto.password);

    const user = await withTransaction(async (session) => {
      return this.usersService.create(
        {
          email: dto.email,
          password,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: isFirstUser ? Role.ADMIN : Role.EMPLOYEE,
        },
        session,
      );
    });

    return this.issueAuth(user._id.toString(), meta);
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) {
      throw unauthorized('Invalid email or password');
    }

    const passwordOk = await comparePassword(dto.password, user.password);
    if (!passwordOk) {
      throw unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      throw unauthorized('Account is deactivated');
    }

    await this.usersService.touchLastLogin(user._id.toString());
    return this.issueAuth(user._id.toString(), meta);
  }

  async refresh(
    rawToken: string | undefined,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    if (!rawToken) {
      throw unauthorized('Refresh token is required');
    }

    const tokenHash = hashToken(rawToken);
    const stored = await RefreshTokenModel.findOne({ tokenHash }).exec();

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw unauthorized('Refresh token is invalid or expired');
    }

    stored.revokedAt = new Date();
    const nextRaw = generateRefreshToken();
    stored.replacedByTokenHash = hashToken(nextRaw);
    await stored.save();

    return this.issueAuth(stored.userId.toString(), meta, nextRaw);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const tokenHash = hashToken(rawToken);
    await RefreshTokenModel.updateOne(
      { tokenHash, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  async logoutAll(userId: string): Promise<void> {
    await RefreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  async me(actor: AuthenticatedUser): Promise<PublicUser> {
    const user = await this.usersService.findByIdOrFail(actor.userId);
    return this.usersService.toPublicUser(user);
  }

  verifyAccessToken(token: string): JwtPayload {
    const payload = jwt.verify(token, getConfig().jwt.accessSecret);
    return payload as JwtPayload;
  }

  private async issueAuth(
    userId: string,
    meta: RequestMeta,
    presetRefreshToken?: string,
  ): Promise<AuthResult> {
    const user = await this.usersService.findByIdOrFail(userId);
    const config = getConfig();
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = presetRefreshToken ?? generateRefreshToken();
    await RefreshTokenModel.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return {
      user: this.usersService.toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.accessExpiresIn,
      },
    };
  }
}
