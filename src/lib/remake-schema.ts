import { z } from "zod";

export const remakeSchema = z.object({
  hook: z.string(),
  onScreenText: z.array(z.string()).default([]),
  scenes: z.array(z.object({
    start: z.union([z.string(), z.number()]),
    end: z.union([z.string(), z.number()]),
    clip: z.string(),
    shot: z.string(),
    editingNote: z.string(),
  })).default([]),
  editingScript: z.array(z.string()).default([]),
  cta: z.string(),
  rationale: z.string().default(""),
});
