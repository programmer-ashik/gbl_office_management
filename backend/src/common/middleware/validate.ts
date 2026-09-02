import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../errors/app-error';

export function validateBody<T extends object>(dto: ClassConstructor<T>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const instance = plainToInstance(dto, req.body, {
        enableImplicitConversion: true,
      });
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      if (errors.length > 0) {
        const message = errors
          .flatMap((error) => Object.values(error.constraints ?? {}))
          .join(', ');
        throw badRequest(message || 'Validation failed');
      }

      req.body = instance;
      next();
    } catch (error) {
      next(error);
    }
  };
}
