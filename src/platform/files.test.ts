import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createTextFile} from './files';

vi.mock('./desktop', () => ({isDesktop: true, nodeModule: () => fs}));

describe('creating a wallet file', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xrp-wallet-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('writes a new file', async () => {
    const file = path.join(dir, 'new.txt');
    await createTextFile(file, 'encrypted');
    expect(fs.readFileSync(file, 'utf8')).toBe('encrypted');
  });

  it('refuses an existing file and leaves it unchanged', async () => {
    const file = path.join(dir, 'existing.txt');
    fs.writeFileSync(file, 'old wallet');
    await expect(createTextFile(file, 'new wallet')).rejects.toThrow('wallet_file_exists');
    expect(fs.readFileSync(file, 'utf8')).toBe('old wallet');
    expect(fs.readdirSync(dir)).toEqual(['existing.txt']);
  });
});
