import { describe, expect, it } from 'vitest';
import {
  FileFormatError,
  parseRecordFile,
  recordDir,
  recordRelPath,
  serializeRecordFile,
  sha256,
  slugify,
} from '../src/files.js';
import type { MemoryRecord } from '../src/types.js';
import { def } from './helpers.js';

// The frontmatter codec is the load-bearing wall of the flat-file brain: a record
// must survive record → markdown → record byte-exactly (field-for-field), because
// the rebuild invariant (delete the .sqlite, lose nothing) rests on it.

function rec(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: '0198f2aa-1111-4222-8333-444455556666',
    type: 'fact',
    title: 'Deploy window',
    content: 'We deploy on Fridays after the standup.',
    scope: 'project',
    truth: 'source',
    sharing: 'personal',
    tags: ['ops', 'deploy'],
    derivedFrom: [],
    provenance: { source: 'wiki', uri: 'https://wiki/deploy', author: 'sam' },
    metadata: { room: 3 },
    createdAt: 1751500000000,
    updatedAt: 1751500001234,
    ...overrides,
  };
}

function roundTrip(r: MemoryRecord): MemoryRecord {
  const text = serializeRecordFile(r);
  const parsed = parseRecordFile(text, 'facts/x.md');
  if (parsed.kind !== 'record') throw new Error('expected a full record');
  return parsed.record;
}

describe('markdown record codec', () => {
  it('round-trips every field exactly', () => {
    const original = rec();
    expect(roundTrip(original)).toEqual(original);
  });

  it('round-trips summaries with derived_from span links and hashes', () => {
    const original = rec({
      truth: 'summary',
      derivedFrom: [
        { id: 'src-1', span: 'chunk:3', hash: sha256('source content') },
        { id: 'src-2' },
      ],
      title: null,
      metadata: {},
      tags: [],
    });
    expect(roundTrip(original)).toEqual(original);
  });

  it('round-trips awkward content: leading #, trailing newlines, unicode, yaml-ish lines', () => {
    for (const content of [
      '# looks like a heading\n\nbut is content',
      'ends with newline\n',
      'ends with two\n\n',
      'naïve café — ünïcode ✓ 中文',
      '---\nid: fake\n---\nnot frontmatter, just content',
      'key: value\nanother: [1, 2]',
    ]) {
      const original = rec({ content, title: null });
      expect(roundTrip(original).content).toBe(content);
    }
  });

  it('is deterministic: same record, same bytes (the content-hash change signal)', () => {
    expect(serializeRecordFile(rec())).toBe(serializeRecordFile(rec()));
    expect(sha256(serializeRecordFile(rec()))).toBe(sha256(serializeRecordFile(rec())));
  });

  it('writes a human-readable file: frontmatter, heading, body, in that order', () => {
    const text = serializeRecordFile(rec());
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('id: 0198f2aa-1111-4222-8333-444455556666');
    expect(text).toContain('truth: source');
    expect(text).toContain('sharing: personal');
    expect(text).toContain('# Deploy window');
    expect(text.endsWith('We deploy on Fridays after the standup.\n')).toBe(true);
  });

  it('adopts plain markdown without frontmatter (title from heading)', () => {
    const parsed = parseRecordFile('# My note\n\nJust a thought.\n', 'notes/n.md');
    expect(parsed.kind).toBe('adopt');
    if (parsed.kind === 'adopt') {
      expect(parsed.title).toBe('My note');
      expect(parsed.content).toBe('Just a thought.');
    }
  });

  it('rejects broken frontmatter loudly, never guessing', () => {
    expect(() => parseRecordFile('---\nid: x\n---\n\nbody\n', 'facts/x.md')).toThrow(
      FileFormatError,
    );
    expect(() =>
      parseRecordFile(
        '---\nid: x\ntype: nonsense\ntruth: source\nsharing: personal\nprovenance:\n  source: s\n---\n\nbody\n',
        'facts/x.md',
      ),
    ).toThrow(/type/);
    expect(() => parseRecordFile('---\nnever terminated\n', 'facts/x.md')).toThrow(/unterminated/);
  });

  it('parses CRLF files (git on Windows) identically to LF', () => {
    const lf = serializeRecordFile(rec());
    const crlf = lf.replace(/\n/g, '\r\n');
    const a = parseRecordFile(lf, 'facts/x.md');
    const b = parseRecordFile(crlf, 'facts/x.md');
    expect(b).toEqual(a);
    expect(sha256(crlf)).toBe(sha256(lf));
  });
});

describe('tree placement', () => {
  it('routes records to the right directory: summaries to notes/, sources by type', () => {
    expect(recordDir({ type: 'document', truth: 'source' })).toBe('sources');
    expect(recordDir({ type: 'fact', truth: 'source' })).toBe('facts');
    expect(recordDir({ type: 'fact', truth: 'summary' })).toBe('notes');
    expect(recordDir({ type: 'document', truth: 'summary' })).toBe('notes');
    expect(recordDir({ type: 'pointer', truth: 'source' })).toBe('pointers');
    expect(recordDir({ type: 'episode', truth: 'source' })).toBe('episodes');
  });

  it('builds readable, id-stable filenames', () => {
    const path = recordRelPath(rec());
    expect(path).toMatch(/^facts[/\\]deploy-window-0198f2aa\.md$/);
    expect(slugify('Héllo,   World!!')).toBe('hello-world');
    expect(slugify('!!!')).toBe('record');
    expect(def(path)).toBe(recordRelPath(rec())); // deterministic
  });
});
