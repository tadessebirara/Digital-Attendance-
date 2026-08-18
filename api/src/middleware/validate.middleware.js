const { z } = require('zod');

/**
 * Zod Validation Middleware
 * Validates req.body / req.query / req.params against the provided schema.
 * Only replaces the parts that were actually declared in the schema —
 * if body/query/params are not in the schema, the originals are preserved.
 */
const validate = (schema) => (req, res, next) => {
  try {
    const result = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Only overwrite the fields that the schema explicitly declares.
    // This prevents losing req.query or req.params on routes where the schema
    // only validates req.body (and vice-versa).
    if (result.body   !== undefined) req.body   = result.body;
    if (result.query  !== undefined) req.query  = result.query;
    if (result.params !== undefined) req.params = result.params;

    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: error.issues.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(error);
  }
};

module.exports = validate;
