import { AppError } from './app-error';
import { normalizeError } from '../middleware/error-handler';

describe('normalizeError', () => {
  it('serializes AppError into the unified error envelope', () => {
    expect(normalizeError(new AppError(401, 'Invalid email or password'))).toEqual(
      {
        status: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
      },
    );
  });

  it('maps duplicate-key errors to HTTP 409', () => {
    expect(normalizeError({ code: 11000 })).toEqual({
      status: 409,
      message: 'A record with this value already exists',
      error: 'Conflict',
    });
  });
});
