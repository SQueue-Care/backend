export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponse<T> {
  status: "success";
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorResponse {
  status: "error";
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export const ApiResponse = {
  success<T>(data: T, meta?: Record<string, unknown>): SuccessResponse<T> {
    return meta ? { status: "success", data, meta } : { status: "success", data };
  },

  paginated<T>(items: T[], pagination: PaginationMeta): SuccessResponse<T[]> {
    return { status: "success", data: items, meta: { pagination } };
  },

  error(message: string, code?: string, details?: unknown): ErrorResponse {
    const err: ErrorResponse["error"] = { message };
    if (code) err.code = code;
    if (details !== undefined) err.details = details;
    return { status: "error", error: err };
  },
};
