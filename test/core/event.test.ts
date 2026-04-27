import { describe, it, expect } from 'vitest';
import { formatEvent, parseEvent, generateSubject } from '../../src/core/event.js';
import { ValidationError } from '../../src/core/types.js';

describe('formatEvent', () => {
  it('produces YAML body with all fields', () => {
    const body = formatEvent({
      op: 'place',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
      piece: 42,
      slot: [3, 7],
    } as any);
    expect(body).toContain('op: place');
    expect(body).toContain('actor: queelius');
    expect(body).toContain('v: 1');
    expect(body).toContain('piece: 42');
    expect(body).toMatch(/slot:\s*\[\s*3\s*,\s*7\s*\]/);
  });
});

describe('parseEvent', () => {
  it('parses a valid YAML body into an Event', () => {
    const body = 'op: react\nactor: queelius\nts: 2026-04-26T14:23:11Z\nv: 1\ntarget: posts/foo\nvalue: "🔥"\n';
    const event = parseEvent(body, 'abc123');
    expect(event.op).toBe('react');
    expect(event.actor).toBe('queelius');
    expect(event.v).toBe(1);
    expect(event.sha).toBe('abc123');
    expect(event.target).toBe('posts/foo');
  });

  it('throws ValidationError when v is missing', () => {
    const body = 'op: place\nactor: queelius\nts: 2026-04-26T14:23:11Z\n';
    expect(() => parseEvent(body, 'abc')).toThrow(ValidationError);
  });

  it('throws ValidationError on unknown major version', () => {
    const body = 'op: place\nactor: queelius\nts: 2026-04-26T14:23:11Z\nv: 2\n';
    expect(() => parseEvent(body, 'abc')).toThrow(ValidationError);
  });

  it('throws ValidationError on malformed YAML', () => {
    expect(() => parseEvent('not: valid: yaml: here', 'abc')).toThrow(ValidationError);
  });
});

describe('generateSubject', () => {
  it('summarizes a place event', () => {
    const subject = generateSubject({
      op: 'place',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
      piece: 42,
      slot: [3, 7],
    } as any);
    expect(subject).toContain('place');
    expect(subject).toContain('42');
  });

  it('falls back to "<op> event" for unknown ops', () => {
    const subject = generateSubject({
      op: 'mystery',
      actor: 'queelius',
      ts: '2026-04-26T14:23:11Z',
      v: 1,
    } as any);
    expect(subject).toBe('mystery event');
  });
});
