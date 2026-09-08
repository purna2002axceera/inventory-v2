const { AppError } = require('../errors');

// Wraps an IPC handler so any thrown error (custom or unexpected)
// gets mapped into the { ok, data } / { ok, error } envelope automatically.
function wrapHandler(fn) {
  return async (event, payload) => {
    try {
      const data = await fn(payload, event);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof AppError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      console.error('Unhandled IPC error:', err);
      return {
        ok: false,
        error: { code: 'UNKNOWN_ERROR', message: err.message || 'An unexpected error occurred.' },
      };
    }
  };
}

module.exports = { wrapHandler };
