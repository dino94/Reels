import { z } from "zod";

export const analysisSchema = z.object({
  hook: z.string(),
  patternInterrupt: z.string().optional().default(""),
  narrativeStructure: z.string().optional().default(""),
  scenes: z.array(
    z.object({
      start: z.union([z.string(), z.number()]).transform(String),
      end: z.union([z.string(), z.number()]).transform(String),
      description: z.string(),
      purpose: z.string().optional().default(""),
      transition: z.string().optional().default(""),
    }),
  ),
  texts: z.array(z.string()).default([]),
  cta: z.string().default(""),
  emojis: z.array(z.string()).default([]),
  editingStyle: z.string().default(""),
  visualStyle: z.string().default(""),
  soundEffects: z.array(z.string()).optional().default([]),
  music: z.string().default("Non identifiée"),
  targetAudience: z.string().default(""),
  improvementTips: z.array(z.string()).default([]),
  viralScore: z.number().min(0).max(100),
});
