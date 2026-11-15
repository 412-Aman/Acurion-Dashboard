// Tamper-evident audit trail. Each event stores the hash of the event before it, so editing,
// deleting or reordering any past event breaks every hash after it. Events are kept newest first.
import { sha256Hex, canonicalJSON } from './sha256.js';

export const GENESIS = '0'.repeat(64);
const body = event => ({ id: event.id, at: event.at, actor: event.actor, action: event.action, detail: event.detail ?? '', prevHash: event.prevHash });

export function hashEvent(event) { return sha256Hex(canonicalJSON(body(event))); }

export function appendEvent(audit, { id, at, actor, action, detail = '' }) {
  const prevHash = audit[0]?.hash || GENESIS;
  const event = { id, at, actor, action, detail, prevHash };
  event.hash = hashEvent(event);
  return [event, ...audit];
}

// Walks oldest to newest. Returns the first broken link, if any.
export function verifyChain(audit) {
  const events = [...audit].reverse();
  let previous = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.hash) return { ok: false, checked: i, brokenAt: event, reason: 'Event has no hash' };
    if (event.prevHash !== previous) return { ok: false, checked: i, brokenAt: event, reason: 'Link to the previous event does not match' };
    if (hashEvent(event) !== event.hash) return { ok: false, checked: i, brokenAt: event, reason: 'Event content was changed after it was recorded' };
    previous = event.hash;
  }
  return { ok: true, checked: events.length, head: previous };
}
