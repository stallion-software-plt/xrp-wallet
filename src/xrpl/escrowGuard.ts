// A conditional escrow with no expiry can never be cancelled: if the fulfillment is lost, the XRP is
// locked forever. The ledger allows it, so the wallet has to refuse it.

export interface EscrowTimes {
  finishAfter: string;
  cancelAfter: string;
  condition: string;
}

// PREIMAGE-SHA-256: a 32-byte fingerprint and the preimage length (1 or 2 bytes).
const CONDITION = /^A0[0-9A-F]{2}8020[0-9A-F]{64}81(01[0-9A-F]{2}|02[0-9A-F]{4})$/i;

/** An i18n key describing the problem, 'escrow_incomplete' while unfinished, or null when valid. */
export function escrowProblem(form: EscrowTimes, now: number): string | null {
  const condition = form.condition.trim();
  const finish = form.finishAfter ? new Date(form.finishAfter).getTime() : null;
  const cancel = form.cancelAfter ? new Date(form.cancelAfter).getTime() : null;
  if (condition && !CONDITION.test(condition)) return 'escrow_condition_invalid';
  if (condition && cancel === null) return 'escrow_condition_needs_expiry';
  if (finish === null && !condition) return 'escrow_incomplete';
  if ((finish !== null && !(finish > now)) || (cancel !== null && !(cancel > now))) return 'escrow_date_past';
  if (finish !== null && cancel !== null && cancel <= finish) return 'escrow_expiry_before_release';
  return null;
}
