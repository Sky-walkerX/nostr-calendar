import { describe, expect, it } from "vitest";
import { naddrEncode } from "nostr-tools/nip19";
import {
  buildFormstrUrl,
  extractNaddr,
  extractResponseKey,
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

  it("appends responseKey as query param", () => {
    expect(buildFormstrUrl({ naddr: SAMPLE_NADDR, responseKey: "a/b" })).toBe(
      `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=a%2Fb`,
    );
  });
});
