import { describe, expect, it } from "vitest";
import { buildHighlightsFilter } from "@/lib/highlights-filter";

const DIMENSIONS = { width: 1080, height: 1920 };

describe("buildHighlightsFilter", () => {
  it("génère un filtre simple pour un seul passage", () => {
    const { filter, assembledDuration } = buildHighlightsFilter(
      [{ start: 1, end: 3 }],
      DIMENSIONS,
    );
    expect(filter).toContain("[0:v:0]trim=start=1.000:end=3.000");
    expect(filter).not.toContain("split=2[vsrc");
    expect(filter).toContain("null[vout]");
    expect(assembledDuration).toBe(2);
  });

  it("splitte les flux et enchaîne xfade pour plusieurs passages", () => {
    const { filter, assembledDuration } = buildHighlightsFilter(
      [{ start: 0, end: 4 }, { start: 5, end: 7 }],
      DIMENSIONS,
    );
    expect(filter).toContain("[0:v:0]split=2[vsrc0][vsrc1]");
    expect(filter).toContain("[0:a:0]asplit=2[asrc0][asrc1]");
    expect(filter).toContain("xfade=transition=fade:duration=0.500:offset=3.500");
    expect(filter).toContain("acrossfade=d=0.500");
    // 4 s + 2 s - fondu 0,5 s
    expect(assembledDuration).toBeCloseTo(5.5);
  });

  it("limite la durée de transition à la durée des clips", () => {
    const { assembledDuration } = buildHighlightsFilter(
      [{ start: 0, end: 0.4 }, { start: 1, end: 1.4 }],
      DIMENSIONS,
    );
    // transition = min(0,5 ; 0,4 ; 0,4) = 0,4
    expect(assembledDuration).toBeCloseTo(0.4);
  });
});
