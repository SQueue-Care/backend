import { BillStatus, PaymentType } from "@prisma/client";
import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination";

export const listBillsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(BillStatus).optional(),
  paymentType: z.nativeEnum(PaymentType).optional(),
});

export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;

export const billIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const patientIdParamSchema = z.object({
  patientId: z.string().cuid(),
});

export const payBillSchema = z.object({
  paymentMethod: z.enum(["CASHIER", "ONLINE_DEMO"]).optional(),
  notes: z.string().max(500).optional(),
});

export const createBillSchema = z.object({
  queueId: z.string().cuid(),
  paymentType: z.nativeEnum(PaymentType).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().int().positive().default(1),
        unitPrice: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  notes: z.string().max(1000).optional(),
});

export const updateBillSchema = z.object({
  status: z.nativeEnum(BillStatus).optional(),
  sepNumber: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().int().positive().default(1),
        unitPrice: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

export type PayBillInput = z.infer<typeof payBillSchema>;
export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
