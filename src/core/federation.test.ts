import {describe, expect, it} from 'vitest';
import {parseFederationAddress} from './federation';

describe('federation address', () => {
  it('splits a name and a public domain', () => {
    expect(parseFederationAddress('bob@example.com')).toEqual({name: 'bob', domain: 'example.com'});
    expect(parseFederationAddress(' bob@pay.example.co.uk ')).toEqual({name: 'bob', domain: 'pay.example.co.uk'});
    expect(parseFederationAddress('bob@example.xn--p1ai')).toEqual({name: 'bob', domain: 'example.xn--p1ai'});
  });

  it('rejects anything that is not a public host name', () => {
    for (const value of [
      'bob', '@example.com', 'bob@', 'a@b@example.com', 'bo b@example.com', 'bob@localhost', 'bob@127.0.0.1', 'bob@10.0.0.10',
      'bob@example.com:8080', 'bob@example.com/path', 'bob@-bad.example', 'bob@exa mple.com', 'bob@example..com'
    ]) {
      expect(parseFederationAddress(value)).toBeNull();
    }
  });
});
