// Password strength, scored as in earlier versions: length, repetition, and the mix of
// letters, digits and symbols. Below 34 of 100, shorter than 12 characters, or easy to guess is weak
// and can't be used for a new wallet. Existing wallets open with whatever password they have.

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

// Words at the top of leaked-password lists, plus the ones people pick for a crypto wallet.
const COMMON_WORDS = new Set(`
  password passwords passwd passphrase mypassword secret admin administrator root welcome login
  letmein master dragon monkey shadow sunshine princess football baseball basketball soccer hockey
  superman batman trustno iloveyou loveyou iloveu qwerty qwertyuiop asdfgh asdfghjkl zxcvbn zxcvbnm
  abc abcd abcde abcdef abcdefg michael jordan jennifer charlie thomas robert daniel andrew joshua
  jessica ashley nicole hunter ranger buster tigger pepper ginger summer winter spring autumn flower
  freedom whatever computer internet google facebook microsoft windows samsung apple android mustang
  corvette ferrari killer cookie cheese chocolate banana orange purple yellow hello helloworld test
  testing testtest changeme default guest user username money lucky ripple xrp xrpl xrpwallet wallet
  mywallet bitcoin btc ethereum crypto cryptocurrency blockchain
`.trim().split(/\s+/));

const LEET: Record<string, string> = {0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's'};

/** The word left after removing leading and trailing digits and symbols and undoing l33t spelling. */
function baseWord(lower: string): string {
  return lower.replace(/[^a-z]+$/, '').replace(/^[^a-z@$]+/, '').replace(/[013457@$]/g, c => LEET[c]).replace(/[^a-z]/g, '');
}

const RUNS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p']
  .flatMap(run => [run, [...run].reverse().join('')]);

/** Length of the longest keyboard or alphabet run, or repeated character, starting at `start`. */
function runLength(text: string, start: number): number {
  let same = 1;
  while (text[start + same] === text[start]) same++;
  let best = same;
  for (const run of RUNS) {
    for (let at = run.indexOf(text[start]); at !== -1; at = run.indexOf(text[start], at + 1)) {
      let length = 1;
      while (start + length < text.length && run[at + length] === text[start + length]) length++;
      best = Math.max(best, length);
    }
  }
  return best;
}

/** True when the text is little more than keyboard runs, sequences and repeats. */
function isPattern(lower: string): boolean {
  if (/^(.{1,6})\1+$/.test(lower)) return true;
  const text = lower.replace(/[^a-z0-9]/g, '');
  if (text.length < lower.length / 2) return false;
  let leftover = 0;
  for (let i = 0; i < text.length;) {
    const length = runLength(text, i);
    if (length >= 3) {
      i += length;
    } else {
      leftover++;
      i++;
    }
  }
  return leftover <= 2;
}

/** True for common passwords and their usual variations (`Passw0rd!2024`, `qwerty1234`). */
export function isGuessable(password: string): boolean {
  const lower = password.toLowerCase();
  if (isPattern(lower)) return true;
  const base = baseWord(lower);
  if (COMMON_WORDS.has(base)) return true;
  const repeated = /^(.+)\1+$/.exec(base);
  return !!repeated && COMMON_WORDS.has(repeated[1]);
}

/** Minimum length for a new wallet password. A stolen wallet file can be attacked offline, so short
 *  passwords are never accepted, whatever characters they use. */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordStrength(password: string): Strength {
  if (!password) return '';
  if (password.length < MIN_PASSWORD_LENGTH || isGuessable(password)) return 'weak';
  const score = passwordScore(password);
  if (score < 34) return 'weak';
  return score < 68 ? 'medium' : 'strong';
}
