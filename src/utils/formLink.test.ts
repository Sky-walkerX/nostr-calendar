import { describe, expect, it } from "vitest";
import { naddrEncode } from "nostr-tools/nip19";
import {
  buildFormstrUrl,
  extractNaddr,
  extractResponseKey,
  getFormAuthorPubkey,
  getFormCoordinate,
  getFormRelayHints,
  parseFormInput,
} from "./formLink";

const SAMPLE_PUBKEY = "0".repeat(63) + "1"; // valid 64-char hex
const FORM_KIND = 30168;

const SAMPLE_NADDR = naddrEncode({
  kind: FORM_KIND,
  pubkey: SAMPLE_PUBKEY,
  identifier: "demo-form",
  relays: [],
});

describe("extractNaddr", () => {
  it("returns the naddr from a bare string", () => {
    expect(extractNaddr(SAMPLE_NADDR)).toBe(SAMPLE_NADDR);
  });

  it("trims whitespace", () => {
    expect(extractNaddr(`  ${SAMPLE_NADDR}  `)).toBe(SAMPLE_NADDR);
  });

  it("extracts naddr embedded in a Formstr URL (path style)", () => {
    expect(extractNaddr(`https://formstr.app/f/${SAMPLE_NADDR}`)).toBe(
      SAMPLE_NADDR,
    );
  });

  it("extracts naddr embedded in a Formstr URL (hash style)", () => {
    expect(
      extractNaddr(`https://formstr.app/#/forms/view/${SAMPLE_NADDR}`),
    ).toBe(SAMPLE_NADDR);
  });

  it("returns null for empty input", () => {
    expect(extractNaddr("")).toBeNull();
    expect(extractNaddr("   ")).toBeNull();
  });

  it("returns null when no naddr is present", () => {
    expect(extractNaddr("https://formstr.app/")).toBeNull();
    expect(extractNaddr("not a form url")).toBeNull();
  });

  it("returns null when the naddr-shaped string fails to decode", () => {
    expect(extractNaddr("naddr1abcdefghijklmnop")).toBeNull();
  });
});

describe("extractResponseKey", () => {
  it("returns undefined when there is no response key", () => {
    expect(extractResponseKey(SAMPLE_NADDR)).toBeUndefined();
    expect(
      extractResponseKey(`https://formstr.app/f/${SAMPLE_NADDR}`),
    ).toBeUndefined();
  });

  it("reads ?responseKey query param", () => {
    expect(
      extractResponseKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=secret-123`,
      ),
    ).toBe("secret-123");
  });

  it("reads ?viewKey query param (Formstr's legacy format)", () => {
    expect(
      extractResponseKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=4425edf8b0c0ab84f47718452c6dd0fcfb6df2ec73ad868b31eefe0f18abc8f8`,
      ),
    ).toBe("4425edf8b0c0ab84f47718452c6dd0fcfb6df2ec73ad868b31eefe0f18abc8f8");
  });

  it("decodes #nkeys1 hash fragment to viewKey (Formstr's modern format)", async () => {
    // Build a real nkeys blob using the SDK's encoder so the test
    // round-trips through the same TLV path the SDK uses at runtime.
    const { encodeNKeys } = await import(
      "@formstr/sdk/dist/utils/nkeys.js"
    );
    const viewKeyHex =
      "4425edf8b0c0ab84f47718452c6dd0fcfb6df2ec73ad868b31eefe0f18abc8f8";
    const nkeys = encodeNKeys({ viewKey: viewKeyHex });
    expect(
      extractResponseKey(`https://formstr.app/f/${SAMPLE_NADDR}#${nkeys}`),
    ).toBe(viewKeyHex);
  });

  it("prefers nkeys hash over query params when both are present", async () => {
    const { encodeNKeys } = await import(
      "@formstr/sdk/dist/utils/nkeys.js"
    );
    const hashKey = "a".repeat(64);
    const nkeys = encodeNKeys({ viewKey: hashKey });
    expect(
      extractResponseKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=should-be-ignored#${nkeys}`,
      ),
    ).toBe(hashKey);
  });

  it("reads naddr/<key> path style", () => {
    expect(
      extractResponseKey(
        `https://formstr.app/forms/${SAMPLE_NADDR}/secret-123`,
      ),
    ).toBe("secret-123");
  });

  it("decodes percent-encoded keys", () => {
    expect(
      extractResponseKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=a%2Fb`,
      ),
    ).toBe("a/b");
  });
});

describe("parseFormInput", () => {
  it("returns canonical attachment for a bare naddr", () => {
    expect(parseFormInput(SAMPLE_NADDR)).toEqual({ naddr: SAMPLE_NADDR });
  });

  it("preserves response key when present", () => {
    const parsed = parseFormInput(
      `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=k1`,
    );
    expect(parsed).toEqual({ naddr: SAMPLE_NADDR, responseKey: "k1" });
  });

  it("returns null for invalid input", () => {
    expect(parseFormInput("nope")).toBeNull();
    expect(parseFormInput("")).toBeNull();
  });
});

describe("buildFormstrUrl", () => {
  it("builds a base URL when no response key", () => {
    expect(buildFormstrUrl({ naddr: SAMPLE_NADDR })).toBe(
      `https://formstr.app/f/${SAMPLE_NADDR}`,
    );
  });

  it("appends responseKey as ?viewKey= query param", () => {
    expect(buildFormstrUrl({ naddr: SAMPLE_NADDR, responseKey: "a/b" })).toBe(
      `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=a%2Fb`,
    );
  });
});

describe("getFormCoordinate", () => {
  it("returns kind:pubkey:dtag for a valid naddr", () => {
    expect(getFormCoordinate(SAMPLE_NADDR)).toBe(
      `${FORM_KIND}:${SAMPLE_PUBKEY}:demo-form`,
    );
  });

  it("returns null for non-naddr input", () => {
    expect(getFormCoordinate("not-an-naddr")).toBeNull();
    expect(getFormCoordinate("")).toBeNull();
  });
});

describe("getFormRelayHints", () => {
  it("returns the embedded relays", () => {
    const naddr = naddrEncode({
      kind: FORM_KIND,
      pubkey: SAMPLE_PUBKEY,
      identifier: "x",
      relays: ["wss://relay.example"],
    });
    expect(getFormRelayHints(naddr)).toEqual(["wss://relay.example"]);
  });

  it("returns empty array when no relays encoded", () => {
    expect(getFormRelayHints(SAMPLE_NADDR)).toEqual([]);
  });

  it("returns empty array for invalid input", () => {
    expect(getFormRelayHints("garbage")).toEqual([]);
  });
});

describe("getFormAuthorPubkey", () => {
  it("returns the decoded pubkey", () => {
    expect(getFormAuthorPubkey(SAMPLE_NADDR)).toBe(SAMPLE_PUBKEY);
  });

  it("returns null for invalid input", () => {
    expect(getFormAuthorPubkey("garbage")).toBeNull();
    expect(getFormAuthorPubkey("")).toBeNull();
  });
});
