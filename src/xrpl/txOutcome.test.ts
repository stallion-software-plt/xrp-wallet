import {describe, expect, it} from 'vitest';
import {lookupOutcome} from './txOutcome';

const notFound = (searched_all: boolean) => ({data: {error: 'txnNotFound', searched_all}});

describe('transaction outcome', () => {
  it('reports validated results', () => {
    expect(lookupOutcome({validated: true, meta: {TransactionResult: 'tesSUCCESS'}}, null, 110, 120)).toEqual({state: 'success'});
    expect(lookupOutcome({validated: true, meta: {TransactionResult: 'tecPATH_DRY'}}, null, 110, 120)).toEqual({state: 'failed', message: 'tecPATH_DRY'});
  });

  it('keeps waiting for a transaction that is not validated yet', () => {
    expect(lookupOutcome({validated: false}, null, 110, 120)).toEqual({state: 'pending'});
    expect(lookupOutcome(null, notFound(true), 120, 120)).toEqual({state: 'pending'});
  });

  it('never calls a transaction failed while the server may lack a ledger', () => {
    expect(lookupOutcome(null, notFound(false), 200, 120)).toEqual({state: 'pending'});
  });

  it('never calls a transaction failed on a connection error', () => {
    expect(lookupOutcome(null, new Error('Disconnected'), 0, 120)).toEqual({state: 'pending'});
    expect(lookupOutcome(null, new Error('Timeout'), 200, 120)).toEqual({state: 'pending'});
  });

  it('reports expiry only when every ledger up to the limit was searched', () => {
    expect(lookupOutcome(null, notFound(true), 121, 120)).toEqual({state: 'failed', message: 'tx_expired'});
  });
});
