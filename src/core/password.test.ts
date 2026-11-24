import {describe, expect, it} from 'vitest';
import {isGuessable, MIN_PASSWORD_LENGTH, passwordStrength} from './password';

describe('wallet password policy', () => {
  it('rejects short and common passwords', () => {
    for (const p of ['abc123', 'password1', 'qwerty12', 'letmein1', 'monkey12', 'Passw0rd!']) {
      expect(passwordStrength(p)).toBe('weak');
    }
  });

  it('requires the minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(passwordStrength('Vt7#kQ2!xLp')).toBe('weak');
    expect(passwordStrength('Vt7#kQ2!xLpz')).not.toBe('weak');
  });

  it('rejects common passwords of any length, with the usual variations', () => {
    for (const p of [
      '1234567890', '123456789012', '098765432109', 'password1234', 'password12345', 'Passw0rd!2024', 'P@ssw0rd12345',
      'qwerty123456', 'qwertyuiop12', 'iloveyou1234', 'letmein12345', 'welcome12345', 'Bitcoin2026!!', 'XRPwallet2026',
      'passwordpassword', 'aaaaaaaaaaaa', '111111111111', 'abcabcabcabc', '123123123123', 'abcdefghijkl', '1qaz2wsx3edc'
    ]) {
      expect({p, guessable: isGuessable(p), strength: passwordStrength(p)}).toEqual({p, guessable: true, strength: 'weak'});
    }
  });

  it('accepts long mixed passwords', () => {
    expect(passwordStrength('Correct-Horse-42!')).toBe('strong');
    expect(['medium', 'strong']).toContain(passwordStrength('blue-river-7731'));
    expect(['medium', 'strong']).toContain(passwordStrength('tiger lamp ocean 58'));
  });

  it('does not treat random symbols as a pattern', () => {
    expect(isGuessable('%#!@&*$?~_,!')).toBe(false);
  });
});
