import {Fragment, useEffect, useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {convertHexToString, dropsToXrp, type Amount} from 'xrpl';
import {LoadError} from '../components/Common';
import {Modal} from '../components/Modal';
import {TxStatus} from '../components/TxStatus';
import {currencyLabel, fmtDateTime, fmtNum, rippleTimeToMs, short} from '../core/format';
import {isValidAddress} from '../core/id';
import {getNftMedia, setNftMedia} from '../core/settings';
import {useLedgerList} from '../hooks/useLedgerList';
import {useTx} from '../hooks/useTx';
import {openExternal} from '../platform/desktop';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {copy} from '../state/toasts';
import {acceptNFTOffer, burnNFT, cancelNFTOffers, createNFTOffer, getNFTOffers, getNFTOffersCreated, getNFTs, mintNFT} from '../xrpl/api';
import {toAmount} from '../xrpl/amounts';
import {cachedMeta, loadMeta, type NftMeta} from '../xrpl/nftmeta';

const FLAGS = {burnable: 0x0001, onlyXRP: 0x0002, trustLine: 0x0004, transferable: 0x0008} as const;
const lsfSellNFToken = 0x0001;

interface Nft {
  NFTokenID: string;
  Issuer: string;
  NFTokenTaxon: number;
  nft_serial: number;
  Flags: number;
  TransferFee?: number;
  URI?: string;
  uri: string;
  flagList: string[];
  fee: number;
}

interface NftOffer {
  nft_offer_index: string;
  owner: string;
  amount: Amount;
  destination?: string;
}

type Tab = 'owned' | 'offers' | 'mint' | 'buy';
const validId = (id: string) => /^[0-9A-Fa-f]{64}$/.test(id.trim());

function safeHex(hex: string): string {
  try {
    return convertHexToString(hex);
  } catch {
    return hex;
  }
}

export function Nfts() {
  const {t} = useTranslation();
  const network = useApp(s => s.network);
  const code = network.coin.code;
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);
  const [tab, setTab] = useState<Tab>('owned');
  const [media, setMedia] = useState(getNftMedia);
  // null while loading.
  const [meta, setMeta] = useState<Record<string, NftMeta | null>>({});

  const nfts = useLedgerList<Nft>(async () => (await getNFTs()).map((nft: any) => ({
    ...nft,
    uri: nft.URI ? safeHex(nft.URI) : '',
    flagList: (Object.keys(FLAGS) as Array<keyof typeof FLAGS>).filter(name => nft.Flags & FLAGS[name]),
    fee: (nft.TransferFee || 0) / 1000
  })));
  const myOffers = useLedgerList<any>(async () => (await getNFTOffersCreated()).map((o: any) => ({...o, sell: !!(o.Flags & lsfSellNFToken)})));

  // Images and metadata are only fetched after the user opts in.
  useEffect(() => {
    if (!media) {
      setMeta({});
      return;
    }
    let active = true;
    for (const nft of nfts.items) {
      const hit = cachedMeta(nft.NFTokenID);
      if (hit) {
        setMeta(m => ({...m, [nft.NFTokenID]: hit}));
        continue;
      }
      setMeta(m => ({...m, [nft.NFTokenID]: null}));
      void loadMeta(nft.NFTokenID, nft.uri).then(result => {
        if (active) setMeta(m => ({...m, [nft.NFTokenID]: result}));
      });
    }
    return () => {
      active = false;
    };
  }, [media, nfts.items]);

  const toggleMedia = (on: boolean) => {
    setMedia(on);
    setNftMedia(on);
  };

  const [selected, setSelected] = useState<Nft | null>(null);
  const [offers, setOffers] = useState<{sell: NftOffer[]; buy: NftOffer[]; error?: string} | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'offers' | 'sell'>('info');
  const [offerForm, setOfferForm] = useState({amount: '', destination: '', expiration: '', transfer: false});

  const loadOffers = async (nft: Nft) => {
    setOffers(null);
    try {
      setOffers(await getNFTOffers(nft.NFTokenID));
    } catch (err) {
      setOffers({sell: [], buy: [], error: (err as Error).message});
    }
  };

  const tx = useTx(() => {
    void nfts.refresh();
    void myOffers.refresh();
    if (selected) void loadOffers(selected);
  });

  const refresh = () => {
    void nfts.refresh();
    void myOffers.refresh();
  };

  const openNft = (nft: Nft) => {
    setSelected(nft);
    setDetailTab('info');
    setOfferForm({amount: '', destination: '', expiration: '', transfer: false});
    void loadOffers(nft);
  };

  const name = (nft: Nft) => meta[nft.NFTokenID]?.name || `#${nft.nft_serial}`;
  // Token amounts include their issuer, so a token named like XRP can't pass for XRP.
  const amountText = (amount: Amount) => {
    if (typeof amount !== 'object') return `${fmtNum(Number(dropsToXrp(amount)))} ${code}`;
    const token = amount as {currency: string; issuer?: string; value: string};
    return `${fmtNum(token.value)} ${currencyLabel(token.currency, code)}${token.issuer ? ` (${short(token.issuer, 6, 4)})` : ''}`;
  };

  const createSellOffer = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    void tx.run('sell', () => createNFTOffer({
      nftId: selected.NFTokenID, amount: offerForm.transfer ? '0' : offerForm.amount, sell: true,
      destination: offerForm.destination || undefined, expiration: offerForm.expiration || undefined
    }));
  };

  const burn = async () => {
    if (!selected || !window.confirm(t('burn_confirm'))) return;
    const hash = await tx.run('burn', () => burnNFT(selected.NFTokenID));
    if (hash) setSelected(null);
  };

  const accept = (offer: NftOffer, isSell: boolean) => {
    if (!window.confirm(t('nft_accept_confirm', {amount: amountText(offer.amount)}))) return;
    void tx.run('accept', () => acceptNFTOffer(isSell ? {sellOffer: offer.nft_offer_index} : {buyOffer: offer.nft_offer_index}));
  };
  const cancelOffer = (id: string) => void tx.run('cancel', () => cancelNFTOffers([id]));

  const [mint, setMint] = useState({uri: '', taxon: '0', transferFee: '', burnable: false, onlyXRP: false, transferable: true, issuer: ''});
  const submitMint = async (e: FormEvent) => {
    e.preventDefault();
    let flags = 0;
    if (mint.burnable) flags |= FLAGS.burnable;
    if (mint.onlyXRP) flags |= FLAGS.onlyXRP;
    if (mint.transferable) flags |= FLAGS.transferable;
    const hash = await tx.run('mint', () => mintNFT({
      uri: mint.uri, taxon: mint.taxon, transferFee: mint.transferable ? mint.transferFee : 0, flags, issuer: mint.issuer || undefined
    }));
    if (hash) setMint(m => ({...m, uri: ''}));
  };

  const [buy, setBuy] = useState({nftId: '', owner: '', amount: '', expiration: ''});
  const [lookup, setLookup] = useState<{loading: boolean; error: string; offers: {sell: NftOffer[]; buy: NftOffer[]} | null}>({loading: false, error: '', offers: null});
  const lookupOffers = async () => {
    const id = buy.nftId.trim();
    setLookup({loading: true, error: '', offers: null});
    try {
      const found = await getNFTOffers(id);
      setLookup({loading: false, error: '', offers: found});
      const owner = found.sell[0]?.owner;
      if (owner && !buy.owner) setBuy(b => ({...b, owner}));
    } catch (err) {
      setLookup({loading: false, error: (err as Error).message, offers: null});
    }
  };
  const submitBuy = (e: FormEvent) => {
    e.preventDefault();
    void tx.run('buy', () => createNFTOffer({nftId: buy.nftId.trim(), owner: buy.owner.trim(), amount: buy.amount, sell: false, expiration: buy.expiration || undefined}));
  };

  const [broker, setBroker] = useState({sell: '', buy: '', fee: ''});
  const submitBroker = (e: FormEvent) => {
    e.preventDefault();
    void tx.run('broker', () => acceptNFTOffer({sellOffer: broker.sell.trim(), buyOffer: broker.buy.trim(), brokerFee: broker.fee ? toAmount(broker.fee) : undefined}));
  };

  const selectedMeta: NftMeta = (selected && meta[selected.NFTokenID]) || {};

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('nfts')}</h1>
          <div className="page-sub">{t('nft_sub')}</div>
        </div>
        <div className="page-actions">
          <div className="tabs">
            <span className={`tab ${tab === 'owned' ? 'active' : ''}`} onClick={() => setTab('owned')}><i className="fa fa-th" /> {t('my_nfts')} <span className="badge">{nfts.items.length}</span></span>
            <span className={`tab ${tab === 'offers' ? 'active' : ''}`} onClick={() => setTab('offers')}><i className="fa fa-tags" /> {t('my_offers')} <span className="badge">{myOffers.items.length}</span></span>
            <span className={`tab ${tab === 'mint' ? 'active' : ''}`} onClick={() => setTab('mint')}><i className="fa fa-plus" /> {t('mint')}</span>
            <span className={`tab ${tab === 'buy' ? 'active' : ''}`} onClick={() => setTab('buy')}><i className="fa fa-shopping-cart" /> {t('buy_accept')}</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={nfts.loading}><i className={`fa fa-refresh ${nfts.loading ? 'fa-spin' : ''}`} /></button>
        </div>
      </div>

      <LoadError error={nfts.error} />

      {tab === 'owned' && (
        <div>
          <div className="privacy-bar mb-16">
            <label className="switch"><input type="checkbox" checked={media} onChange={e => toggleMedia(e.target.checked)} /><span className="slider" /></label>
            <div className="grow">
              <div className="fw-600">{t('nft_load_media')}</div>
              <div className="text-xs text-muted">{t('nft_load_media_hint')}</div>
            </div>
            {!media && <i className="fa fa-user-secret text-faint" />}
          </div>
          {nfts.items.length > 0 && (
            <div className="nft-grid">
              {nfts.items.map(nft => {
                const m = meta[nft.NFTokenID];
                return (
                  <div className="nft-card" key={nft.NFTokenID} onClick={() => openNft(nft)}>
                    <div className="nft-media">
                      {m?.image ? <img src={m.image} alt="" /> : (
                        <div className="nft-placeholder">{m === null ? <span className="spinner" /> : <i className="fa fa-picture-o" />}</div>
                      )}
                    </div>
                    <div className="nft-body">
                      <div className="fw-600 truncate">{name(nft)}</div>
                      <div className="text-xs text-faint truncate mono">{short(nft.NFTokenID, 8, 6)}</div>
                      <div className="cluster mt-8">
                        <span className="badge">{t('taxon')} {nft.NFTokenTaxon}</span>
                        {nft.fee > 0 && <span className="badge badge-accent">{nft.fee}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {nfts.loading && !nfts.items.length && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}
          {!nfts.loading && !nfts.items.length && (
            <div className="card empty">
              <div className="empty-icon"><i className="fa fa-picture-o" /></div>
              <div className="empty-title">{t('no_nfts')}</div>
              <div className="mb-12">{t('no_nfts_desc')}</div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('mint')}><i className="fa fa-plus" /> {t('mint')}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'offers' && (
        <div className="card">
          <div className="card-header"><div><div className="card-title">{t('my_offers')}</div><div className="card-sub">{t('my_offers_sub')}</div></div></div>
          {tx.status.cancel && <div className="card-alert"><TxStatus state={tx.status.cancel} /></div>}
          {myOffers.items.length > 0 ? (
            <table className="table">
              <thead><tr><th>{t('type')}</th><th>NFT</th><th className="text-right">{t('amount')}</th><th>{t('counterparty')}</th><th>{t('expires')}</th><th /></tr></thead>
              <tbody>
                {myOffers.items.map(o => (
                  <tr key={o.index}>
                    <td><span className={`badge ${o.sell ? 'badge-danger' : 'badge-success'}`}>{t(o.sell ? 'sell' : 'buy')}</span></td>
                    <td className="mono text-sm"><a onClick={() => copy(o.NFTokenID)}>{short(o.NFTokenID, 8, 6)}</a></td>
                    <td className="text-right num">{amountText(o.Amount)}</td>
                    <td className="mono text-sm">{short(o.Destination || o.Owner, 8, 6)}</td>
                    <td className="text-sm">{o.Expiration ? fmtDateTime(rippleTimeToMs(o.Expiration)) : '—'}</td>
                    <td className="text-right"><button type="button" className="btn btn-danger-soft btn-xs" onClick={() => cancelOffer(o.index)} disabled={tx.busy('cancel') || readOnly}>{t('offer_cancel')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty"><div className="empty-icon"><i className="fa fa-tags" /></div><div>{t('no_nft_offers')}</div></div>}
        </div>
      )}

      {tab === 'mint' && (
        <div className="grid-main">
          <div className="card">
            <div className="card-header"><div className="card-title">{t('mint_nft')}</div></div>
            <form className="card-body stack" onSubmit={submitMint}>
              <div className="field">
                <label htmlFor="mint_uri">{t('nft_uri')}</label>
                <input id="mint_uri" className="input mono" value={mint.uri} onChange={e => setMint(m => ({...m, uri: e.target.value}))} placeholder="ipfs://... or https://..." maxLength={256} />
                <div className="hint">{t('nft_uri_hint')}</div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="mint_taxon">{t('taxon')}</label>
                  <input id="mint_taxon" className="input" type="number" min={0} value={mint.taxon} onChange={e => setMint(m => ({...m, taxon: e.target.value}))} />
                  <div className="hint">{t('taxon_hint')}</div>
                </div>
                <div className="field">
                  <label htmlFor="mint_fee">{t('transfer_fee')}</label>
                  <div className="input-group"><input id="mint_fee" className="input" value={mint.transferFee} placeholder="0" disabled={!mint.transferable} onChange={e => setMint(m => ({...m, transferFee: e.target.value}))} /><div className="addon">%</div></div>
                  <div className="hint">{t('transfer_fee_hint')}</div>
                </div>
              </div>
              <div className="stack-sm">
                <label className="checkbox-row"><input type="checkbox" checked={mint.transferable} onChange={e => setMint(m => ({...m, transferable: e.target.checked}))} /> {t('flag_transferable')}</label>
                <label className="checkbox-row"><input type="checkbox" checked={mint.burnable} onChange={e => setMint(m => ({...m, burnable: e.target.checked}))} /> {t('flag_burnable')}</label>
                <label className="checkbox-row"><input type="checkbox" checked={mint.onlyXRP} onChange={e => setMint(m => ({...m, onlyXRP: e.target.checked}))} /> {t('flag_only_xrp')}</label>
              </div>
              <div className="field">
                <label htmlFor="mint_issuer">{t('mint_for_issuer')}</label>
                <input id="mint_issuer" className="input mono" value={mint.issuer} onChange={e => setMint(m => ({...m, issuer: e.target.value.trim()}))} placeholder={t('optional')} />
                <div className="hint">{t('mint_for_issuer_hint')}</div>
              </div>
              <TxStatus state={tx.status.mint} />
              <button className="btn btn-primary" type="submit" disabled={tx.busy('mint') || readOnly || Number(mint.transferFee) > 50 || (!!mint.issuer && !isValidAddress(mint.issuer))}>
                <i className="fa fa-magic" /> {t('mint')}
              </button>
            </form>
          </div>
          <div className="card card-muted">
            <div className="card-body stack-sm text-sm text-muted">
              <div className="fw-600 text-lg text-strong"><i className="fa fa-lightbulb-o text-warning" /> {t('nft_tips')}</div>
              <p>{t('nft_tip_1')}</p>
              <p>{t('nft_tip_2')}</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'buy' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('make_buy_offer')}</div><div className="card-sub">{t('make_buy_offer_sub')}</div></div></div>
            <form className="card-body stack" onSubmit={submitBuy}>
              <div className="field">
                <label htmlFor="buy_id">NFT ID</label>
                <div className="input-group">
                  <input id="buy_id" className="input mono" value={buy.nftId} onChange={e => setBuy(b => ({...b, nftId: e.target.value}))} placeholder="000800..." />
                  <button type="button" className="btn" onClick={() => void lookupOffers()} disabled={!validId(buy.nftId)}>{t('lookup')}</button>
                </div>
              </div>
              <div className="field"><label htmlFor="buy_owner">{t('nft_owner')}</label><input id="buy_owner" className="input mono" value={buy.owner} onChange={e => setBuy(b => ({...b, owner: e.target.value}))} placeholder="r..." /></div>
              <div className="grid-2">
                <div className="field"><label htmlFor="buy_amount">{t('amount')}</label><div className="input-group"><input id="buy_amount" className="input" value={buy.amount} onChange={e => setBuy(b => ({...b, amount: e.target.value}))} placeholder="0.00" /><div className="addon">{code}</div></div></div>
                <div className="field"><label htmlFor="buy_expiration">{t('expires')}</label><input id="buy_expiration" className="input" type="datetime-local" value={buy.expiration} onChange={e => setBuy(b => ({...b, expiration: e.target.value}))} /></div>
              </div>
              {lookup.loading && <div className="loading-row"><span className="spinner" /></div>}
              {lookup.offers && (
                <div className="summary-box">
                  <div className="text-xs text-faint upper mb-8">{t('existing_offers')}</div>
                  {lookup.offers.sell.map(o => (
                    <div className="summary-row" key={o.nft_offer_index}>
                      <span className="k">{t('sell')} · {short(o.owner, 6, 4)}</span>
                      <span className="v">{amountText(o.amount)} <a className="btn btn-soft btn-xs" onClick={() => !readOnly && accept(o, true)}>{t('accept')}</a></span>
                    </div>
                  ))}
                  {lookup.offers.buy.map(o => (
                    <div className="summary-row" key={o.nft_offer_index}><span className="k">{t('buy')} · {short(o.owner, 6, 4)}</span><span className="v">{amountText(o.amount)}</span></div>
                  ))}
                  {!lookup.offers.sell.length && !lookup.offers.buy.length && <div className="text-sm text-faint">{t('no_offers_found')}</div>}
                </div>
              )}
              {lookup.error && <div className="text-danger text-sm">{lookup.error}</div>}
              <TxStatus state={tx.status.buy} />
              <TxStatus state={tx.status.accept} />
              <button className="btn btn-primary" type="submit" disabled={tx.busy('buy') || readOnly || !validId(buy.nftId) || !isValidAddress(buy.owner) || !(Number(buy.amount) > 0)}>
                <i className="fa fa-shopping-cart" /> {t('make_buy_offer')}
              </button>
            </form>
          </div>
          <div className="card">
            <div className="card-header"><div><div className="card-title">{t('broker_sale')}</div><div className="card-sub">{t('broker_sale_sub')}</div></div></div>
            <form className="card-body stack" onSubmit={submitBroker}>
              <div className="field"><label htmlFor="broker_sell">{t('sell_offer_id')}</label><input id="broker_sell" className="input mono" value={broker.sell} onChange={e => setBroker(b => ({...b, sell: e.target.value}))} /></div>
              <div className="field"><label htmlFor="broker_buy">{t('buy_offer_id')}</label><input id="broker_buy" className="input mono" value={broker.buy} onChange={e => setBroker(b => ({...b, buy: e.target.value}))} /></div>
              <div className="field"><label htmlFor="broker_fee">{t('broker_fee')}</label><div className="input-group"><input id="broker_fee" className="input" value={broker.fee} onChange={e => setBroker(b => ({...b, fee: e.target.value}))} placeholder={t('optional')} /><div className="addon">{code}</div></div></div>
              <TxStatus state={tx.status.broker} />
              <button className="btn btn-secondary" type="submit" disabled={tx.busy('broker') || readOnly || !validId(broker.sell) || !validId(broker.buy)}><i className="fa fa-handshake-o" /> {t('accept')}</button>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <Modal
          wide
          title={<span className="truncate">{name(selected)}</span>}
          onClose={() => setSelected(null)}
          footer={
            <>
              <div className="grow"><TxStatus state={tx.status.burn} /></div>
              <button type="button" className="btn btn-danger-soft" onClick={() => void burn()} disabled={tx.busy('burn') || readOnly}><i className="fa fa-fire" /> {t('burn')}</button>
              {network.networkType === 'xrp' && (
                <button type="button" className="btn btn-secondary" onClick={() => openExternal(`https://xrpscan.com/nft/${selected.NFTokenID}`)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>
              )}
            </>
          }
        >
          <div className="nft-detail">
            <div className="nft-media big">
              {selectedMeta.image ? <img src={selectedMeta.image} alt="" /> : <div className="nft-placeholder"><i className="fa fa-picture-o" /></div>}
            </div>
            <div className="stack">
              {selectedMeta.description && <p className="text-muted text-sm mb-0">{selectedMeta.description}</p>}
              <div className="tabs">
                <span className={`tab ${detailTab === 'info' ? 'active' : ''}`} onClick={() => setDetailTab('info')}>{t('details')}</span>
                <span className={`tab ${detailTab === 'offers' ? 'active' : ''}`} onClick={() => setDetailTab('offers')}>{t('offers')}</span>
                <span className={`tab ${detailTab === 'sell' ? 'active' : ''}`} onClick={() => setDetailTab('sell')}>{t('sell_transfer')}</span>
              </div>

              {detailTab === 'info' && (
                <dl className="kv text-sm">
                  <dt>NFT ID</dt><dd className="mono break">{selected.NFTokenID} <a className="icon-btn sm" onClick={() => copy(selected.NFTokenID)}><i className="fa fa-clone" /></a></dd>
                  <dt>{t('issuer')}</dt><dd className="mono">{selected.Issuer}</dd>
                  <dt>{t('taxon')}</dt><dd>{selected.NFTokenTaxon}</dd>
                  <dt>{t('serial')}</dt><dd>{selected.nft_serial}</dd>
                  <dt>{t('transfer_fee')}</dt><dd>{selected.fee}%</dd>
                  <dt>{t('flags')}</dt>
                  <dd>{selected.flagList.length ? selected.flagList.map(f => <span key={f} className="badge mr-4">{t('flag_' + f)}</span>) : '—'}</dd>
                  <dt>{t('nft_uri')}</dt><dd className="mono break">{selected.uri || '—'}</dd>
                  {(selectedMeta.attributes || []).map((a, i) => (
                    <Fragment key={i}><dt>{String(a.trait_type ?? '')}</dt><dd>{String(a.value ?? '')}</dd></Fragment>
                  ))}
                </dl>
              )}

              {detailTab === 'offers' && (
                <div className="stack-sm">
                  {!offers && <div className="loading-row"><span className="spinner" /></div>}
                  <TxStatus state={tx.status.accept} />
                  <TxStatus state={tx.status.cancel} />
                  {offers && (
                    <div className="summary-box">
                      <div className="text-xs text-faint upper mb-8">{t('buy_offers')}</div>
                      {offers.buy.map(o => (
                        <div className="summary-row" key={o.nft_offer_index}>
                          <span className="k mono">{short(o.owner, 6, 4)}</span>
                          <span className="v">{amountText(o.amount)}{' '}
                            <button type="button" className="btn btn-soft btn-xs" onClick={() => accept(o, false)} disabled={readOnly}>{t('accept')}</button>{' '}
                            {o.owner === address && <button type="button" className="btn btn-danger-soft btn-xs" onClick={() => cancelOffer(o.nft_offer_index)}>{t('offer_cancel')}</button>}
                          </span>
                        </div>
                      ))}
                      {!offers.buy.length && <div className="text-sm text-faint">{t('no_offers_found')}</div>}
                      <hr />
                      <div className="text-xs text-faint upper mb-8">{t('sell_offers')}</div>
                      {offers.sell.map(o => (
                        <div className="summary-row" key={o.nft_offer_index}>
                          <span className="k">{o.destination ? `${t('to')} ${short(o.destination, 6, 4)}` : t('anyone')}</span>
                          <span className="v">{amountText(o.amount)}{' '}
                            {o.owner === address && <button type="button" className="btn btn-danger-soft btn-xs" onClick={() => cancelOffer(o.nft_offer_index)} disabled={readOnly}>{t('offer_cancel')}</button>}
                          </span>
                        </div>
                      ))}
                      {!offers.sell.length && <div className="text-sm text-faint">{t('no_offers_found')}</div>}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'sell' && (
                <form className="stack" onSubmit={createSellOffer}>
                  <label className="checkbox-row"><input type="checkbox" checked={offerForm.transfer} onChange={e => setOfferForm(f => ({...f, transfer: e.target.checked}))} /> {t('transfer_free')}</label>
                  {!offerForm.transfer && (
                    <div className="field">
                      <label htmlFor="sell_price">{t('price')}</label>
                      <div className="input-group"><input id="sell_price" className="input" value={offerForm.amount} onChange={e => setOfferForm(f => ({...f, amount: e.target.value}))} placeholder="0.00" /><div className="addon">{code}</div></div>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="sell_destination">{t('destination')}</label>
                    <input id="sell_destination" className="input mono" value={offerForm.destination} onChange={e => setOfferForm(f => ({...f, destination: e.target.value.trim()}))} placeholder={t(offerForm.transfer ? 'required' : 'optional')} />
                    <div className="hint">{t('nft_destination_hint')}</div>
                  </div>
                  <div className="field"><label htmlFor="sell_expiration">{t('expires')}</label><input id="sell_expiration" className="input" type="datetime-local" value={offerForm.expiration} onChange={e => setOfferForm(f => ({...f, expiration: e.target.value}))} /></div>
                  <TxStatus state={tx.status.sell} />
                  <button className="btn btn-primary" type="submit"
                    disabled={tx.busy('sell') || readOnly || (offerForm.transfer ? !isValidAddress(offerForm.destination) : !(Number(offerForm.amount) > 0)) || (!!offerForm.destination && !isValidAddress(offerForm.destination))}>
                    <i className="fa fa-tag" /> {t(offerForm.transfer ? 'transfer' : 'create_sell_offer')}
                  </button>
                </form>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
