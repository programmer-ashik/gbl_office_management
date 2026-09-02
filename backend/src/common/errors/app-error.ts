export class AppError extends Error {
  readonly statusCode: number;
  readonly error: string;

  constructor(statusCode: number, message: string, error?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error ?? httpErrorName(statusCode);
  }
}

export function httpErrorName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    default:
      return 'Error';
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const unauthorized = (message: string) => new AppError(401, message);
export const forbidden = (message: string) => new AppError(403, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
