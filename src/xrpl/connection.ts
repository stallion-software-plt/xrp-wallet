// Connection to the XRPL servers from Settings. Every server is tried at once and the first to
// connect is used. A full-history cluster (xrpl.ws) in the list is also kept as the path-finding node.
import {Client, type LedgerStream} from 'xrpl';
import {getMaxFee, getServers, type Server} from '../core/settings';
import {useApp} from '../state/app';

const CONNECT_TIMEOUT_MS = 30000;
const WAIT_FOR_CLIENT_MS = 20000;
const PATH_NODES = ['xrpl.ws', 'xrplcluster.com'];

let clients: Client[] = [];
let active: Client | null = null;
let pathNode: Client | null = null;
let waiters: Array<() => void> = [];
const connectListeners = new Set<(client: Client) => void>();

function serverUrl(item: Server): string {
  const host = item.server.includes('://') ? item.server : `wss://${item.server}`;
  return item.port ? `${host}:${item.port}` : host;
}

function setOnline() {
  useApp.setState({online: !!active?.isConnected()});
}

async function adopt(client: Client, name: string) {
  active = client;
  console.info(`Connected to ${name}`);
  client.on('connected', setOnline);
  client.on('disconnected', setOnline);
  client.on('error', (...args: unknown[]) => console.error('XRPL client error', ...args));
  client.on('ledgerClosed', (ledger: LedgerStream) => {
    const update: Partial<ReturnType<typeof useApp.getState>> = {ledgerIndex: ledger.ledger_index};
    if (ledger.reserve_base) update.reserveBase = Number(ledger.reserve_base) / 1e6;
    if (ledger.reserve_inc) update.reserveInc = Number(ledger.reserve_inc) / 1e6;
    useApp.setState(update);
  });
  setOnline();
  waiters.splice(0).forEach(resolve => resolve());
  connectListeners.forEach(listener => listener(client));

  try {
    const info = await client.request({command: 'server_info'});
    const validated = info.result.info.validated_ledger;
    if (validated) useApp.setState({reserveBase: validated.reserve_base_xrp, reserveInc: validated.reserve_inc_xrp});
  } catch (e) {
    console.warn('server_info failed', e);
  }
  try {
    const sub = await client.request({command: 'subscribe', streams: ['ledger']});
    useApp.setState({ledgerIndex: (sub.result as {ledger_index?: number}).ledger_index ?? null});
  } catch (e) {
    console.warn('ledger stream failed', e);
  }
}

/** Connects to the servers configured for the current network. */
export function connect(servers: Server[] = getServers()): void {
  disconnect();
  const maxFeeXRP = getMaxFee();
  for (const item of servers) {
    const client = new Client(serverUrl(item), {feeCushion: 1.1, maxFeeXRP, connectionTimeout: CONNECT_TIMEOUT_MS});
    clients.push(client);
    const isPathNode = PATH_NODES.includes(item.server);
    if (isPathNode) pathNode = client;
    client.connect().then(() => {
      if (!clients.includes(client)) {
        void client.disconnect();
      } else if (!active) {
        void adopt(client, item.server);
      } else if (!isPathNode) {
        void client.disconnect();
      }
    }).catch(err => console.warn(`Cannot connect to ${item.server}`, err?.message || err));
  }
}

export function disconnect(): void {
  const old = clients;
  clients = [];
  active = null;
  pathNode = null;
  setOnline();
  old.forEach(c => {
    c.removeAllListeners();
    if (c.isConnected()) void c.disconnect().catch(() => {});
  });
}

/** Runs `listener` for every server that becomes the active connection. */
export function onConnect(listener: (client: Client) => void): () => void {
  connectListeners.add(listener);
  if (active) listener(active);
  return () => connectListeners.delete(listener);
}

/** The active client, waiting for the first connection if needed. */
export async function getClient(): Promise<Client> {
  if (!active) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter(w => w !== done);
        reject(new Error('NotConnectedError'));
      }, WAIT_FOR_CLIENT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      waiters.push(done);
    });
  }
  const client = active!;
  if (!client.isConnected()) await client.connect();
  return client;
}

/** The client used for path finding: a full-function node when configured, else the active one. */
export async function getPathClient(): Promise<Client> {
  if (pathNode?.isConnected()) return pathNode;
  return getClient();
}

export function activeClient(): Client | null {
  return active;
}
