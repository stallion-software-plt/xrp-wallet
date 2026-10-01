// Order book for a pair: asks (offers selling the base) and bids (offers buying it). A book between
// two tokens also includes offers auto-bridged through XRP.
import {parseAmount} from './amounts';
import {getClient} from './connection';

export interface BookOrder {
  account: string;
  gets_currency?: string;
  pays_currency?: string;
  gets_value: number;
  pays_value: number;
  /** Base asset amount. */
  amount: number;
  /** Counter asset amount. */
  volume: number;
  price: number;
}

export interface Book {
  asks: BookOrder[];
  bids: BookOrder[];
}

type LedgerAsset = {currency: string; issuer?: string};

async function directBook(asset1: LedgerAsset, asset2: LedgerAsset): Promise<Book> {
  const book: Book = {asks: [], bids: []};
  try {
    const client = await getClient();
    const toOrder = (offer: Record<string, any>) => {
      const gets = parseAmount(offer.taker_gets_funded ?? offer.TakerGets)!;
      const pays = parseAmount(offer.taker_pays_funded ?? offer.TakerPays)!;
      return {account: offer.Account, gets_currency: gets.currency, gets_value: parseFloat(gets.value), pays_currency: pays.currency, pays_value: parseFloat(pays.value)};
    };
    const asks = await client.request({command: 'book_offers', taker_gets: asset1, taker_pays: asset2, limit: 40} as never);
    for (const offer of (asks as {result: {offers: any[]}}).result.offers) {
      const o = toOrder(offer);
      book.asks.push({...o, amount: o.gets_value, volume: o.pays_value, price: o.pays_value / o.gets_value});
    }
    const bids = await client.request({command: 'book_offers', taker_gets: asset2, taker_pays: asset1, limit: 40} as never);
    for (const offer of (bids as {result: {offers: any[]}}).result.offers) {
      const o = toOrder(offer);
      book.bids.push({...o, amount: o.pays_value, volume: o.gets_value, price: o.gets_value / o.pays_value});
    }
  } catch (err) {
    console.error(`${asset1.currency}/${asset2.currency} book`, err);
  }
  return book;
}

/** Asks for A/B built from A/XRP asks and XRP/B asks. */
function bridgeAsks(asks1: BookOrder[], asks2: BookOrder[]): BookOrder[] {
  const data: BookOrder[] = [];
  const a1 = asks1.map(o => ({...o}));
  const a2 = asks2.map(o => ({...o}));
  let p1 = 0, p2 = 0;
  while (p1 < a1.length && p2 < a2.length && data.length < 30) {
    const ask1 = a1[p1], ask2 = a2[p2];
    if (ask1.pays_value < 0.001) { p1++; continue; }
    if (ask2.gets_value < 0.001) { p2++; continue; }
    const order = {account: 'AUTOBRIDGED', gets_currency: ask1.gets_currency, pays_currency: ask2.pays_currency} as BookOrder;
    if (ask1.pays_value >= ask2.gets_value) {
      order.pays_value = ask2.pays_value;
      order.gets_value = ask2.gets_value / ask1.price;
      p2++;
      ask1.pays_value -= ask2.gets_value;
      ask1.gets_value = ask1.pays_value / ask1.price;
    } else {
      order.pays_value = ask1.pays_value * ask2.price;
      order.gets_value = ask1.gets_value;
      p1++;
      ask2.gets_value -= ask1.pays_value;
      ask2.pays_value = ask2.gets_value * ask2.price;
    }
    order.amount = order.gets_value;
    order.volume = order.pays_value;
    order.price = order.volume / order.amount;
    data.push(order);
  }
  return data;
}

/** Bids for A/B built from A/XRP bids and XRP/B bids. */
function bridgeBids(bids1: BookOrder[], bids2: BookOrder[]): BookOrder[] {
  const data: BookOrder[] = [];
  const b1 = bids1.map(o => ({...o}));
  const b2 = bids2.map(o => ({...o}));
  let p1 = 0, p2 = 0;
  while (p1 < b1.length && p2 < b2.length && data.length < 30) {
    const bid1 = b1[p1], bid2 = b2[p2];
    if (bid1.gets_value < 0.001) { p1++; continue; }
    if (bid2.pays_value < 0.001) { p2++; continue; }
    const order = {account: 'AUTOBRIDGED', gets_currency: bid2.gets_currency, pays_currency: bid1.pays_currency} as BookOrder;
    if (bid1.gets_value >= bid2.pays_value) {
      order.gets_value = bid2.gets_value;
      order.pays_value = bid2.pays_value / bid1.price;
      p2++;
      bid1.gets_value -= bid2.pays_value;
      bid1.pays_value = bid1.gets_value / bid1.price;
    } else {
      order.gets_value = bid1.gets_value * bid2.price;
      order.pays_value = bid1.pays_value;
      p1++;
      bid2.pays_value -= bid1.gets_value;
      bid2.gets_value = bid2.pays_value * bid2.price;
    }
    order.amount = order.pays_value;
    order.volume = order.gets_value;
    order.price = order.volume / order.amount;
    data.push(order);
  }
  return data;
}

/** The book for base/counter (ledger assets: {currency: 'XRP'} or {currency, issuer}). */
export async function getBook(base: LedgerAsset, counter: LedgerAsset): Promise<Book> {
  if (base.currency === 'XRP' || counter.currency === 'XRP') return directBook(base, counter);
  const xrp = {currency: 'XRP'};
  const [direct, viaBase, viaCounter] = await Promise.all([directBook(base, counter), directBook(base, xrp), directBook(xrp, counter)]);
  return {
    asks: bridgeAsks(viaBase.asks, viaCounter.asks).concat(direct.asks).sort((a, b) => a.price - b.price),
    bids: bridgeBids(viaBase.bids, viaCounter.bids).concat(direct.bids).sort((a, b) => b.price - a.price)
  };
}
