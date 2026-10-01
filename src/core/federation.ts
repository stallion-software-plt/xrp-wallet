// Lookups on a domain the user named: ripple.toml / xrp-ledger.toml (federation and token
// lists) and the legacy ripple.txt. Only runs for domains the user entered.
import {parse} from 'smol-toml';

const tomlCache: Record<string, Record<string, unknown>> = {};

/** /.well-known/ripple.toml, which names the domain's federation (XRC20) server. */
export async function getRippleToml(domain: string): Promise<Record<string, unknown>> {
  if (tomlCache[domain]) return tomlCache[domain];
  try {
    const response = await fetch(`https://${domain}/.well-known/ripple.toml`);
    if (!response.ok) throw new Error(response.statusText);
    const parsed = parse(await response.text()) as Record<string, unknown>;
    tomlCache[domain] = parsed;
    return parsed;
  } catch (error) {
    console.warn('ripple.toml lookup failed', domain, error);
    throw new Error('NoRippleToml');
  }
}

export interface TomlCurrency {
  code: string;
  issuer: string;
  name: string;
  logo: string;
}

/** Tokens an issuer publishes in /.well-known/xrp-ledger.toml ([[CURRENCIES]] entries). */
export async function getLedgerTomlCurrencies(domain: string): Promise<TomlCurrency[]> {
  const response = await fetch(`https://${domain}/.well-known/xrp-ledger.toml`);
  if (!response.ok) throw new Error('NoRippleToml');
  const parsed = parse(await response.text()) as Record<string, unknown>;
  const currencies = (parsed.CURRENCIES || parsed.currencies || []) as Array<Record<string, string>>;
  return currencies.filter(c => c.code && c.issuer).map(c => ({
    code: c.code,
    issuer: c.issuer,
    name: c.display_name || c.name || '',
    logo: c.icon || ''
  }));
}

/** Sections of a legacy ripple.txt file. */
export function parseRippleTxt(txt: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = '';
  for (const raw of txt.split(/\r\n|\r|\n/)) {
    if (!raw.length || raw[0] === '#') continue;
    if (raw[0] === '[' && raw[raw.length - 1] === ']') {
      current = raw.slice(1, -1);
      sections[current] = [];
    } else if (sections[current]) {
      sections[current].push(raw.trim());
    }
  }
  return sections;
}

/** ripple.txt from https://www.<domain> or https://<domain>. */
export async function getRippleTxt(domain: string): Promise<Record<string, string[]>> {
  for (const url of [`https://${domain}/ripple.txt`, `https://www.${domain}/ripple.txt`]) {
    try {
      const response = await fetch(url);
      if (response.ok) return parseRippleTxt(await response.text());
    } catch {
      // try the next URL
    }
  }
  throw new Error('NoRippleTXT');
}
