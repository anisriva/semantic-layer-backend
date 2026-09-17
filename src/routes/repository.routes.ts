import { Router } from 'express';
import { RepositoryController } from '@/controllers/repository.controller.js';
import { JobController } from '@/controllers/job.controller.js';

const router = Router();
const repositoryController = new RepositoryController();
const jobController = new JobController();

// POST /api/v1/repositories - Create a new repository
router.post('/', repositoryController.createRepository.bind(repositoryController));

// GET /api/v1/repositories - List all repositories
router.get('/', repositoryController.listRepositories.bind(repositoryController));

// GET /api/v1/repositories/:id - Get a specific repository
router.get('/:id', repositoryController.getRepository.bind(repositoryController));

// PUT /api/v1/repositories/:id - Update repository metadata
router.put('/:id', repositoryController.updateRepository.bind(repositoryController));

// DELETE /api/v1/repositories/:id - Delete a repository
router.delete('/:id', repositoryController.deleteRepository.bind(repositoryController));

// POST /api/v1/repositories/:id/refresh - Trigger a repository refresh
router.post('/:id/refresh', repositoryController.refreshRepository.bind(repositoryController));

// GET /api/v1/repositories/:id/jobs - List jobs for a repository
router.get('/:id/jobs', jobController.listRepositoryJobs.bind(jobController));

export { router as repositoryRoutes };
