import {fmtCode} from '../core/format';
import {openExternal} from '../platform/desktop';

interface Props {
  code: string;
  logo?: string;
  name?: string;
  website?: string;
  issuer?: string;
}

/** Logo, code, issuer name and address of an asset. */
export function AssetCell({code, logo, name, website, issuer}: Props) {
  return (
    <div className="asset">
      <div className="asset-logo">{logo && <img src={logo} alt="" />}</div>
      <div className="asset-text">
        <div className="asset-code">
          <span>{fmtCode(code)}</span>
          {name && (
            <span className="asset-name">
              {website ? <a onClick={() => openExternal(website)}>{name}</a> : <span>{name}</span>}
            </span>
          )}
        </div>
        {issuer && <div className="asset-issuer" title={issuer}>{issuer}</div>}
      </div>
    </div>
  );
}
