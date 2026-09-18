import { Request, Response } from "express";
import { HealthService } from "@/services/health.service.js";
import type { ApiResponse } from "@/types/common/index.js";

const healthService = new HealthService();

export function healthCheck(
  _req: Request,
  res: Response,
): Response<ApiResponse> {
  const status = healthService.getStatus();
  return res.json({
    success: true,
    data: status,
  });
}
