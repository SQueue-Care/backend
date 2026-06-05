import { z } from "zod";

/** Selaras SmartQueue POST /cdss/recommend */
export const recommendSchema = z.object({
  gejala: z.string().trim().min(3, "Gejala minimal 3 karakter"),
  umur: z.number().int().min(0).max(120).optional(),
  jenis_kelamin: z.enum(["L", "P"]).optional(),
  patientId: z.string().optional(),
  queueId: z.string().optional(),
});

export type RecommendInput = z.infer<typeof recommendSchema>;

/** Alias kompatibilitas — catatan klinis dipetakan ke gejala di service */
export const analyzeNotesSchema = z.object({
  notes: z.string().trim().min(3, "Catatan minimal 3 karakter"),
  patientId: z.string().optional(),
  queueId: z.string().optional(),
});

export type AnalyzeNotesInput = z.infer<typeof analyzeNotesSchema>;
