import type { NextFunction, Request, Response } from 'express';
import { Role } from '../enums/role.enum';
import { forbidden } from '../errors/app-error';

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (roles.length === 0) {
        next();
        return;
      }

      if (!req.user) {
        throw forbidden('Authentication is required');
      }

      if (!roles.includes(req.user.role)) {
        throw forbidden('You do not have permission to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function canActivateRole(
  requiredRoles: Role[] | undefined,
  userRole?: Role,
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }
  if (!userRole) {
    throw forbidden('Authentication is required');
  }
  if (!requiredRoles.includes(userRole)) {
    throw forbidden('You do not have permission to perform this action');
  }
  return true;
}
