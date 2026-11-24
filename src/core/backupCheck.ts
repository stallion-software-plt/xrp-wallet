// Checks that a new recovery phrase was written down, by asking for a few of its words.

/** `count` different word positions out of `total`, in order. */
export function pickWordPositions(total: number, count = 3, random: () => number = Math.random): number[] {
  const positions = Array.from({length: total}, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, Math.min(count, total)).sort((a, b) => a - b);
}

function normalize(word: string): string {
  return word.trim().normalize('NFKC').toLowerCase();
}

/** True when `answer` is the word at `position` in any of the phrase's languages. */
export function isBackupWord(phrases: string[], position: number, answer: string): boolean {
  const value = normalize(answer);
  return !!value && phrases.some(phrase => normalize(phrase.trim().split(/\s+/)[position] ?? '') === value);
}
