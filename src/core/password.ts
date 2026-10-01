// Password strength, scored as in earlier versions: length, repetition, and the mix of
// letters, digits and symbols. Below 34 of 100, or shorter than 10 characters, is weak and can't
// be used.

export type Strength = '' | 'weak' | 'medium' | 'strong';

const SYMBOL = /[!,@#$%&*?_~]/;

/** `str` with runs of a repeated `size`-character pattern collapsed. */
function withoutRepeats(size: number, str: string): string {
  let res = '';
  for (let i = 0; i < str.length; i++) {
    let repeated = true;
    let j = 0;
    for (; j < size && j + i + size < str.length; j++) {
      repeated = repeated && str.charAt(j + i) === str.charAt(j + i + size);
    }
    if (j < size) repeated = false;
    if (repeated) {
      i += size - 1;
    } else {
      res += str.charAt(i);
    }
  }
  return res;
}

export function passwordScore(password: string): number {
  let score = password.length * 4;
  for (const size of [1, 2, 3, 4]) score += withoutRepeats(size, password).length - password.length;
  if (/(.*[0-9].*[0-9].*[0-9])/.test(password)) score += 5;
  if (/(.*[!,@#$%&*?_~].*[!,@#$%&*?_~])/.test(password)) score += 5;
  if (/([a-z].*[A-Z])|([A-Z].*[a-z])/.test(password)) score += 10;
  if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) score += 15;
  if (SYMBOL.test(password) && /[0-9]/.test(password)) score += 15;
  if (SYMBOL.test(password) && /[a-zA-Z]/.test(password)) score += 15;
  if (/^\w+$/.test(password) || /^\d+$/.test(password)) score -= 10;
  return Math.min(100, Math.max(0, score));
}

/** Minimum length for a new wallet password. A stolen wallet file can be attacked offline, so short
 *  passwords are never accepted, whatever characters they use. */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordStrength(password: string): Strength {
  if (!password) return '';
  if (password.length < MIN_PASSWORD_LENGTH) return 'weak';
  const score = passwordScore(password);
  if (score < 34) return 'weak';
  return score < 68 ? 'medium' : 'strong';
}
