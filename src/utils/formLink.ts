import { nip19 } from "nostr-tools";
// Deep import: SDK doesn't re-export nkeys helpers from its main entry,
// but the file is shipped in dist/. Using the SDK's own implementation
// guarantees the decode matches what Formstr's app uses to encode.
import { decodeNKeys } from "@formstr/sdk/dist/utils/nkeys.js";
import type { IFormAttachment } from "./types";

/**
 * Helpers for converting between user-supplied form references
 * (raw `naddr1...` strings or Formstr URLs) and the canonical
 * `IFormAttachment` shape stored on a calendar event.
 *
 * `IFormAttachment.responseKey` is the form's *viewKey* — the raw
 * NIP-44 key needed to decrypt an encrypted form template. It's named
 * `responseKey` for historical reasons and treated as an opaque string
 * everywhere except when calling the SDK.
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
 * Extracts an optional viewKey (stored as `responseKey` on
 * `IFormAttachment`) from a Formstr URL.
 *
 * Recognised, in priority order, matching Formstr's own URL parser:
 *  1. `#nkeys1...` hash fragment — Formstr's modern share format,
 *     a bech32-TLV blob carrying `viewKey` (and optionally `editKey`).
 *  2. `?viewKey=<hex>` — Formstr's legacy query param.
 *  3. `?responseKey=<value>` — our own `buildFormstrUrl` legacy output;
 *     kept for back-compat with previously-saved attachments.
 *  4. `<naddr>/<value>` path tail — last-resort fallback for
 *     hand-crafted links.
 *
 * The returned string is always the raw viewKey hex (or the opaque
 * value for cases 3/4), suitable for passing to
 * `FormstrSDK.fetchFormWithViewKey`.
 *
 * Returns undefined if no key can be extracted.
 */
export function extractResponseKey(input: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();

  // 1. nkeys1... hash fragment.  Try anywhere in the string so we still
  //    work with naked "naddr#nkeys..." input where there's no scheme.
  const nkeysMatch = trimmed.match(/nkeys1[0-9a-z]+/i);
  if (nkeysMatch) {
    try {
      const decoded = decodeNKeys(nkeysMatch[0]) as { viewKey?: string };
      if (decoded.viewKey) return decoded.viewKey;
    } catch {
      // fall through to other extractors
    }
  }

  // 2. ?viewKey= (Formstr's legacy query param).
  const viewKeyMatch = trimmed.match(/[?&]viewKey=([^&#\s]+)/i);
  if (viewKeyMatch?.[1]) {
    return decodeURIComponent(viewKeyMatch[1]);
  }

  // 3. ?responseKey= (our own legacy output).
  const responseKeyMatch = trimmed.match(/[?&]responseKey=([^&#\s]+)/i);
  if (responseKeyMatch?.[1]) {
    return decodeURIComponent(responseKeyMatch[1]);
  }

  // 4. <naddr>/<key> path-style fallback.
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
 * writing. The viewKey is appended as `?viewKey=...` — Formstr's legacy
 * but still-supported query param — so links round-trip through
 * formstr.app without losing the key.
 */
export function buildFormstrUrl(form: IFormAttachment): string {
  const base = `https://formstr.app/f/${form.naddr}`;
  if (!form.responseKey) return base;
  return `${base}?viewKey=${encodeURIComponent(form.responseKey)}`;
}

/**
 * Decodes an `naddr` to its NIP-01 replaceable-event coordinate string
 * `<kind>:<pubkey>:<dtag>` used for `#a` filter lookups (NIP-101 form
 * responses tag the source form with this coordinate).
 *
 * Returns null if the input is not a valid naddr.
 */
export function getFormCoordinate(naddr: string): string | null {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== "naddr") return null;
    const { kind, pubkey, identifier } = decoded.data;
    return `${kind}:${pubkey}:${identifier}`;
  } catch {
    return null;
  }
}

/**
 * Returns the relay hints encoded inside a form `naddr`, if any.
 * Useful so response-lookup queries reach the same relays that the
 * form template lives on.
 */
export function getFormRelayHints(naddr: string): string[] {
  try {
    const decoded = nip19.decode(naddr);
    if (decoded.type !== "naddr") return [];
    return decoded.data.relays ?? [];
  } catch {
    return [];
  }
}
