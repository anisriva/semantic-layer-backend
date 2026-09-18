import { z } from "zod";
import { paginationSchema } from "../common/index.js";

// List repository jobs query params
export const listRepositoryJobsQuerySchema = paginationSchema.extend({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  type: z.enum(["INDEX", "REFRESH"]).optional(),
});

export type ListRepositoryJobsQuery = z.infer<
  typeof listRepositoryJobsQuerySchema
>;
