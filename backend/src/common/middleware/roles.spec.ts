import { Role } from '../enums/role.enum';
import { AppError } from '../errors/app-error';
import { canActivateRole } from './roles';

describe('canActivateRole', () => {
  it('allows access when no roles are required', () => {
    expect(canActivateRole(undefined, Role.EMPLOYEE)).toBe(true);
  });

  it('allows an admin to access admin-only routes', () => {
    expect(canActivateRole([Role.ADMIN], Role.ADMIN)).toBe(true);
  });

  it('blocks an employee from admin-only routes', () => {
    expect(() => canActivateRole([Role.ADMIN], Role.EMPLOYEE)).toThrow(AppError);
  });
});
