import {describe, expect, it} from 'vitest';
import {escrowProblem} from './escrowGuard';

const now = new Date('2026-11-23T12:00:00').getTime();
const soon = '2026-11-24T12:00';
const later = '2026-11-25T12:00';
const past = '2026-11-22T12:00';
const condition = `A0258020${'AB'.repeat(32)}810120`;
const form = {finishAfter: '', cancelAfter: '', condition: ''};

describe('escrow check', () => {
  it('accepts a timed escrow, with or without an expiry', () => {
    expect(escrowProblem({...form, finishAfter: soon}, now)).toBeNull();
    expect(escrowProblem({...form, finishAfter: soon, cancelAfter: later}, now)).toBeNull();
  });

  it('accepts a conditional escrow that can expire', () => {
    expect(escrowProblem({...form, condition, cancelAfter: later}, now)).toBeNull();
    expect(escrowProblem({...form, condition: condition.toLowerCase(), finishAfter: soon, cancelAfter: later}, now)).toBeNull();
  });

  it('refuses a conditional escrow that could lock funds forever', () => {
    expect(escrowProblem({...form, condition}, now)).toBe('escrow_condition_needs_expiry');
    expect(escrowProblem({...form, condition, finishAfter: soon}, now)).toBe('escrow_condition_needs_expiry');
  });

  it('refuses a malformed condition', () => {
    expect(escrowProblem({...form, condition: 'A025', cancelAfter: later}, now)).toBe('escrow_condition_invalid');
    expect(escrowProblem({...form, condition: `${condition}00`, cancelAfter: later}, now)).toBe('escrow_condition_invalid');
  });

  it('refuses dates in the past or in the wrong order', () => {
    expect(escrowProblem({...form, finishAfter: past}, now)).toBe('escrow_date_past');
    expect(escrowProblem({...form, condition, cancelAfter: past}, now)).toBe('escrow_date_past');
    expect(escrowProblem({...form, finishAfter: later, cancelAfter: soon}, now)).toBe('escrow_expiry_before_release');
  });

  it('reports an empty form as unfinished', () => {
    expect(escrowProblem(form, now)).toBe('escrow_incomplete');
    expect(escrowProblem({...form, cancelAfter: later}, now)).toBe('escrow_incomplete');
  });
});
