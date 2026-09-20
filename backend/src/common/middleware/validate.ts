import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { badRequest } from '../errors/app-error';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      for (const msg of Object.values(error.constraints)) {
        messages.push(`${path}: ${msg}`);
      }
    }
    if (error.children?.length) {
      messages.push(...flattenValidationErrors(error.children, path));
    }
  }
  return messages;
}

export function validateBody<T extends object>(dto: ClassConstructor<T>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const instance = plainToInstance(dto, req.body, {
        enableImplicitConversion: true,
        exposeDefaultValues: true,
      });
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false },
      });

      if (errors.length > 0) {
        const message = flattenValidationErrors(errors).join('; ');
        throw badRequest(message || 'Validation failed');
      }

      req.body = instance;
      next();
    } catch (error) {
      next(error);
    }
  };
}
