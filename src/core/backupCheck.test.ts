import {describe, expect, it} from 'vitest';
import {isBackupWord, pickWordPositions} from './backupCheck';

describe('recovery phrase check', () => {
  it('picks different positions in order', () => {
    for (let run = 0; run < 50; run++) {
      const positions = pickWordPositions(12);
      expect(positions).toHaveLength(3);
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(positions.every(p => p >= 0 && p < 12)).toBe(true);
    }
  });

  it('never asks for more words than the phrase has', () => {
    expect(pickWordPositions(2)).toHaveLength(2);
    expect(pickWordPositions(0)).toEqual([]);
  });

  it('accepts the right word regardless of case and spaces', () => {
    expect(isBackupWord(['alpha bravo charlie'], 1, 'bravo')).toBe(true);
    expect(isBackupWord(['alpha bravo charlie'], 1, '  BRAVO ')).toBe(true);
  });

  it('rejects a wrong word, a word from another position and an empty answer', () => {
    expect(isBackupWord(['alpha bravo charlie'], 1, 'delta')).toBe(false);
    expect(isBackupWord(['alpha bravo charlie'], 1, 'alpha')).toBe(false);
    expect(isBackupWord(['alpha bravo charlie'], 1, '')).toBe(false);
    expect(isBackupWord(['alpha bravo charlie'], 9, 'alpha')).toBe(false);
  });

  it('accepts the translated phrase, including ideographic spaces', () => {
    const phrases = ['alpha bravo', 'あいこくしん　あいさつ'];
    expect(isBackupWord(phrases, 1, 'bravo')).toBe(true);
    expect(isBackupWord(phrases, 1, 'あいさつ')).toBe(true);
  });
});
