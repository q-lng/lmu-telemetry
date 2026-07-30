import { hash, compare } from 'bcryptjs';

const BCRYPT_COST = 12;

// bcrypt silently truncates input beyond 72 bytes — callers must enforce a max
// password length at validation time (see auth.ts) so this isn't a silent footgun.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}
