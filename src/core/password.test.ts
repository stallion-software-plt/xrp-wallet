import {describe, expect, it} from 'vitest';
import {passwordStrength} from './password';

describe('wallet password policy', () => {
  it('rejects short and common passwords', () => {
    for (const p of ['abc123', 'password1', 'qwerty12', 'letmein1', 'monkey12', 'Passw0rd!']) {
      expect(passwordStrength(p)).toBe('weak');
    }
  });

  it('accepts long mixed passwords', () => {
    expect(passwordStrength('Correct-Horse-42!')).toBe('strong');
    expect(['medium', 'strong']).toContain(passwordStrength('blue-river-7731'));
  });
});
