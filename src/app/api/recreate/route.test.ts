import { describe, expect, it } from "vitest";
import { remakeSchema } from "@/lib/remake-schema";

describe("remakeSchema", () => {
  it("accepte une réponse complète", () => {
    const result = remakeSchema.safeParse({
      hook: "h",
      scenes: [{ start: "0", end: 5, clip: "c", shot: "s", editingNote: "n" }],
      editingScript: ["l1"],
      cta: "c",
      rationale: "r",
    });
    expect(result.success).toBe(true);
  });

  it("applique les valeurs par défaut", () => {
    const result = remakeSchema.parse({ hook: "h", cta: "c" });
    expect(result.onScreenText).toEqual([]);
    expect(result.scenes).toEqual([]);
    expect(result.editingScript).toEqual([]);
    expect(result.rationale).toBe("");
  });

  it("refuse un hook manquant", () => {
    expect(remakeSchema.safeParse({ cta: "c" }).success).toBe(false);
  });
});
