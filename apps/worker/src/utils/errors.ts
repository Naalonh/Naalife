export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new AppError(400, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
