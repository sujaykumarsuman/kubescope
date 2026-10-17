import { afterEach, describe, expect, it } from "vitest";

// Guards the test environment itself: vitest's jsdom environment drops
// localStorage/sessionStorage from the global on a newer Node (see setup.ts), so
// these assert the Web Storage globals are the real jsdom Storage on whatever
// Node runs the suite — Node 20 in CI, newer locally.
describe("Web Storage globals", () => {
  for (const [name, storage] of [
    ["localStorage", () => localStorage],
    ["sessionStorage", () => sessionStorage],
  ] as const) {
    describe(name, () => {
      it("is jsdom's Storage, not a stub", () => {
        expect(storage()).toBeInstanceOf(Storage);
      });

      it("round-trips values and tracks length", () => {
        const s = storage();
        s.clear();
        expect(s.length).toBe(0);
        s.setItem("a", "1");
        expect(s.getItem("a")).toBe("1");
        expect(s.key(0)).toBe("a");
        expect(s.length).toBe(1);
        s.removeItem("a");
        expect(s.getItem("a")).toBeNull();
        expect(s.length).toBe(0);
      });

      it("coerces values to strings, as the real Storage does", () => {
        const s = storage();
        s.clear();
        s.setItem("n", 42 as unknown as string);
        expect(s.getItem("n")).toBe("42");
        s.clear();
      });
    });
  }

  describe("assignment", () => {
    const real = localStorage;
    afterEach(() => {
      (globalThis as { localStorage: Storage }).localStorage = real;
    });

    it("can still be swapped for a test double", () => {
      const double = { getItem: () => "stubbed" } as unknown as Storage;
      (globalThis as { localStorage: Storage }).localStorage = double;
      expect(localStorage.getItem("anything")).toBe("stubbed");
    });
  });
});
