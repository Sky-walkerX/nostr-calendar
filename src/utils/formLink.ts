import { nip19 } from "nostr-tools";
import type { IFormAttachment } from "./types";

/**
 * Helpers for converting between user-supplied form references
 * (raw `naddr1...` strings or Formstr URLs) and the canonical
 * `IFormAttachment` shape stored on a calendar event.
 *
 * The optional `responseKey` is treated as opaque pass-through in this
 * phase — it is preserved if present in the input but never interpreted.
 */

const NADDR_REGEX = /naddr1[0-9a-z]+/i;

/**
 * Extracts an `naddr` from arbitrary user input.
 *
 * Accepts:
 *  - bare `naddr1...`
 *  - Formstr URLs (any path/hash/query variant) containing an `naddr1...`
 *  - leading/trailing whitespace
 *
 * Returns the lowercased naddr if it decodes to a valid Nostr address,
 * otherwise null.
 */
export function extractNaddr(input: string): string | null {
  if (!input) return null;
  const match = input.trim().match(NADDR_REGEX);
  if (!match) return null;
  const candidate = match[0].toLowerCase();
  try {
    const decoded = nip19.decode(candidate);
    if (decoded.type !== "naddr") return null;
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Extracts an optional `responseKey` from a Formstr URL.
 *
 * A response key is recognized in two locations, in order:
 *  1. the `responseKey` query parameter
 *  2. the path/hash segment immediately after the naddr
 *
 * Returns undefined if no response key can be safely extracted.
 */
export function extractResponseKey(input: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  // Try query string first.
  const queryMatch = trimmed.match(/[?&]responseKey=([^&#\s]+)/i);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]);
  }

  // Fall back to "<naddr>/<responseKey>" path/hash style.
  const naddrMatch = trimmed.match(/(naddr1[0-9a-z]+)\/([^/?#\s]+)/i);
  if (naddrMatch?.[2]) {
    return decodeURIComponent(naddrMatch[2]);
  }

  return undefined;
}

/**
 * Parses a user-supplied string (naddr or Formstr URL) into a
 * canonical IFormAttachment. Returns null if no valid naddr is found.
 */
export function parseFormInput(input: string): IFormAttachment | null {
  const naddr = extractNaddr(input);
  if (!naddr) return null;
  const responseKey = extractResponseKey(input);
  return responseKey ? { naddr, responseKey } : { naddr };
}

/**
 * Builds a canonical Formstr URL for a given form attachment.
 * Used for "open in Formstr" links.
 *
 * Path style is `https://formstr.app/f/<naddr>` because that is the
 * variant currently exposed by Formstr's public web app at the time of
 * writing. If Formstr's URL scheme changes, this is the single place to
 * update.
 */
export function buildFormstrUrl(form: IFormAttachment): string {
  const base = `https://formstr.app/f/${form.naddr}`;
  if (!form.responseKey) return base;
  return `${base}?responseKey=${encodeURIComponent(form.responseKey)}`;
}
