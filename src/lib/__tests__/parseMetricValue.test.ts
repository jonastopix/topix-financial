import { describe, it, expect, vi } from "vitest";

// reportOverrideHelpers importerer Supabase-klienten på modul-niveau; den
// instantierer en rigtig klient der fejler i test-miljøet. parseMetricValue
// bruger den ikke, så vi stubber modulet væk.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { parseMetricValue } from "../reportOverrideHelpers";

describe("parseMetricValue", () => {
  it("returns null for empty / blank input", () => {
    expect(parseMetricValue("")).toBeNull();
    expect(parseMetricValue("   ")).toBeNull();
  });

  it("parses Danish-formatted positive numbers", () => {
    expect(parseMetricValue("2.500.000")).toBe(2500000);
    expect(parseMetricValue("1.234")).toBe(1234);
  });

  it("parses ASCII-minus negative numbers", () => {
    expect(parseMetricValue("-2.500.000")).toBe(-2500000);
    expect(parseMetricValue("-2.500.000,50")).toBe(-2500000.5);
  });

  it("parses accounting parenthesis notation as negative", () => {
    expect(parseMetricValue("(2.500.000)")).toBe(-2500000);
  });

  it("normalises typographic minus signs to negative numbers", () => {
    expect(parseMetricValue("−2.500.000")).toBe(-2500000); // unicode minus U+2212
    expect(parseMetricValue("–2.500.000")).toBe(-2500000); // en-dash U+2013
  });

  it("strips whitespace used as a thousands separator", () => {
    expect(parseMetricValue("-2 500 000")).toBe(-2500000);
  });

  it("returns undefined for genuine garbage", () => {
    expect(parseMetricValue("abc")).toBeUndefined();
    expect(parseMetricValue("()")).toBeUndefined();
  });
});
