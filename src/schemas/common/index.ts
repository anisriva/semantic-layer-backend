import { z } from "zod";

// Common pagination schema
export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
