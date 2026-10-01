import {useCallback, useEffect, useState} from 'react';
import {useSearchParams} from 'react-router';
import {useTranslation} from 'react-i18next';
import {PageHeader} from '../components/Common';
import {TxStatus} from '../components/TxStatus';
import {fmtFixed, hexToText} from '../core/format';
import {isValidAddress} from '../core/id';
import {useTx} from '../hooks/useTx';
import {useAccount} from '../state/account';
import {useApp} from '../state/app';
import {
  clawback, createTickets, deleteAccount, deleteDID, depositPreauth, errorMessage, getAccountInfo, getDID, getDepositPreauths,
  getTickets, isNotFound, setDID, setDomain, setFlag, setMessageKey, setNFTokenMinter, setRegularKey, setSignerList,
  setTickSize, setTransferRate, type AccountFlag, type AccountFlags, type AccountInfo
} from '../xrpl/api';

const SECTIONS = [
  {key: 'flags', icon: 'fa-toggle-on', label: 'account_flags'},
  {key: 'profile', icon: 'fa-globe', label: 'profile'},
  {key: 'regular', icon: 'fa-key', label: 'regular_key'},
  {key: 'signers', icon: 'fa-users', label: 'multi_signing'},
  {key: 'deposit', icon: 'fa-user-plus', label: 'deposit_auth'},
  {key: 'tickets', icon: 'fa-ticket', label: 'tickets'},
  {key: 'issuer', icon: 'fa-university', label: 'issuer_settings'},
  {key: 'did', icon: 'fa-id-card-o', label: 'did'},
  {key: 'delete', icon: 'fa-trash-o', label: 'AccountDelete'}
] as const;
type Section = typeof SECTIONS[number]['key'];

const FLAG_GROUPS: Array<{title: string; flags: AccountFlag[]}> = [
  {title: 'flags_incoming', flags: ['asfRequireDest', 'asfDisallowXRP', 'asfDepositAuth', 'asfDisallowIncomingTrustline', 'asfDisallowIncomingCheck', 'asfDisallowIncomingPayChan', 'asfDisallowIncomingNFTokenOffer']},
  {title: 'flags_issuer', flags: ['asfDefaultRipple', 'asfRequireAuth', 'asfGlobalFreeze', 'asfNoFreeze', 'asfAllowTrustLineClawback']},
  {title: 'flags_keys', flags: ['asfDisableMaster']}
];
const IRREVERSIBLE: AccountFlag[] = ['asfNoFreeze', 'asfAllowTrustLineClawback'];
const CONFIRM: AccountFlag[] = ['asfDisableMaster', 'asfNoFreeze', 'asfAllowTrustLineClawback', 'asfGlobalFreeze'];

interface Signer {
  account: string;
  weight: string;
}

interface Loaded {
  info: AccountInfo;
  tickets: number[];
  preauths: string[];
  did: {uri: string; data: string; document: string} | null;
}

