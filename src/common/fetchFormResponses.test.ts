import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock heavy deps before importing — nostr.ts imports many runtime
// modules we don't want to execute in this test. Mirrors the
// `fetchUserFormResponse.test.ts` setup.
const { mockQuerySync } = vi.hoisted(() => ({ mockQuerySync: vi.fn() }));
vi.mock("./nostrRuntime", () => ({
  nostrRuntime: {
    querySync: mockQuerySync,
    subscribe: vi.fn(),
    fetchOne: vi.fn(),
    addEvent: vi.fn(),
  },
}));
vi.mock("./signer", () => ({
  signerManager: {
    getSigner: vi.fn(),
    getSignerRelays: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../stores/relays", () => ({
  useRelayStore: { getState: () => ({ relays: [] }) },
}));
vi.mock("../stores/calendarLists", () => ({ useCalendarLists: {} }));
vi.mock("../stores/eventDetails", () => ({ TEMP_CALENDAR_ID: "tmp" }));
vi.mock("../stores/events", () => ({}));

import { fetchFormResponses } from "./nostr";

const COORD = "30168:abcd:demo";

const make = (id: string, pubkey: string, ts: number) => ({
  id,
  pubkey,
  kind: 1069,
  created_at: ts,
  tags: [["a", COORD]],
  content: "",
  sig: "",
});

describe("fetchFormResponses", () => {
  beforeEach(() => {
    mockQuerySync.mockReset();
  });

  it("returns [] when no responses", async () => {
    mockQuerySync.mockResolvedValue([]);
    const result = await fetchFormResponses(COORD);
    expect(result).toEqual([]);
  });

  it("queries with kind 1069 and #a filter, no author filter", async () => {
    mockQuerySync.mockResolvedValue([]);
    await fetchFormResponses(COORD);
    const [, filter] = mockQuerySync.mock.calls[0];
    expect(filter).toMatchObject({ kinds: [1069], "#a": [COORD] });
    expect((filter as { authors?: unknown }).authors).toBeUndefined();
  });

  it("dedupes by author keeping latest, sorted newest-first", async () => {
    const a1 = make("a1", "alice", 100);
    const a2 = make("a2", "alice", 200);
    const b1 = make("b1", "bob", 150);
    mockQuerySync.mockResolvedValue([a1, b1, a2]);
    const result = await fetchFormResponses(COORD);
    expect(result.map((e) => e.id)).toEqual(["a2", "b1"]);
  });

  it("merges extraRelays with defaults without duplicates", async () => {
    mockQuerySync.mockResolvedValue([]);
    await fetchFormResponses(COORD, [
      "wss://relay.damus.io", // also default
      "wss://relay.custom",
    ]);
    const [relays] = mockQuerySync.mock.calls[0];
    const damusCount = (relays as string[]).filter(
      (r) => r === "wss://relay.damus.io",
    ).length;
    expect(damusCount).toBe(1);
    expect(relays).toContain("wss://relay.custom");
  });
});
