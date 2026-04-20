import { z } from "zod";

export const recommendSchema = z.object({
  symptoms: z.array(z.string().min(1)).min(1, "Minimal satu gejala harus diisi"),
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
});

export type RecommendInput = z.infer<typeof recommendSchema>;
