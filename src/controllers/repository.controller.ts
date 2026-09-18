import { Request, Response, NextFunction } from "express";
import {
  RepositoryService,
  RepositoryWithDetails,
} from "@/services/repository.js";
import type {
  ApiResponse,
  ApiPaginatedResponse,
} from "@/types/common/index.js";
import { ZodError } from "zod";
import {
  createRepositorySchema,
  listRepositoriesQuerySchema,
  updateRepositorySchema,
  refreshRepositorySchema,
} from "@/schemas/repository/index.js";

export class RepositoryController {
  constructor(
    private readonly repositoryService: RepositoryService = new RepositoryService(),
  ) {}

  /**
   * POST /api/v1/repositories
   * Creates a new repository.
   *
   * `sourceType` defaults to `LOCAL`, which requires `localPath` (an
   * existing directory readable by the worker). `sourceType: "GIT"` is
   * accepted by the schema but rejected until the Git Integration phase
   * implements cloning (see `artifacts/new/2-phased-development-plan.md`).
   */
  async createRepository(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<RepositoryWithDetails>>> {
    try {
      const validatedData = createRepositorySchema.parse(req.body);
      const repository =
        await this.repositoryService.createRepository(validatedData);
      return res.status(201).json({ success: true, data: repository });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * GET /api/v1/repositories
   * Lists all repositories.
   */
  async listRepositories(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<RepositoryWithDetails>>> {
    try {
      const validatedQuery = listRepositoriesQuerySchema.parse(req.query);
      const repositories =
        await this.repositoryService.listRepositories(validatedQuery);

      return res.json({
        success: true,
        data: repositories,
        meta: {
          total: repositories.length,
          limit: validatedQuery.limit ?? repositories.length,
          offset: validatedQuery.offset ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * GET /api/v1/repositories/:id
   * Gets a specific repository.
   */
  async getRepository(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<RepositoryWithDetails>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Repository ID is required" });
      }
      const repositoryId: string = id as string;
      const repository =
        await this.repositoryService.getRepository(repositoryId);

      if (!repository) {
        return res.status(404).json({
          success: false,
          error: "Repository not found",
        });
      }

      return res.json({ success: true, data: repository });
    } catch (error) {
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * PUT /api/v1/repositories/:id
   * Updates repository metadata.
   */
  async updateRepository(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<RepositoryWithDetails>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Repository ID is required" });
      }
      const repositoryId: string = id as string;
      const validatedData = updateRepositorySchema.parse(req.body);

      const repository = await this.repositoryService.updateRepository(
        repositoryId,
        validatedData,
      );

      return res.json({ success: true, data: repository });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * DELETE /api/v1/repositories/:id
   * Deletes a repository.
   */
  async deleteRepository(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<RepositoryWithDetails>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Repository ID is required" });
      }
      const repositoryId: string = id as string;
      const repository =
        await this.repositoryService.deleteRepository(repositoryId);

      return res.json({ success: true, data: repository });
    } catch (error) {
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * POST /api/v1/repositories/:id/refresh
   * Triggers a repository refresh.
   *
   * `commitHead` is optional for `LOCAL` sources (a synthetic marker is
   * generated automatically); `RepositoryService` enforces that it is
   * required for `GIT` sources.
   */
  async refreshRepository(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<RepositoryWithDetails>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Repository ID is required" });
      }
      const repositoryId: string = id as string;
      const validatedData = refreshRepositorySchema.parse(req.body ?? {});

      const repository = await this.repositoryService.refreshRepository(
        repositoryId,
        validatedData.commitHead,
      );
      return res.json({ success: true, data: repository });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }
}
