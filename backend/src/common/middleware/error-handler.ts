import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path}`,
    error: 'Not Found',
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const { status, message, error } = normalizeError(err);

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    message,
    error,
    statusCode: status,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

export function normalizeError(exception: unknown): {
  status: number;
  message: string;
  error: string;
} {
  if (exception instanceof AppError) {
    return {
      status: exception.statusCode,
      message: exception.message,
      error: exception.error,
    };
  }

  if (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as { code: unknown }).code === 11000
  ) {
    return {
      status: 409,
      message: 'A record with this value already exists',
      error: 'Conflict',
    };
  }

  if (exception instanceof Error && exception.name === 'JsonWebTokenError') {
    return {
      status: 401,
      message: 'Invalid access token',
      error: 'Unauthorized',
    };
  }

  if (exception instanceof Error && exception.name === 'TokenExpiredError') {
    return {
      status: 401,
      message: 'Access token has expired',
      error: 'Unauthorized',
    };
  }

  return {
    status: 500,
    message: 'An unexpected error occurred',
    error: 'Internal Server Error',
  };
}
