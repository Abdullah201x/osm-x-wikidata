import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadScript } from './load-script.js';

let OsmAuth;
let TagRepairDialog;
let TRANSLATIONS;

beforeAll(() => {
  ({ TRANSLATIONS } = loadScript('translations.js', ['TRANSLATIONS']));
  OsmAuth = loadScript('osm_oauth.js', ['OsmAuth']).OsmAuth;
  ({ TagRepairDialog } = loadScript('tag_repair_dialog.js', ['TagRepairDialog']));
});

const NODE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6">
  <node id="123" version="7" lat="16.89" lon="42.55">
    <tag k="name" v="Jizan"/>
    <tag k="place" v="city"/>
    <tag k="wikidata" v="Q27660"/>
  </node>
</osm>`;

/** fetch mock for one element; records every write. */
function mockOsm({ elementXml = NODE_XML, updateStatus = 200 } = {}) {
  const calls = { get: 0, changeset: null, update: null, closed: false };
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    if (u.endsWith('/api/0.6/node/123') && method === 'GET') {
      calls.get += 1;
      return { ok: true, status: 200, text: async () => elementXml };
    }
    if (u.endsWith('/api/0.6/changeset/create')) {
      calls.changeset = init.body;
      return { ok: true, status: 200, text: async () => '555' };
    }
    if (u.endsWith('/api/0.6/node/123') && method === 'PUT') {
      calls.update = init.body;
      return updateStatus === 200
        ? { ok: true, status: 200, text: async () => '8' }
        : { ok: false, status: updateStatus, text: async () => 'Version mismatch: Provided 7, server had: 8' };
    }
    if (u.endsWith('/api/0.6/changeset/555/close')) {
      calls.closed = true;
      return { ok: true, status: 200, text: async () => '' };
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  }));
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  OsmAuth.ENVIRONMENT = 'production';
});
afterEach(() => vi.unstubAllGlobals());

describe('OsmAuth.diffTags', () => {
  it('classifies add / modify / delete / same in first-seen key order', () => {
    const diff = OsmAuth.diffTags(
      [['name', 'A'], ['wikidata', 'Q1'], ['old', 'x']],
      [['name', 'A'], ['wikidata', 'Q2'], ['brand:wikidata', 'Q3']],
    );
    expect(diff).toEqual([
      { key: 'name', before: 'A', after: 'A', op: 'same' },
      { key: 'wikidata', before: 'Q1', after: 'Q2', op: 'modify' },
      { key: 'old', before: 'x', after: null, op: 'delete' },
      { key: 'brand:wikidata', before: null, after: 'Q3', op: 'add' },
    ]);
  });
});

describe('OsmAuth.previewOsmTagRepair', () => {
  it('reads the live element once and writes nothing', async () => {
    const calls = mockOsm();
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'migrate', {
      fromTag: 'wikidata', targetKey: 'is_in:wikidata', newQid: 'Q27660', expectedValue: 'Q27660',
    });
    expect(calls.get).toBe(1);
    expect(calls.changeset).toBeNull();
    expect(calls.update).toBeNull();
    expect(preview.version).toBe('7');
    expect(preview.stale).toBe(false);
    expect(preview.changed).toBe(true);
    expect(preview.liveValue).toBe('Q27660');
    expect(preview.diff.filter((r) => r.op !== 'same')).toEqual([
      { key: 'wikidata', before: 'Q27660', after: null, op: 'delete' },
      { key: 'is_in:wikidata', before: null, after: 'Q27660', op: 'add' },
    ]);
    expect(preview.defaultComment).toContain('Migrate wikidata tag to is_in:wikidata=Q27660');
  });

  it('is stale when the live value differs from what the scan saw', async () => {
    mockOsm();
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata', expectedValue: 'Q999' });
    expect(preview.stale).toBe(true);
    expect(preview.liveValue).toBe('Q27660');
    expect(preview.expectedValue).toBe('Q999');
  });

  it('is stale when the tag was already removed by someone else', async () => {
    mockOsm({ elementXml: NODE_XML.replace('<tag k="wikidata" v="Q27660"/>', '') });
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata', expectedValue: 'Q27660' });
    expect(preview.stale).toBe(true);
    expect(preview.liveValue).toBeNull();
    expect(preview.changed).toBe(false);
  });

  it('rejects unknown repair types before any request', async () => {
    const calls = mockOsm();
    await expect(OsmAuth.previewOsmTagRepair('node/123', 'explode')).rejects.toThrow('Unknown repairType');
    expect(calls.get).toBe(0);
  });
});

describe('OsmAuth.applyOsmTagRepair', () => {
  it('uses the edited comment and keeps the previewed version', async () => {
    localStorage.setItem('osm_access_token', 'tok');
    const calls = mockOsm();
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata', expectedValue: 'Q27660' });
    const res = await OsmAuth.applyOsmTagRepair(preview, { comment: 'Remove deleted QID, checked on site' });

    expect(res.changesetId).toBe('555');
    expect(calls.changeset).toContain('v="Remove deleted QID, checked on site"');
    expect(calls.update).toContain('version="7"');
    expect(calls.update).toContain('changeset="555"');
    expect(calls.update).not.toContain('k="wikidata"');
    expect(calls.closed).toBe(true);
    const [record] = OsmAuth.getChangesetHistory();
    expect(record.isRepair).toBe(true);
    expect(record.repairType).toBe('remove');
    expect(record.comment).toBe('Remove deleted QID, checked on site');
  });

  it('falls back to the default comment when the edited one is blank', async () => {
    localStorage.setItem('osm_access_token', 'tok');
    const calls = mockOsm();
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata' });
    await OsmAuth.applyOsmTagRepair(preview, { comment: '   ' });
    expect(calls.changeset).toContain('Remove invalid wikidata tag (Q27660)');
  });

  it.each([
    ['STALE_ELEMENT', { expectedValue: 'Q1' }, NODE_XML],
    ['NO_CHANGES', {}, NODE_XML.replace('<tag k="wikidata" v="Q27660"/>', '')],
  ])('refuses %s previews without opening a changeset', async (code, extra, xml) => {
    localStorage.setItem('osm_access_token', 'tok');
    const calls = mockOsm({ elementXml: xml });
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata', ...extra });
    await expect(OsmAuth.applyOsmTagRepair(preview)).rejects.toThrow(code);
    expect(calls.changeset).toBeNull();
  });

  it('closes the changeset even when OSM rejects the update (409)', async () => {
    localStorage.setItem('osm_access_token', 'tok');
    const calls = mockOsm({ updateStatus: 409 });
    const preview = await OsmAuth.previewOsmTagRepair('node/123', 'remove', { fromTag: 'wikidata' });
    await expect(OsmAuth.applyOsmTagRepair(preview)).rejects.toThrow('Version mismatch');
    expect(calls.closed).toBe(true);
  });
});

describe('TagRepairDialog', () => {
  const t = () => TRANSLATIONS.en;
  const nextTick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8');
    const start = html.indexOf('<div id="tag-repair-modal"');
    const end = html.indexOf('<!-- Changeset Batch Staging Queue Modal -->');
    document.body.innerHTML = html.slice(start, end);
    document.getElementById('tag-repair-modal').style.display = 'none';
  });

  async function preview(opts = {}) {
    mockOsm(opts.xml ? { elementXml: opts.xml } : {});
    return OsmAuth.previewOsmTagRepair('node/123', opts.type || 'migrate', {
      fromTag: 'wikidata', targetKey: 'is_in:wikidata', newQid: 'Q27660', expectedValue: 'Q27660', ...opts.extra,
    });
  }

  it('renders changed rows first with before/after values as text', async () => {
    const p = await preview({ xml: NODE_XML.replace('v="Jizan"', 'v="&lt;b&gt;Jizan&lt;/b&gt;"') });
    TagRepairDialog.open(p, { t: t(), onConfirm: async () => ({}) });
    const rows = [...document.querySelectorAll('#tag-repair-diff-body tr')];
    expect(rows.map((r) => r.className)).toEqual(['diff-delete', 'diff-add', 'diff-same', 'diff-same']);
    expect(rows[0].dataset.key).toBe('wikidata');
    expect(rows[1].querySelector('.diff-before').textContent).toBe('(absent)');
    expect(rows[1].querySelector('.diff-after').textContent).toBe('Q27660');
    // OSM values are text, never HTML.
    expect(document.querySelector('#tag-repair-diff-body b')).toBeNull();
    expect(document.getElementById('tag-repair-modal').style.display).toBe('flex');
    expect(document.getElementById('tag-repair-comment').value).toBe(p.defaultComment);
    expect(document.getElementById('btn-confirm-tag-repair').disabled).toBe(false);
  });

  it('publishes with the edited comment and resolves with the result', async () => {
    const p = await preview();
    const onConfirm = vi.fn(async () => ({ changesetId: '555' }));
    const result = TagRepairDialog.open(p, { t: t(), onConfirm });
    document.getElementById('tag-repair-comment').value = '  My comment  ';
    document.getElementById('btn-confirm-tag-repair').click();
    await expect(result).resolves.toEqual({ changesetId: '555' });
    expect(onConfirm).toHaveBeenCalledWith('My comment');
    expect(document.getElementById('tag-repair-modal').style.display).toBe('none');
  });

  it('blocks publishing and explains a stale element', async () => {
    const p = await preview({ extra: { expectedValue: 'Q1' } });
    const onConfirm = vi.fn();
    TagRepairDialog.open(p, { t: t(), onConfirm });
    const stale = document.getElementById('tag-repair-stale');
    expect(stale.hidden).toBe(false);
    expect(stale.textContent).toContain('"Q27660"');
    expect(stale.textContent).toContain('"Q1"');
    const btn = document.getElementById('btn-confirm-tag-repair');
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows an upload error in the dialog and allows a retry', async () => {
    const p = await preview();
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error('AUTH_EXPIRED'))
      .mockResolvedValueOnce({ changesetId: '9' });
    const result = TagRepairDialog.open(p, { t: t(), onConfirm });
    document.getElementById('btn-confirm-tag-repair').click();
    await nextTick();
    const err = document.getElementById('tag-repair-error');
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe(TRANSLATIONS.en.tagRepairAuthExpired);
    document.getElementById('btn-confirm-tag-repair').click();
    await expect(result).resolves.toEqual({ changesetId: '9' });
  });

  it('resolves null on cancel, Escape, or when hidden from outside', async () => {
    const p = await preview();
    let r = TagRepairDialog.open(p, { t: t(), onConfirm: vi.fn() });
    document.getElementById('btn-cancel-tag-repair').click();
    await expect(r).resolves.toBeNull();

    r = TagRepairDialog.open(p, { t: t(), onConfirm: vi.fn() });
    document.getElementById('tag-repair-comment').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(r).resolves.toBeNull();

    r = TagRepairDialog.open(p, { t: t(), onConfirm: vi.fn() });
    document.getElementById('tag-repair-modal').style.display = 'none';
    await expect(r).resolves.toBeNull();
  });
});
