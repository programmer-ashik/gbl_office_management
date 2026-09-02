import { Router } from 'express';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from '../../common/constants/auth.constants';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { validateBody } from '../../common/middleware/validate';
import { getConfig } from '../../config';
import type { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import type { UsersService } from '../users/users.service';
import type { CookieOptions, Request, Response } from 'express';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: getConfig().nodeEnv === 'production',
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

function readRefreshToken(req: Request, body?: RefreshTokenDto): string | undefined {
  return body?.refreshToken ?? req.cookies?.[REFRESH_COOKIE_NAME];
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions());
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

function meta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

export function createAuthRouter(
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();

  router.post(
    '/signup',
    validateBody(SignupDto),
    asyncHandler(async (req, res) => {
      const result = await authService.signup(req.body, meta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      sendSuccess(res, result, 'Account created successfully', 201);
    }),
  );

  router.post(
    '/login',
    validateBody(LoginDto),
    asyncHandler(async (req, res) => {
      const result = await authService.login(req.body, meta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      sendSuccess(res, result, 'Login successful', 201);
    }),
  );

  router.post(
    '/refresh',
    validateBody(RefreshTokenDto),
    asyncHandler(async (req, res) => {
      const rawToken = readRefreshToken(req, req.body);
      const result = await authService.refresh(rawToken, meta(req));
      setRefreshCookie(res, result.tokens.refreshToken);
      sendSuccess(res, result, 'Token refreshed successfully', 201);
    }),
  );

  router.post(
    '/logout',
    validateBody(RefreshTokenDto),
    asyncHandler(async (req, res) => {
      const rawToken = readRefreshToken(req, req.body);
      await authService.logout(rawToken);
      clearRefreshCookie(res);
      sendSuccess(res, { loggedOut: true }, 'Logged out successfully', 201);
    }),
  );

  router.post(
    '/logout-all',
    requireAuth(authService, usersService),
    asyncHandler(async (req, res) => {
      await authService.logoutAll(req.user!.userId);
      clearRefreshCookie(res);
      sendSuccess(res, { loggedOut: true }, 'All sessions revoked successfully', 201);
    }),
  );

  router.get(
    '/me',
    requireAuth(authService, usersService),
    asyncHandler(async (req, res) => {
      const user = await authService.me(req.user!);
      sendSuccess(res, user, 'Current session retrieved successfully');
    }),
  );

  return router;
}
