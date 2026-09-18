import { z } from "zod";
import { paginationSchema } from "../common/index.js";

// Repository source types from Prisma
const repositorySourceTypeSchema = z.enum(["LOCAL", "GIT"]);

// Create repository request body
export const createRepositorySchema = z
  .object({
    sourceType: repositorySourceTypeSchema.optional(),
    gitUrl: z.string().url("Invalid git URL format").optional(),
    localPath: z.string().min(1, "Local path is required").optional(),
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      const sourceType = data.sourceType ?? "LOCAL";
      if (sourceType === "LOCAL" && !data.localPath) {
        return false;
      }
      if (sourceType === "GIT" && !data.gitUrl) {
        return false;
      }
      return true;
    },
    {
      message:
        "localPath is required when sourceType is LOCAL, gitUrl is required when sourceType is GIT",
    },
  );

export type CreateRepositoryBody = z.infer<typeof createRepositorySchema>;

// List repositories query params
export const listRepositoriesQuerySchema = paginationSchema.extend({
  status: z.enum(["NOT_READY", "READY", "ERROR"]).optional(),
});

export type ListRepositoriesQuery = z.infer<typeof listRepositoriesQuerySchema>;

// Update repository request body
export const updateRepositorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

export type UpdateRepositoryBody = z.infer<typeof updateRepositorySchema>;

// Refresh repository request body
export const refreshRepositorySchema = z.object({
  commitHead: z.string().min(1).optional(),
});

export type RefreshRepositoryBody = z.infer<typeof refreshRepositorySchema>;
