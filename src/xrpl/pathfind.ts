// path_find subscriptions for cross-currency payments. One open search at a time.
import type {Amount, Client, Path} from 'xrpl';
import {getPathClient} from './connection';

export interface PathAlternative {
  source_amount: Amount;
  paths_computed: Path[];
  destination_amount?: Amount;
}

export interface PathUpdate {
  alternatives: PathAlternative[];
}

let current: {client: Client; handler: (data: PathUpdate) => void} | null = null;

function isLpToken(amount: Amount) {
  return typeof amount === 'object' && amount.currency.startsWith('03');
}

/** Stops the open search. */
export function closePathFind(): void {
  if (!current) return;
  const {client, handler} = current;
  current = null;
  client.off('path_find', handler as never);
  if (client.isConnected()) {
    client.request({command: 'path_find', subcommand: 'close'} as never).catch(() => {});
  }
}

/** Opens a search; `onUpdate` receives the first result and each update, `onError` a failure. */
export async function openPathFind(
  source: string, destination: string, amount: Amount,
  onUpdate: (data: PathUpdate) => void, onError: (err: Error) => void
): Promise<void> {
  closePathFind();
  let client: Client;
  try {
    client = await getPathClient();
  } catch (err) {
    onError(err as Error);
    return;
  }
  const deliver = (data: PathUpdate) => onUpdate({...data, alternatives: (data.alternatives || []).filter(alt => !isLpToken(alt.source_amount))});
  const handler = (data: PathUpdate) => {
    if (current?.handler === handler) deliver(data);
  };
  current = {client, handler};
  client.on('path_find', handler as never);
  try {
    const response = await client.request({
      command: 'path_find', subcommand: 'create',
      source_account: source, destination_account: destination, destination_amount: amount
    } as never);
    if (current?.handler === handler) deliver((response as {result: PathUpdate}).result);
  } catch (err) {
    if (current?.handler === handler) onError(err as Error);
  }
}
