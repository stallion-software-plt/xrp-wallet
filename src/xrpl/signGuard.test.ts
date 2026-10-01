import {describe, expect, it} from 'vitest';
import {checkFee, checkPrepared, feeLimitDrops, MAX_RESERVE_FEE_DROPS} from './signGuard';

const limits = {maxFeeXRP: '0.2', reserveIncXRP: 0.2};

describe('fee guard', () => {
  it('accepts normal fees up to the user limit', () => {
    expect(() => checkFee({TransactionType: 'Payment', Fee: '12'}, limits)).not.toThrow();
    expect(() => checkFee({TransactionType: 'Payment', Fee: '200000'}, limits)).not.toThrow();
  });

  it('rejects a normal fee above the user limit', () => {
    expect(() => checkFee({TransactionType: 'Payment', Fee: '200001'}, limits)).toThrow('not signed');
  });

  it('limits reserve-burning transactions to the known reserve increment', () => {
    expect(() => checkFee({TransactionType: 'AccountDelete', Fee: '200000'}, limits)).not.toThrow();
    expect(() => checkFee({TransactionType: 'AccountDelete', Fee: '99000000'}, limits)).toThrow('not signed');
    expect(() => checkFee({TransactionType: 'AMMCreate', Fee: '200001'}, limits)).toThrow('not signed');
  });

  it('never allows more than 5 XRP for a reserve-burning transaction', () => {
    expect(feeLimitDrops('AccountDelete', {maxFeeXRP: '0.2', reserveIncXRP: 0})).toBe(MAX_RESERVE_FEE_DROPS);
    expect(feeLimitDrops('AccountDelete', {maxFeeXRP: '0.2', reserveIncXRP: 50})).toBe(MAX_RESERVE_FEE_DROPS);
  });

  it('rejects missing or malformed fees', () => {
    for (const Fee of [undefined, '', '-1', '1.5', '1e9', 'abc']) {
      expect(() => checkFee({TransactionType: 'Payment', Fee}, limits)).toThrow('invalid');
    }
  });
});

describe('prepared transaction check', () => {
  const original = {
    TransactionType: 'Payment',
    Account: 'rHoZweu79nBqdRqEypfo8habvqkLH1Gj4s',
    Destination: 'rfXeTRmpn9wxBfCCeg2zhHfzUh1RmwefMp',
    Amount: '12500000',
    DestinationTag: 8,
    Memos: [{Memo: {MemoData: '68656C6C6F'}}]
  };
  const filled = {Fee: '12', Sequence: 21169000, LastLedgerSequence: 1020, Flags: 0, NetworkID: undefined};

  it('accepts the transaction plus the autofilled fields', () => {
    expect(() => checkPrepared(original, {...original, ...filled}, 1000)).not.toThrow();
  });

  it('rejects any other change', () => {
    const cases: Array<Record<string, unknown>> = [
      {Destination: 'rJN8G95QtyZN9razhUuKYFZPGFfbiJ3G22'},
      {Amount: '99999999'},
      {DestinationTag: 9},
      {SendMax: '1000000'},
      {Memos: [{Memo: {MemoData: '6576696C'}}]},
      {Paths: [[{currency: 'USD'}]]}
    ];
    for (const change of cases) {
      expect(() => checkPrepared(original, {...original, ...filled, ...change}, 1000)).toThrow('not signed');
    }
  });

  it('rejects changed flags and a removed field', () => {
    expect(() => checkPrepared({...original, Flags: 131072}, {...original, ...filled, Flags: 0}, 1000)).toThrow('Flags');
    const {DestinationTag: _removed, ...withoutTag} = original;
    expect(() => checkPrepared(original, {...withoutTag, ...filled}, 1000)).toThrow('DestinationTag');
  });

  it('rejects a fee or sequence the app set itself being changed', () => {
    expect(() => checkPrepared({...original, Sequence: 5}, {...original, ...filled}, 1000)).toThrow('Sequence');
  });

  it('rejects an expiry ledger far in the future or in the past', () => {
    expect(() => checkPrepared(original, {...original, ...filled, LastLedgerSequence: 1051}, 1000)).toThrow('ledger number');
    expect(() => checkPrepared(original, {...original, ...filled, LastLedgerSequence: 999}, 1000)).toThrow('ledger number');
    expect(() => checkPrepared(original, {...original, ...filled, LastLedgerSequence: undefined}, 1000)).toThrow('ledger number');
  });
});
