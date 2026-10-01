// Number, currency-code and identifier formatting shared by every screen.

/** Rounds to `digits` decimal places (0 when omitted). */
export function round(value: number, digits = 0): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

/** Decodes hex to text byte by byte, skipping zero bytes (for 160-bit currency codes). */
export function hexToAscii(hex: string): string {
  let str = '';
  let i = hex.startsWith('0x') ? 2 : 0;
  for (; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (code > 0) str += String.fromCharCode(code);
  }
  return str;
}

/** Encodes a currency name as a 40-character (160-bit) hex currency code. */
export function asciiToHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const n = str.charCodeAt(i).toString(16);
    hex += n.length < 2 ? '0' + n : n;
  }
  return (hex + '0'.repeat(40)).substring(0, 40).toUpperCase();
}

/** The ledger form of a currency code: codes longer than 3 characters become hex. */
export function realCode(input: string): string {
  return input && input.length > 3 && input.length <= 20 && input !== 'drops' ? asciiToHex(input) : input;
}

// Names for known AMM LP token codes.
const LP_NAMES: Record<string, string> = {
  '036A7A7F2A97B4FA6DC31E9C00A24DF4436A76ED': 'XRPS-XRP',
  '032A44D0C63117A2189C23C44D071731A2C1D5F8': 'XRPS-USDT',
  '03C2744C7F532C62F8C4D49D07C03723E667EC6D': 'XRPS-ETH',
  '03819CE473B7EFC3157A6F6E4CD01AF27CC3DAE9': 'XRPS-XLM',
  '03F7CA89ED32E3301C581E98F1B6D2F5028F30DE': 'XRPS-CNY',
  '038EDFFB6E794DE7401AB32A3FAB7436357BC769': 'XRPS-ULT',
  '03A1897ED5199AC170706194A3F2EA24C69B366A': 'XRPS-PEOPLE',
  '03AD86F3192EBF3AE79E5B07156AA82C65A19EEB': 'XRPS-PEPE',
  '03F933EF00EC59ED39F434372E36B542C80D441F': 'XRPS-SHIB',
  '03A6770F32D91F916DCBEAEF5DF9922FCF6F69A1': 'XRPS-BTC',
  '03E5B4D862526500541050E4A2872CD7E7E818BB': 'XRPS-FIL',
  '03AC78CEB14F1DDF61007A0AEA67F933720B265F': 'XRPS-XAG',
  '0387C12FC7A317FFF309B2DA4C316AFF66866D7D': 'XAG-USDT',
  '037F2D4F9A403ABFED3ED22DFD44D24C5FA3618D': 'XRP-USDT',
  '03B9D5AED48B20CC0926373FB46775329CFDB52E': 'XRP-XLM',
  '03133F280C89315FFF6319A9C0ACE2634C676472': 'XRP-XAG',
  '035FAD658918E54F6BF7FC7D696B65F64A1CBF87': 'ETH-XAG',
  '03E5EA238C57E6F00322F8A0B6FD37920CFFF55C': 'XLM-XAG',
  '036569492589AA8CCDFF9426B87A63D5019CA8F2': 'XAG-CNY',
  '0334E001620110E325E1EEF5A21F1A22FF1DDD2B': 'XRP-CNY',
  '03AA0832FC381B3B588121D3B8CD3A39D3E125A3': 'XLM-CNY'
};

/**
 * A readable currency code: decodes hex codes and names LP tokens. A token whose hex code decodes
 * to "XRP" (or the network's own coin) is marked, so it can't pass for the real thing.
 */
export function fmtCode(input: string | undefined | null, nativeCode = 'XRP'): string {
  if (!input || input.length !== 40) return input || '';
  if (input.startsWith('03')) return LP_NAMES[input] || 'LP ' + input.substring(2, 8);
  const text = hexToAscii(input);
  const bare = text.replace(/[^\x21-\x7e]/g, '').toUpperCase();
  return bare === 'XRP' || bare === nativeCode.toUpperCase() ? `${bare} (token)` : text;
}

/** Currency label, showing the network's native code for XRP. */
export function currencyLabel(input: string | undefined, nativeCode = 'XRP'): string {
  const code = input || '';
  return code === 'XRP' ? nativeCode : fmtCode(code, nativeCode);
}

/** "code.issuer" key for an asset (just the code for the native asset). */
export function assetKey(code: string, issuer?: string): string {
  if (!code) return 'NONE';
  const c = realCode(code);
  return issuer ? `${c}.${issuer}` : c;
}

/** A plain decimal number such as "12" or "0.5". Rejects "1e3", "0x10", "Infinity" and signs, which
 *  JavaScript and BigNumber would otherwise accept and turn into a different amount. */
export function isDecimal(value: string | number | undefined | null): boolean {
  return /^(\d+(\.\d*)?|\.\d+)$/.test(String(value ?? '').trim());
}

const grouped = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});

/** Display number: whole and grouped from 1000 up, otherwise up to 6 decimals. */
export function fmtNum(input: string | number | undefined | null): string {
  if (input === undefined || input === null || input === '') return '';
  const num = typeof input === 'number' ? input : parseFloat(input);
  if (isNaN(num)) return String(input);
  if (num >= 1000) return grouped.format(num);
  return String(round(num, 6));
}

const fixedFormats: Record<number, Intl.NumberFormat> = {};

/** Grouped number with exactly `digits` decimals, e.g. 1,234.500000. */
export function fmtFixed(input: string | number | undefined | null, digits: number): string {
  const num = Number(input);
  if (input === undefined || input === null || input === '' || isNaN(num)) return '';
  fixedFormats[digits] ??= new Intl.NumberFormat('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  return fixedFormats[digits].format(num);
}

/** Compact form for long identifiers: `head` leading and `tail` trailing characters. */
export function short(value: string | undefined | null, head = 6, tail = 4): string {
  if (!value || value.length <= head + tail + 1) return value || '';
  return value.substring(0, head) + '…' + value.substring(value.length - tail);
}

/** Seconds since the Ripple epoch (2000-01-01) to a JS timestamp in ms. */
export function rippleTimeToMs(seconds: number | string | undefined): number | null {
  if (!seconds && seconds !== 0) return null;
  return (Number(seconds) + 946684800) * 1000;
}

/** JS date (or anything Date accepts) to seconds since the Ripple epoch. */
export function toRippleTime(date: Date | string | number | undefined | null): number | undefined {
  if (date === undefined || date === null || date === '') return undefined;
  return Math.round(new Date(date).getTime() / 1000) - 946684800;
}

/** Hex to UTF-8 text; returns the input unchanged when it isn't valid UTF-8 hex. */
export function hexToText(hex: string | undefined | null): string {
  if (!hex) return '';
  if (!/^([0-9a-fA-F]{2})*$/.test(hex)) return hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    return hex;
  }
}

/** UTF-8 text to upper-case hex. */
export function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const dateTime = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
const dateOnly = new Intl.DateTimeFormat(undefined, {year: 'numeric', month: 'short', day: 'numeric'});

export function fmtDateTime(ms: number | null | undefined): string {
  return ms ? dateTime.format(new Date(ms)) : '';
}

export function fmtDate(ms: number | null | undefined): string {
  return ms ? dateOnly.format(new Date(ms)) : '';
}
