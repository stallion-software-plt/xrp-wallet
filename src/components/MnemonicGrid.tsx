/** A recovery phrase as numbered words. */
export function MnemonicGrid({phrase}: {phrase: string}) {
  return (
    <div className="mnemonic-grid">
      {phrase.split(' ').map((word, i) => <span key={i}><em>{i + 1}</em>{word}</span>)}
    </div>
  );
}
