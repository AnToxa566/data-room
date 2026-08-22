import { parseReturnTo } from './return-to.util.js';

describe('parseReturnTo', () => {
  it('accepts a plain in-app relative path', () => {
    expect(parseReturnTo('/folders/abc-123')).toBe('/folders/abc-123');
  });

  it('accepts a relative path with a query string', () => {
    expect(parseReturnTo('/files/abc?foo=bar')).toBe('/files/abc?foo=bar');
  });

  it('rejects a missing value', () => {
    expect(parseReturnTo(undefined)).toBeNull();
  });

  it('rejects a non-string value', () => {
    expect(parseReturnTo(42)).toBeNull();
    expect(parseReturnTo({ path: '/home' })).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseReturnTo('')).toBeNull();
  });

  it('rejects a path that does not start with "/"', () => {
    expect(parseReturnTo('folders/abc')).toBeNull();
    expect(parseReturnTo('evil.example/folders/abc')).toBeNull();
  });

  // The open-redirect vector this guards against: a browser resolves "//host/path" as
  // protocol-relative — same scheme, different origin — not as an in-app path.
  it('rejects a protocol-relative URL ("//host/...")', () => {
    expect(parseReturnTo('//evil.example')).toBeNull();
    expect(parseReturnTo('//evil.example/phishing')).toBeNull();
  });

  // A browser normalizes backslashes to forward slashes when resolving a URL for
  // http(s) — so "/\evil.example" becomes "//evil.example" (the same protocol-relative
  // bypass above) even though the raw string only starts with one "/".
  it('rejects a backslash-based protocol-relative bypass ("/\\host/...")', () => {
    expect(parseReturnTo('/\\evil.example')).toBeNull();
    expect(parseReturnTo('/\\evil.example/phishing')).toBeNull();
    expect(parseReturnTo('/folders/abc\\evil.example')).toBeNull();
  });

  it('rejects an absolute URL smuggled in past the leading-slash check', () => {
    expect(parseReturnTo('https://evil.example')).toBeNull();
    expect(parseReturnTo('/redirect?to=https://evil.example')).toBeNull();
  });
});
