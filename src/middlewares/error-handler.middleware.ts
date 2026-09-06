import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Validation Error',
      error: 'Invalid input data',
      data: err.issues,
    });
    return;
  }

  // Handle known application errors
  if (err instanceof Error) {
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: err.message,
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    error: String(err),
  });
}
