import { ZodError } from "zod";

/**
 * validate({ body?, query?, params? })
 * Example: router.post('/login', validate({ body: loginSchema }), handler)
 */
export function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: e.errors.map((err) => ({ path: err.path.join("."), message: err.message })),
        });
      }
      next(e);
    }
  };
}
