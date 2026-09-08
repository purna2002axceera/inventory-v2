export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export class IpcError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'IpcError';
  }
}

/**
 * Unwraps the IpcResult envelope returned by every electronAPI call.
 * Throws IpcError on failure so callers can just await + try/catch,
 * or let a top-level handler catch it and fire a toast.
 */
export async function callIpc<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;

  if (result.ok) {
    return result.data;
  }

  throw new IpcError(result.error.code, result.error.message);
}
