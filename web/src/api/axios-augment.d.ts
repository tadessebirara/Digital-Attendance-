import 'axios';
import type { ApiResponse } from './types';

declare module 'axios' {
  export interface AxiosInstance {
    get<T = unknown>(url: string, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    delete<T = unknown>(url: string, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    head<T = unknown>(url: string, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    options<T = unknown>(url: string, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    post<T = unknown>(url: string, data?: unknown, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    put<T = unknown>(url: string, data?: unknown, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
    patch<T = unknown>(url: string, data?: unknown, config?: import('axios').AxiosRequestConfig): Promise<import('axios').AxiosResponse<ApiResponse<T>>>;
  }
}
