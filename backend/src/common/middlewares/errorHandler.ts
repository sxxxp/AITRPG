import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `${req.method} ${req.path} 없음` } });
};

// 오류 응답 형식: { error: { code, message, details? } }
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser 오류 (잘못된 JSON, 크기 초과 등)
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.too.large' ? '요청 본문이 너무 큽니다.' : '요청 본문을 읽을 수 없습니다.';
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } });
};
