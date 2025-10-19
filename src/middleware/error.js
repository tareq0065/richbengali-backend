import { UniqueConstraintError, ValidationError } from "sequelize";

export function errorHandler(err, req, res, next) {
  // Duplicate keys (e.g., email already exists)
  if (err instanceof UniqueConstraintError) {
    const errors = (err.errors || []).map((e) => ({
      path: e.path || "unknown",
      message: `${e.path} already exists`,
    }));
    return res.status(409).json({ message: "Validation failed", errors });
  }

  // Sequelize model-level validations (length, notNull, etc.)
  if (err instanceof ValidationError) {
    const errors = (err.errors || []).map((e) => ({
      path: e.path || "unknown",
      message: e.message,
    }));
    return res.status(400).json({ message: "Validation failed", errors });
  }

  // Fallback
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
}
