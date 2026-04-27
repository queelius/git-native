import YAML from 'yaml';
import { Event, ValidationError } from './types.js';

export function formatEvent(event: Event): string {
  const { sha: _sha, ...payload } = event;
  const doc = YAML.parseDocument(YAML.stringify(payload, { lineWidth: 0 }));
  // Render arrays inline (flow style) while keeping the top-level map in block style.
  YAML.visit(doc, {
    Seq(_key, node) { node.flow = true; },
  });
  return doc.toString();
}

export function parseEvent(body: string, sha: string): Event {
  let parsed: unknown;
  try {
    parsed = YAML.parse(body);
  } catch (e) {
    throw new ValidationError(`Malformed YAML in commit body: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ValidationError('Commit body did not parse as a YAML object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.v !== 'number') {
    throw new ValidationError('Event missing required field "v" (protocol version)');
  }
  if (obj.v !== 1) {
    throw new ValidationError(`Unknown protocol version: ${obj.v}`);
  }
  if (typeof obj.op !== 'string') {
    throw new ValidationError('Event missing required field "op"');
  }
  if (typeof obj.actor !== 'string') {
    throw new ValidationError('Event missing required field "actor"');
  }
  if (typeof obj.ts !== 'string') {
    throw new ValidationError('Event missing required field "ts"');
  }
  return { ...obj, v: 1, sha } as Event;
}

export function generateSubject(event: Event): string {
  switch (event.op) {
    case 'place':
      return `place piece ${event.piece} at slot ${JSON.stringify(event.slot)}`;
    case 'react':
      return `react ${event.value} on ${event.target}`;
    case 'comment':
      return `comment on ${event.target}`;
    default:
      return `${event.op} event`;
  }
}
