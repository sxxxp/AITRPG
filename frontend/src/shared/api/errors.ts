import axios from 'axios';
import type { ApiErrorBody } from './types';

export function getErrorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    if (!err.response) return '서버에 연결할 수 없습니다.';
    return err.response.data?.error?.message ?? fallback;
  }
  return fallback;
}

export function getErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

export function getErrorCode(err: unknown): string | undefined {
  return axios.isAxiosError<ApiErrorBody>(err) ? err.response?.data?.error?.code : undefined;
}
