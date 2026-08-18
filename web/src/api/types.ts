import type { AxiosResponse } from 'axios';

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string | null;
  code?: string;
};

export type ApiAxiosResponse<T> = AxiosResponse<ApiResponse<T>>;
