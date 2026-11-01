import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './load-script.js';

let escapeHtml, safeUrl;
beforeAll(() => {
  ({ escapeHtml, safeUrl } = loadScript('tools.js', ['escapeHtml', 'safeUrl', 'MappingTools']));
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('escapes ampersands first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('neutralises a script injection payload', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('"');
  });

  it('renders null and undefined as an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('keeps 0 and false instead of dropping them', () => {
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
  });

  it('leaves Arabic text untouched', () => {
    expect(escapeHtml('مسجد الراجحي')).toBe('مسجد الراجحي');
  });

  it('is safe inside an attribute value built by template string', () => {
    const attr = `data-name="${escapeHtml('a" onmouseover="x')}"`;
    document.body.innerHTML = `<div ${attr}></div>`;
    const el = document.body.firstElementChild;
    expect(el.getAttribute('data-name')).toBe('a" onmouseover="x');
    expect(el.hasAttribute('onmouseover')).toBe(false);
  });
});

describe('safeUrl', () => {
  it.each(['https://example.org/a', 'http://example.org', 'HTTPS://EXAMPLE.ORG'])('allows %s', (u) => {
    expect(safeUrl(u)).toBe(u);
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example', 'ftp://x'])(
    'blocks %s',
    (u) => {
      expect(safeUrl(u)).toBe('');
    }
  );

  it('trims whitespace before checking the scheme', () => {
    expect(safeUrl('  https://example.org  ')).toBe('https://example.org');
    expect(safeUrl('  javascript:alert(1)')).toBe('');
  });

  it('returns an empty string for empty input', () => {
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl(undefined)).toBe('');
  });
});
