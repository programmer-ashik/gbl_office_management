import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../errors/app-error';
import type { AuthService } from '../../modules/auth/auth.service';
import { UsersService } from '../../modules/users/users.service';

export function requireAuth(authService: AuthService, usersService: UsersService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw unauthorized('Authentication is required');
      }

      const token = header.slice('Bearer '.length).trim();
      const payload = authService.verifyAccessToken(token);
      const user = await usersService.findById(payload.sub);

      if (!user || !user.isActive) {
        throw unauthorized('Account is inactive or does not exist');
      }

      req.user = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
