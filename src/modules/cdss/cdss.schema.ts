import { z } from "zod";

export const recommendSchema = z
  .object({
    gejala: z.string().trim().min(3, "Gejala minimal 3 karakter").optional(),
    symptoms: z.array(z.string().min(1)).min(1).optional(),
    patientId: z.string().optional(),
    queueId: z.string().optional(),
    doctorId: z.string().optional(),
  })
  .refine((data) => Boolean(data.gejala?.length) || (data.symptoms?.length ?? 0) > 0, {
    message: "Isi gejala (teks) atau pilih minimal satu gejala",
    path: ["gejala"],
  });

export type RecommendInput = z.infer<typeof recommendSchema>;

export const analyzeNotesSchema = z.object({
  notes: z.string().trim().min(3, "Catatan minimal 3 karakter"),
  patientId: z.string().optional(),
  queueId: z.string().optional(),
});

export type AnalyzeNotesInput = z.infer<typeof analyzeNotesSchema>;
