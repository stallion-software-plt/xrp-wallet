import {describe, expect, it, vi} from 'vitest';
import type {TransactionMetadata} from 'xrpl';
import {processTx} from './txformat';

// The formatter only needs the network's coin code from the app state (which needs a browser).
vi.mock('../state/app', () => ({useApp: {getState: () => ({network: {coin: {code: 'XRP'}}})}}));

const me = 'rHoZweu79nBqdRqEypfo8habvqkLH1Gj4s';
const bob = 'rfXeTRmpn9wxBfCCeg2zhHfzUh1RmwefMp';
const stranger = 'rJN8G95QtyZN9razhUuKYFZPGFfbiJ3G22';
const fakeMe = 'rHoZxxxxxxxxxxxxxxxxxxxxxxxxxxGj4s';
const ctx = {account: me, contacts: [{name: 'Bob', address: bob}], nativeCode: 'XRP'};

function payment(from: string, to: string, drops: string) {
  const tx = {TransactionType: 'Payment', Account: from, Destination: to, Amount: drops, Fee: '12', hash: 'AB', date: 800000000};
  const meta = {TransactionResult: 'tesSUCCESS', AffectedNodes: [], TransactionIndex: 0, delivered_amount: drops} as unknown as TransactionMetadata;
  return processTx(tx, meta, ctx);
}

describe('activity scam warnings', () => {
  it('flags a tiny payment from an unknown address', () => {
    expect(payment(stranger, me, '1').warning).toEqual({kind: 'dust'});
  });

  it('does not flag normal payments or payments from contacts', () => {
    expect(payment(stranger, me, '25000000').warning).toBeUndefined();
    expect(payment(bob, me, '1').warning).toBeUndefined();
    expect(payment(me, stranger, '1').warning).toBeUndefined();
  });

  it('flags a sender imitating the wallet address, whatever the amount', () => {
    expect(payment(fakeMe, me, '25000000').warning).toEqual({kind: 'lookalike', name: ''});
  });
});
