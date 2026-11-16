// Consistent JSON error shape: { error: { message, code?, details? } }

export class ApiError extends Error {
  constructor(status, message, code = "ERROR", details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, "BAD_REQUEST", details);
export const unauthorized = (message = "Unauthorized") => new ApiError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Forbidden") => new ApiError(403, message, "FORBIDDEN");
export const notFound = (message = "Not found") => new ApiError(404, message, "NOT_FOUND");
export const tooMany = (message = "Too many requests") => new ApiError(429, message, "TOO_MANY_REQUESTS");

// Wraps async route handlers so rejections reach the error middleware.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route: ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err?.name === "ZodError") {
    return res.status(400).json({
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: err.issues?.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
  }
  // Multer errors
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: { message: "File too large", code: "FILE_TOO_LARGE" } });
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: { message: err.message, code: "UPLOAD_ERROR" } });
  }
  // JsonWebToken errors
  if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
    return res.status(401).json({ error: { message: "Invalid or expired token", code: "INVALID_TOKEN" } });
  }
  // Prisma known errors
  if (err?.code === "P2025") {
    return res.status(404).json({ error: { message: "Record not found", code: "NOT_FOUND" } });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ error: { message: "Record already exists", code: "DUPLICATE" } });
  }

  const status = err?.status ?? 500;
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({
    error: {
      message: status >= 500 ? "Internal server error" : err.message,
      code: err.code ?? "ERROR",
      ...(err.details ? { details: err.details } : {}),
    },
  });
}