export function Account() {
  const {t} = useTranslation();
  const [params] = useSearchParams();
  const coin = useApp(s => s.network.coin);
  const reserveInc = useApp(s => s.reserveInc);
  const address = useAccount(s => s.address);
  const readOnly = useAccount(s => s.readOnly);
  const [section, setSection] = useState<Section>(() => (SECTIONS.some(s => s.key === params.get('section')) ? params.get('section') as Section : 'flags'));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [unfunded, setUnfunded] = useState(false);
  const [error, setError] = useState('');

  const [flags, setFlags] = useState<AccountFlags | null>(null);
  const [profile, setProfile] = useState({domain: '', messageKey: '', isEth: false});
  const [nextRegularKey, setNextRegularKey] = useState('');
  const [signers, setSigners] = useState<{quorum: string; entries: Signer[]}>({quorum: '1', entries: [{account: '', weight: '1'}]});
  const [preauthAddress, setPreauthAddress] = useState('');
  const [ticketCount, setTicketCount] = useState('1');
  const [issuer, setIssuer] = useState({transferRate: '', tickSize: '', minter: ''});
  const [claw, setClaw] = useState({code: '', holder: '', amount: ''});
  const [didForm, setDidForm] = useState({uri: '', data: '', document: ''});
  const [del, setDel] = useState({destination: '', tag: '', understood: false});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [info, tickets, preauths, did] = await Promise.all([
        getAccountInfo(),
        getTickets().catch(() => []),
        getDepositPreauths().catch(() => []),
        getDID().catch(() => null)
      ]);
      const didText = did ? {uri: hexToText(did.URI), data: hexToText(did.Data), document: hexToText(did.DIDDocument)} : null;
      setUnfunded(false);
      setLoaded({info, tickets: tickets.map((x: {TicketSequence: number}) => x.TicketSequence).sort((a: number, b: number) => a - b), preauths: preauths.map((p: {Authorize: string}) => p.Authorize), did: didText});
      setFlags({...info.flags});
      setProfile({domain: info.domain, messageKey: info.data.MessageKey || '', isEth: false});
      setSigners(info.signerList
        ? {quorum: String(info.signerList.SignerQuorum), entries: info.signerList.SignerEntries.map(e => ({account: e.SignerEntry.Account, weight: String(e.SignerEntry.SignerWeight)}))}
        : {quorum: '1', entries: [{account: '', weight: '1'}]});
      setIssuer({transferRate: String(info.transferRate), tickSize: info.tickSize ? String(info.tickSize) : '', minter: info.nftMinter});
      setDidForm(didText || {uri: '', data: '', document: ''});
    } catch (err) {
      if (isNotFound(err)) setUnfunded(true);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, address]);

  const tx = useTx(() => void refresh());
  const info = loaded?.info;

  const toggleFlag = async (flag: AccountFlag, value: boolean) => {
    if (value && CONFIRM.includes(flag) && !window.confirm(t(`flag_${flag}_confirm`))) return;
    setFlags(f => f && {...f, [flag]: value});
    const hash = await tx.run(`flag_${flag}`, () => setFlag(flag, value));
    if (!hash) setFlags(f => f && {...f, [flag]: !value});
  };
  const canDisableMaster = !!info && (!!info.regularKey || !!info.signerList);

  const saveMessageKey = () => {
    let key = profile.messageKey || '';
    // An Ethereum address as a message key: 0x02 prefix and zero padding to 33 bytes.
    if (profile.isEth && key) key = '02' + '0'.repeat(24) + key.replace(/^0x/i, '').toUpperCase();
    void tx.run('messagekey', () => setMessageKey(key));
  };

  const signerWeight = signers.entries.reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
  const signersValid = (() => {
    const s = signers;
    if (!s.entries.length || s.entries.length > 32) return false;
    const accounts = s.entries.map(e => e.account.trim());
    const unique = new Set(accounts).size === accounts.length;
    const valid = s.entries.every(e => isValidAddress(e.account) && e.account.trim() !== address && Number(e.weight) > 0 && Number(e.weight) <= 65535);
    return unique && valid && Number(s.quorum) > 0 && signerWeight >= Number(s.quorum);
  })();
  const updateSigner = (i: number, patch: Partial<Signer>) => setSigners(s => ({...s, entries: s.entries.map((e, j) => (j === i ? {...e, ...patch} : e))}));

  const count = Number(ticketCount);
  const ticketsValid = count >= 1 && count <= 250 && (loaded?.tickets.length || 0) + count <= 250;

  const deleteAcct = () => void tx.run('delete', () => deleteAccount(del.destination.trim(), del.tag));

  const flagRow = (f: AccountFlag) => (
    <div className="setting-row" key={f}>
      <div className="setting-text">
        <div className="setting-title">
          {t(`flag_${f}`)}
          {IRREVERSIBLE.includes(f) && <span className="badge badge-warning"><i className="fa fa-exclamation-triangle" /> {t('irreversible')}</span>}
        </div>
        <div className="setting-desc">{t(`flag_${f}_desc`)}</div>
        <div className="mt-8"><TxStatus state={tx.status[`flag_${f}`]} /></div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={!!flags?.[f]} onChange={e => void toggleFlag(f, e.target.checked)}
          disabled={readOnly || tx.busy(`flag_${f}`) || (IRREVERSIBLE.includes(f) && !!info?.flags[f]) || (f === 'asfDisableMaster' && !flags?.[f] && !canDisableMaster)} />
        <span className="slider" />
      </label>
    </div>
  );

  return (
    <>
      <PageHeader title="account_settings" sub="account_settings_sub" loading={loading} onRefresh={() => void refresh()} />

      {unfunded && <div className="alert alert-info mb-16"><i className="fa fa-info-circle" /><span>{t('NotFoundError', coin)}</span></div>}
      {error && <div className="alert alert-error mb-16"><i className="fa fa-exclamation-circle" /><span>{t(error)}</span></div>}

      <div className="side-layout">
        <div className="side-nav card">
          <div className="card-body tight side-tabs">
            {SECTIONS.map(s => (
              <a key={s.key} className={`tab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}><i className={`fa ${s.icon}`} /> {t(s.label)}</a>
            ))}
          </div>
        </div>

        {!info && loading && <div className="loading-row"><span className="spinner" /> {t('loading')}</div>}

        {info && loaded && (
          <div className="stack">
            {section === 'flags' && FLAG_GROUPS.map(group => (
              <div className="card" key={group.title}>
                <div className="card-header"><div className="card-title">{t(group.title)}</div></div>
                <div className="card-body">{group.flags.map(flagRow)}</div>
              </div>
            ))}

            {section === 'profile' && (
              <>
                <div className="card">
                  <div className="card-header"><div className="card-title">{t('home_domain')}</div></div>
                  <div className="card-body stack">
                    <p className="text-muted text-sm mb-0">{t('domain_desc')}</p>
                    <div className="input-group">
                      <input className="input" value={profile.domain} onChange={e => setProfile(p => ({...p, domain: e.target.value.trim()}))} placeholder="example.com" />
                      <button type="button" className="btn" onClick={() => void tx.run('domain', () => setDomain(profile.domain))} disabled={readOnly || tx.busy('domain')}>{t('save')}</button>
                    </div>
                    <TxStatus state={tx.status.domain} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><div className="card-title">Message Key</div></div>
                  <div className="card-body stack">
                    <p className="text-muted text-sm mb-0">{t('messagekey_desc')}</p>
                    <div className="input-group">
                      <input className="input mono" value={profile.messageKey} onChange={e => setProfile(p => ({...p, messageKey: e.target.value.trim()}))} />
                      <button type="button" className="btn" onClick={saveMessageKey} disabled={readOnly || tx.busy('messagekey')}>{t('save')}</button>
                    </div>
                    <label className="checkbox-row"><input type="checkbox" checked={profile.isEth} onChange={e => setProfile(p => ({...p, isEth: e.target.checked}))} /> {t('messagekey_eth')}</label>
                    <TxStatus state={tx.status.messagekey} />
                  </div>
                </div>
              </>
            )}

            {section === 'regular' && (
              <div className="card">
                <div className="card-header"><div><div className="card-title">{t('regular_key')}</div><div className="card-sub">{t('regular_key_sub')}</div></div></div>
                <div className="card-body stack">
                  <div className="summary-box">
                    <div className="summary-row"><span className="k">{t('current')}</span><span className="v mono">{info.regularKey || t('none')}</span></div>
                  </div>
                  <div className="field">
                    <label htmlFor="regular_next">{t('new_regular_key')}</label>
                    <input id="regular_next" className="input mono" value={nextRegularKey} onChange={e => setNextRegularKey(e.target.value.trim())} placeholder="r..." />
                    {nextRegularKey && (!isValidAddress(nextRegularKey) || nextRegularKey === address) && <div className="form-error">{t('invalid_account')}</div>}
                  </div>
                  <TxStatus state={tx.status.regular} />
                  <div className="cluster">
                    <button type="button" className="btn btn-primary" onClick={() => void tx.run('regular', () => setRegularKey(nextRegularKey))}
                      disabled={readOnly || tx.busy('regular') || !isValidAddress(nextRegularKey) || nextRegularKey === address}>
                      <i className="fa fa-key" /> {t('set_regular_key')}
                    </button>
                    {info.regularKey && (
                      <button type="button" className="btn btn-danger-soft" onClick={() => void tx.run('regular', () => setRegularKey(''))}
                        disabled={readOnly || tx.busy('regular') || (info.flags.asfDisableMaster && !info.signerList)}>
                        <i className="fa fa-times" /> {t('remove')}
                      </button>
                    )}
                  </div>
                  {info.flags.asfDisableMaster && !info.signerList && <div className="alert alert-warning"><i className="fa fa-exclamation-triangle" /><span>{t('regular_key_master_disabled')}</span></div>}
                </div>
              </div>
            )}

            {section === 'signers' && (
              <div className="card">
                <div className="card-header"><div><div className="card-title">{t('multi_signing')}</div><div className="card-sub">{t('multi_signing_sub')}</div></div></div>
                <div className="card-body stack">
                  {info.signerList && (
                    <div className="alert alert-info"><i className="fa fa-users" /><span>{t('signer_list_active')} · {t('quorum')} {info.signerList.SignerQuorum} · {info.signerList.SignerEntries.length} {t('signers')}</span></div>
                  )}
                  {signers.entries.map((e, i) => (
                    <div className="signer-row" key={i}>
                      <input className="input mono grow" value={e.account} onChange={ev => updateSigner(i, {account: ev.target.value.trim()})} placeholder="r..." />
                      <div className="input-group weight-field"><input className="input" type="number" min={1} value={e.weight} onChange={ev => updateSigner(i, {weight: ev.target.value})} /><div className="addon">{t('weight')}</div></div>
                      <button type="button" className="icon-btn" onClick={() => setSigners(s => ({...s, entries: s.entries.filter((_, j) => j !== i)}))}><i className="fa fa-trash-o" /></button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm align-self-start" onClick={() => setSigners(s => ({...s, entries: [...s.entries, {account: '', weight: '1'}]}))} disabled={signers.entries.length >= 32}>
                    <i className="fa fa-plus" /> {t('add_signer')}
                  </button>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="quorum">{t('quorum')}</label>
                      <input id="quorum" className="input" type="number" min={1} value={signers.quorum} onChange={e => setSigners(s => ({...s, quorum: e.target.value}))} />
                      <div className="hint">{t('total_weight')}: {signerWeight}</div>
                    </div>
                  </div>
                  <TxStatus state={tx.status.signers} />
                  <div className="cluster">
                    <button type="button" className="btn btn-primary" onClick={() => void tx.run('signers', () => setSignerList(signers.quorum, signers.entries))} disabled={readOnly || tx.busy('signers') || !signersValid}>
                      <i className="fa fa-check" /> {t('save_signer_list')}
                    </button>
                    {info.signerList && (
                      <button type="button" className="btn btn-danger-soft" onClick={() => void tx.run('signers', () => setSignerList(0, []))} disabled={readOnly || tx.busy('signers')}>
                        <i className="fa fa-trash-o" /> {t('delete_signer_list')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {section === 'deposit' && (
              <div className="card">
                <div className="card-header"><div><div className="card-title">{t('deposit_auth')}</div><div className="card-sub">{t('deposit_auth_sub')}</div></div></div>
                <div className="card-body stack">
                  {flagRow('asfDepositAuth')}
                  <div>
                    <label>{t('preauthorized')}</label>
                    <div className="list card-muted rounded">
                      {loaded.preauths.map(a => (
                        <div className="list-item" key={a}>
                          <div className="li-main mono">{a}</div>
                          <button type="button" className="btn btn-danger-soft btn-xs" onClick={() => void tx.run('preauth', () => depositPreauth(a, false))} disabled={readOnly || tx.busy('preauth')}>{t('remove')}</button>
                        </div>
                      ))}
                      {!loaded.preauths.length && <div className="list-item text-faint">{t('none')}</div>}
                    </div>
                  </div>
                  <div className="input-group">
                    <input className="input mono" value={preauthAddress} onChange={e => setPreauthAddress(e.target.value.trim())} placeholder="r..." />
                    <button type="button" className="btn" disabled={readOnly || tx.busy('preauth') || !isValidAddress(preauthAddress)}
                      onClick={async () => { if (await tx.run('preauth', () => depositPreauth(preauthAddress, true))) setPreauthAddress(''); }}>
                      <i className="fa fa-plus" /> {t('authorize')}
                    </button>
                  </div>
                  <TxStatus state={tx.status.preauth} />
                </div>
              </div>
            )}

            {section === 'tickets' && (
              <div className="card">
                <div className="card-header"><div><div className="card-title">{t('tickets')}</div><div className="card-sub">{t('tickets_sub')}</div></div></div>
                <div className="card-body stack">
                  {loaded.tickets.length
                    ? <div className="cluster">{loaded.tickets.map(n => <span key={n} className="badge badge-accent"><i className="fa fa-ticket" /> {n}</span>)}</div>
                    : <div className="text-faint">{t('no_tickets')}</div>}
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="ticket_count">{t('ticket_count')}</label>
                      <input id="ticket_count" className="input" type="number" min={1} max={250} value={ticketCount} onChange={e => setTicketCount(e.target.value)} />
                      <div className="hint">{t('ticket_reserve_hint')} {fmtFixed((count || 0) * (reserveInc || 0), 2)} {coin.code}</div>
                    </div>
                  </div>
                  <TxStatus state={tx.status.tickets} />
                  <button type="button" className="btn btn-primary align-self-start" onClick={() => void tx.run('tickets', () => createTickets(ticketCount))} disabled={readOnly || tx.busy('tickets') || !ticketsValid}>
                    <i className="fa fa-ticket" /> {t('create_tickets')}
                  </button>
                </div>
              </div>
            )}

            {section === 'issuer' && (
              <>
                <div className="card">
                  <div className="card-header"><div><div className="card-title">{t('issuer_settings')}</div><div className="card-sub">{t('issuer_settings_sub')}</div></div></div>
                  <div className="card-body stack">
                    <div className="field">
                      <label htmlFor="transfer_rate">{t('transfer_rate')}</label>
                      <div className="input-group narrow-group">
                        <input id="transfer_rate" className="input" value={issuer.transferRate} onChange={e => setIssuer(x => ({...x, transferRate: e.target.value}))} />
                        <div className="addon">%</div>
                        <button type="button" className="btn" onClick={() => void tx.run('transferRate', () => setTransferRate(issuer.transferRate))}
                          disabled={readOnly || tx.busy('transferRate') || isNaN(Number(issuer.transferRate)) || Number(issuer.transferRate) < 0 || Number(issuer.transferRate) > 100}>{t('save')}</button>
                      </div>
                      <div className="hint">{t('transfer_rate_hint')}</div>
                      <TxStatus state={tx.status.transferRate} />
                    </div>
                    <div className="field">
                      <label htmlFor="tick_size">{t('tick_size')}</label>
                      <div className="input-group narrow-group">
                        <input id="tick_size" className="input" type="number" min={0} max={15} value={issuer.tickSize} placeholder="0" onChange={e => setIssuer(x => ({...x, tickSize: e.target.value}))} />
                        <button type="button" className="btn" onClick={() => void tx.run('tickSize', () => setTickSize(issuer.tickSize))}
                          disabled={readOnly || tx.busy('tickSize') || (!!issuer.tickSize && Number(issuer.tickSize) !== 0 && (Number(issuer.tickSize) < 3 || Number(issuer.tickSize) > 15))}>{t('save')}</button>
                      </div>
                      <div className="hint">{t('tick_size_hint')}</div>
                      <TxStatus state={tx.status.tickSize} />
                    </div>
                    <div className="field">
                      <label htmlFor="nft_minter">{t('nft_minter')}</label>
                      <div className="input-group">
                        <input id="nft_minter" className="input mono" value={issuer.minter} placeholder="r..." onChange={e => setIssuer(x => ({...x, minter: e.target.value.trim()}))} />
                        <button type="button" className="btn" onClick={() => void tx.run('minter', () => setNFTokenMinter(issuer.minter))} disabled={readOnly || tx.busy('minter') || !isValidAddress(issuer.minter)}>{t('save')}</button>
                      </div>
                      <div className="hint">{t('nft_minter_hint')}</div>
                      {info.nftMinter && <button type="button" className="btn btn-ghost btn-xs mt-8" onClick={() => void tx.run('minter', () => setNFTokenMinter(''))} disabled={readOnly || tx.busy('minter')}>{t('remove')}</button>}
                      <TxStatus state={tx.status.minter} />
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><div><div className="card-title">{t('clawback')}</div><div className="card-sub">{t('clawback_sub')}</div></div></div>
                  <div className="card-body stack">
                    {!info.flags.asfAllowTrustLineClawback && <div className="alert alert-warning"><i className="fa fa-lock" /><span>{t('clawback_disabled')}</span></div>}
                    <div className="grid-3">
                      <div className="field"><label htmlFor="claw_code">{t('asset_code')}</label><input id="claw_code" className="input" value={claw.code} onChange={e => setClaw(c => ({...c, code: e.target.value.trim()}))} placeholder="USD" /></div>
                      <div className="field"><label htmlFor="claw_holder">{t('holder')}</label><input id="claw_holder" className="input mono" value={claw.holder} onChange={e => setClaw(c => ({...c, holder: e.target.value.trim()}))} placeholder="r..." /></div>
                      <div className="field"><label htmlFor="claw_amount">{t('amount')}</label><input id="claw_amount" className="input" value={claw.amount} onChange={e => setClaw(c => ({...c, amount: e.target.value}))} placeholder="0.00" /></div>
                    </div>
                    <TxStatus state={tx.status.clawback} />
                    <button type="button" className="btn btn-danger align-self-start" onClick={() => void tx.run('clawback', () => clawback(claw.code, claw.holder, claw.amount))}
                      disabled={readOnly || tx.busy('clawback') || !info.flags.asfAllowTrustLineClawback || !claw.code || !isValidAddress(claw.holder) || !(Number(claw.amount) > 0)}>
                      <i className="fa fa-gavel" /> {t('clawback')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {section === 'did' && (
              <div className="card">
                <div className="card-header"><div><div className="card-title">{t('did')}</div><div className="card-sub">{t('did_sub')}</div></div></div>
                <div className="card-body stack">
                  {loaded.did && <div className="alert alert-success"><i className="fa fa-id-card-o" /><span>{t('did_active')}</span></div>}
                  <div className="field"><label htmlFor="did_uri">URI</label><input id="did_uri" className="input mono" value={didForm.uri} maxLength={256} onChange={e => setDidForm(d => ({...d, uri: e.target.value}))} placeholder="https://... / ipfs://..." /></div>
                  <div className="field"><label htmlFor="did_data">{t('did_data')}</label><input id="did_data" className="input mono" value={didForm.data} maxLength={256} onChange={e => setDidForm(d => ({...d, data: e.target.value}))} /></div>
                  <div className="field"><label htmlFor="did_document">{t('did_document')}</label><textarea id="did_document" className="input mono" rows={3} value={didForm.document} maxLength={256} onChange={e => setDidForm(d => ({...d, document: e.target.value}))} /></div>
                  <TxStatus state={tx.status.did} />
                  <div className="cluster">
                    <button type="button" className="btn btn-primary" onClick={() => void tx.run('did', () => setDID(didForm))} disabled={readOnly || tx.busy('did') || !(didForm.uri || didForm.data || didForm.document)}>
                      <i className="fa fa-check" /> {t('save')}
                    </button>
                    {loaded.did && <button type="button" className="btn btn-danger-soft" onClick={() => void tx.run('did', () => deleteDID())} disabled={readOnly || tx.busy('did')}><i className="fa fa-trash-o" /> {t('Delete')}</button>}
                  </div>
                </div>
              </div>
            )}

            {section === 'delete' && (
              <div className="card">
                <div className="card-header"><div className="card-title text-danger">{t('AccountDelete')}</div></div>
                <div className="card-body stack">
                  <div className="alert alert-error"><i className="fa fa-exclamation-triangle" /><span>{t('merge_desc', coin)} {reserveInc} {coin.code}</span></div>
                  <p className="text-muted text-sm mb-0">{t('delete_requirements')}</p>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="delete_destination">{t('dest_account')}</label>
                      <input id="delete_destination" className="input mono" value={del.destination} onChange={e => setDel(d => ({...d, destination: e.target.value.trim()}))} placeholder="r..." />
                      {del.destination && !isValidAddress(del.destination) && <div className="form-error">{t('invalid_account')}</div>}
                    </div>
                    <div className="field"><label htmlFor="delete_tag">{t('dest_tag')}</label><input id="delete_tag" className="input" value={del.tag} onChange={e => setDel(d => ({...d, tag: e.target.value.trim()}))} placeholder={t('optional')} /></div>
                  </div>
                  <label className="checkbox-row"><input type="checkbox" checked={del.understood} onChange={e => setDel(d => ({...d, understood: e.target.checked}))} /> {t('delete_understand')}</label>
                  <TxStatus state={tx.status.delete} />
                  <button type="button" className="btn btn-danger align-self-start" onClick={deleteAcct}
                    disabled={readOnly || tx.busy('delete') || !del.understood || !isValidAddress(del.destination) || del.destination === address}>
                    <i className="fa fa-trash-o" /> {t('AccountDelete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
