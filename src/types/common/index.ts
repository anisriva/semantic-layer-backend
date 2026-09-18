// API Response Types for consistent typing across controllers

export type ApiErrorResponse = { success: false; error: string };

export type ApiResponse<T = unknown> =
  | { success: true; data?: T }
  | ApiErrorResponse;

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedData<T> {
  data: T[];
  meta: PaginationMeta;
}

export type ApiPaginatedResponse<T = unknown> =
  | ({ success: true } & PaginatedData<T>)
  | ApiErrorResponse;
