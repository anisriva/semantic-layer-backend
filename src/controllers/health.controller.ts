import { Request, Response } from 'express';
import { HealthService } from '@/services/health.service.js';

const healthService = new HealthService();

export function healthCheck(_req: Request, res: Response): void {
  const status = healthService.getStatus();
  res.json({
    status: 'success',
    data: status,
  });
}
