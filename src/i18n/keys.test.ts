// Every literal translation key used in the code must exist in all three languages.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import en from './en.json';
import cn from './cn.json';
import jp from './jp.json';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

const used = new Set<string>();
for (const file of sources(join(__dirname, '..'))) {
  const text = readFileSync(file, 'utf8');
  // t('key') or t('key', values); keys built at runtime (t('cat_' + c)) are skipped.
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'\s*[,)]/g)) used.add(m[1]);
  // Keys listed as data: label/title/translationKey fields and toast titles.
  for (const m of text.matchAll(/\b(?:label|title|translationKey|titleKey|messageKey):\s*'([a-z][a-z0-9_]*)'/g)) used.add(m[1]);
  // <PageHeader title="key" sub="key" />
  for (const m of text.matchAll(/\b(?:title|sub)="([a-z][a-z0-9_]*)"/g)) used.add(m[1]);
}

describe('translations', () => {
  for (const [name, table] of Object.entries({en, cn, jp}) as Array<[string, Record<string, string>]>) {
    it(`${name} has every key the code uses`, () => {
      const missing = [...used].filter(key => !(key in table));
      expect(missing).toEqual([]);
    });
    it(`${name} has the same keys as English`, () => {
      expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
    });
  }
});
