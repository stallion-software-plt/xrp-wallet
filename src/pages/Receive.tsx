import {useState} from 'react';
import {useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {classicAddressToXAddress} from 'xrpl';
import {Qr} from '../components/Qr';
import {openExternal} from '../platform/desktop';
import {useAccount} from '../state/account';
import {accountUrl, useApp} from '../state/app';
import {copy} from '../state/toasts';

/** The tag as a number, null when empty, undefined when invalid. */
function parseTag(input: string): number | null | undefined {
  if (!input) return null;
  const tag = Number(input);
  return Number.isInteger(tag) && tag >= 0 && tag < 2 ** 32 ? tag : undefined;
}

export function Receive() {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const network = useApp(s => s.network);
  const address = useAccount(s => s.address)!;
  const loaded = useAccount(s => s.loaded);
  const unfunded = useAccount(s => s.unfunded);
  const [tagInput, setTagInput] = useState('');
  const [useXAddress, setUseXAddress] = useState(false);
  const tag = parseTag(tagInput);

  const shown = useXAddress && tag !== undefined
    ? classicAddressToXAddress(address, tag === null ? false : tag, network.networkType !== 'xrp')
    : address;
  // Without an X-address the tag is appended the way most wallets read it.
  const qrData = !useXAddress && tag !== null && tag !== undefined ? `${address}?dt=${tag}` : shown;
  const explorer = accountUrl(address);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t('receive')}</h1>
          <div className="page-sub">{t('receive_sub')}</div>
        </div>
      </div>

      <div className="grid-main-r">
        <div className="card">
          <div className="card-body text-center stack">
            <div><Qr value={qrData} size={220} /></div>
            <div>
              <div className="text-xs text-faint upper mb-4">{t(useXAddress ? 'x_address' : 'classic_address')}</div>
              <div className="mono break fw-600">{shown}</div>
            </div>
            <div className="cluster justify-center">
              <button type="button" className="btn btn-primary" onClick={() => copy(shown)}><i className="fa fa-clone" /> {t('copy_address')}</button>
              {explorer && <button type="button" className="btn btn-secondary" onClick={() => openExternal(explorer)}><i className="fa fa-external-link" /> {t('view_explorer')}</button>}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-header"><div className="card-title">{t('receive_options')}</div></div>
            <div className="card-body stack">
              <div className="field">
                <label htmlFor="receive_tag">{t('dest_tag')}</label>
                <input id="receive_tag" className="input" type="text" value={tagInput} placeholder={t('optional')} onChange={e => setTagInput(e.target.value.trim())} />
                <div className="hint">{t('receive_tag_hint')}</div>
                {tag === undefined && <div className="form-error">{t('error_invalid_tag')}</div>}
              </div>
              <label className="checkbox-row"><input type="checkbox" checked={useXAddress} onChange={e => setUseXAddress(e.target.checked)} /> {t('use_x_address')}</label>
              <div className="hint hint-tight">{t('x_address_hint')}</div>
            </div>
          </div>

          {loaded && unfunded && (
            <div className="alert alert-info"><i className="fa fa-info-circle" /><span>{t('NotFoundError', network.coin)}</span></div>
          )}

          <div className="card">
            <div className="card-header"><div className="card-title">{t('tokens')}</div></div>
            <div className="card-body text-sm text-muted">{t('receive_tokens_hint')}</div>
            <div className="card-footer"><button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/trust')}><i className="fa fa-certificate" /> {t('manage_tokens')}</button></div>
          </div>
        </div>
      </div>
    </>
  );
}
