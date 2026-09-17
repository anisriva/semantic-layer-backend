import { Request, Response, NextFunction } from "express";
import {
  RepositoryService,
  CreateRepositoryData,
} from "@/services/repository.js";

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
  ): Promise<void> {
    try {
      const { sourceType, gitUrl, localPath, name, description } = req.body;

      if (!name) {
        res.status(400).json({
          error: "name is required",
        });
        return;
      }

      if ((sourceType ?? "LOCAL") === "LOCAL" && !localPath) {
        res.status(400).json({
          error: "localPath is required when sourceType is LOCAL",
        });
        return;
      }

      const data: CreateRepositoryData = {
        sourceType,
        gitUrl,
        localPath,
        name,
        description,
      };

      const repository = await this.repositoryService.createRepository(data);
      res.status(201).json(repository);
    } catch (error) {
      next(error);
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
  ): Promise<void> {
    try {
      const { status, limit, offset } = req.query;

      const repositories = await this.repositoryService.listRepositories({
        status: status as any,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
      });

      res.json(repositories);
    } catch (error) {
      next(error);
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
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Repository ID is required" });
        return;
      }
      const repositoryId: string = Array.isArray(id) ? (id[0] ?? "") : id;
      const repository =
        await this.repositoryService.getRepository(repositoryId);

      if (!repository) {
        res.status(404).json({
          error: "Repository not found",
        });
        return;
      }

      res.json(repository);
    } catch (error) {
      next(error);
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
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Repository ID is required" });
        return;
      }
      const repositoryId: string = Array.isArray(id) ? (id[0] ?? "") : id;
      const { name, description } = req.body;

      const repository = await this.repositoryService.updateRepository(
        repositoryId,
        {
          name,
          description,
        },
      );

      res.json(repository);
    } catch (error) {
      next(error);
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
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Repository ID is required" });
        return;
      }
      const repositoryId: string = Array.isArray(id) ? (id[0] ?? "") : id;
      const repository =
        await this.repositoryService.deleteRepository(repositoryId);

      res.json(repository);
    } catch (error) {
      next(error);
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
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "Repository ID is required" });
        return;
      }
      const repositoryId: string = Array.isArray(id) ? (id[0] ?? "") : id;
      const { commitHead } = req.body ?? {};

      const repository = await this.repositoryService.refreshRepository(
        repositoryId,
        commitHead,
      );
      res.json(repository);
    } catch (error) {
      next(error);
    }
  }
}
