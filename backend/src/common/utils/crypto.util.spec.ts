import {
  comparePassword,
  generateRefreshToken,
  hashPassword,
  hashToken,
} from './crypto.util';

describe('crypto.util', () => {
  it('hashes and verifies passwords', async () => {
    const hashed = await hashPassword('Admin123!');
    expect(hashed).not.toBe('Admin123!');
    await expect(comparePassword('Admin123!', hashed)).resolves.toBe(true);
    await expect(comparePassword('wrong', hashed)).resolves.toBe(false);
  });

  it('hashes refresh tokens deterministically', () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(96);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });
});
