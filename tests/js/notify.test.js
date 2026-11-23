import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './load-script.js';

let Notify;
let i18n;
beforeAll(() => {
  ({ i18n } = loadScript('translations.js', ['TRANSLATIONS', 'i18n']));
  loadScript('tools.js', ['escapeHtml', 'icon', 'safeUrl', 'commonsImageUrl']);
  ({ Notify } = loadScript('notify.js', ['Notify']));
});

const toasts = () => [...document.querySelectorAll('#toast-region .toast')];

beforeEach(() => Notify.clear());
afterEach(() => vi.useRealTimers());

describe('Notify', () => {
  it('renders message text literally, never as HTML', () => {
    Notify.error('<img src=x onerror="alert(1)">');
    const [toast] = toasts();
    expect(toast.querySelector('img')).toBeNull();
    expect(toast.querySelector('.toast-text').textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it('errors are assertive and stay until dismissed', () => {
    vi.useFakeTimers();
    Notify.error('boom');
    vi.advanceTimersByTime(60_000);
    const [toast] = toasts();
    expect(toast.getAttribute('role')).toBe('alert');
    toast.querySelector('.toast-close').click();
    expect(toasts()).toHaveLength(0);
  });

  it('success and info are polite and auto-dismiss', () => {
    vi.useFakeTimers();
    Notify.success('saved');
    Notify.info('fyi');
    expect(toasts().map((t) => t.getAttribute('role'))).toEqual(['status', 'status']);
    vi.advanceTimersByTime(6_500);
    expect(toasts()).toHaveLength(0);
  });

  it('runs the action (e.g. Retry) and dismisses the toast', () => {
    const retry = vi.fn();
    Notify.error('failed', { action: { label: 'Retry', onClick: retry } });
    toasts()[0].querySelector('.toast-action').click();
    expect(retry).toHaveBeenCalledOnce();
    expect(toasts()).toHaveLength(0);
  });

  it('only renders http(s) links', () => {
    Notify.success('ok', { link: { href: 'https://editgroups.toolforge.org/b/CB/x/', label: 'EditGroups' } });
    Notify.success('ok', { link: { href: 'javascript:alert(1)', label: 'bad' } });
    const [good, bad] = toasts();
    expect(good.querySelector('a.toast-link').getAttribute('href')).toBe('https://editgroups.toolforge.org/b/CB/x/');
    expect(good.querySelector('a.toast-link').rel).toBe('noopener');
    expect(bad.querySelector('a')).toBeNull();
  });

  it('keeps at most four toasts, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) Notify.info(`m${i}`);
    expect(toasts().map((t) => t.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('m5')])
    );
    expect(toasts()).toHaveLength(4);
    expect(toasts()[0].textContent).toContain('m2');
  });
});

describe('i18n', () => {
  it('fills {placeholders} in the active language', () => {
    expect(i18n('loadFailed', { country: 'Oman' })).toContain('Oman');
  });

  it('leaves unknown placeholders visible and falls back to the key', () => {
    expect(i18n('loadFailed')).toContain('{country}');
    expect(i18n('no_such_key_xyz')).toBe('no_such_key_xyz');
  });
});
