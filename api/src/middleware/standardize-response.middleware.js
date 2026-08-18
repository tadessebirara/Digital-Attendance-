const RESERVED_KEYS = new Set(['success', 'data', 'message', 'error', 'code', 'meta']);

function extractData(body) {
  if (!body || typeof body !== 'object') {
    return body ?? null;
  }

  if ('data' in body) {
    return body.data ?? null;
  }

  const extraEntries = Object.entries(body).filter(([key]) => !RESERVED_KEYS.has(key));
  if (extraEntries.length === 0) {
    return null;
  }

  return Object.fromEntries(extraEntries);
}

/**
 * Standardize every JSON response to:
 * { success: boolean, data: any, message?: string, error?: string, code?: string, meta?: any }
 */
const standardizeResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const hasExplicitSuccess = !!body && typeof body === 'object' && 'success' in body;
    const success = hasExplicitSuccess
      ? Boolean(body.success)
      : res.statusCode >= 200 && res.statusCode < 300;

    const standardized = {
      success,
      data: extractData(body)
    };

    const message = body?.message || (!success ? body?.error : null);
    if (message) standardized.message = message;
    if (body?.error) standardized.error = body.error;
    if (body?.code) standardized.code = body.code;
    if (body?.meta) standardized.meta = body.meta;

    return originalJson(standardized);
  };

  next();
};

module.exports = standardizeResponse;
