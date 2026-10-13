import type { RequestHandler } from 'express';

/** 아직 구현되지 않은 엔드포인트. specId는 backend_기능명세서.xlsx의 ID */
export function notImplemented(specId: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({
      error: { code: 'NOT_IMPLEMENTED', message: `${specId} 미구현`, details: { specId } },
    });
  };
}
