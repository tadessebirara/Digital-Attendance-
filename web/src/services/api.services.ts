import apiClient from '../api/client';

export const authService = {
  login: (credentials: any) => apiClient.post('/auth/login', credentials),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'), // If backend supports it
  changePassword: (data: any) => apiClient.post('/auth/change-password', data),
  approveAccount: (id: number, data: any) => apiClient.post(`/auth/approve-account/${id}`, data),
  getPendingAccounts: () => apiClient.get('/auth/pending-accounts'),
};

export const userService = {
  getAll: (params?: any) => apiClient.get('/users', { params }),
  getProfile: () => apiClient.get('/users/profile/me'),
  updateProfile: (data: any) => apiClient.put('/users/profile/me', data),
  updateAvatar: (fd: FormData) => apiClient.post('/users/profile/avatar', fd, { 
    headers: { 'Content-Type': 'multipart/form-data' } 
  }),
};

export const attendanceService = {
  getMonitoring: (date: string) => apiClient.get(`/attendance?date=${date}`),
  getUserAttendance: (userId: number, params: any) => apiClient.get('/attendance', { params: { ...params, userId } }),
  getManualCheckin: (data: any) => apiClient.post('/attendance/manual-checkin', data),
  getAdminStats: () => apiClient.get('/dashboard/admin'),
  getHRStats: () => apiClient.get('/dashboard/hr'),
};

export const notificationService = {
  getAll: (params?: any) => apiClient.get('/notifications', { params }),
  getUnreadCount: () => apiClient.get('/notifications/unread'),
  markAsRead: (id: number) => apiClient.post(`/notifications/${id}/read`),
  markAllAsRead: () => apiClient.post('/notifications/read-all'),
  delete: (id: number) => apiClient.delete(`/notifications/${id}`),
};

export const announcementService = {
  getAll: (params?: any) => apiClient.get('/announcements', { params }),
  getById: (id: number) => apiClient.get(`/announcements/${id}`),
  create: (data: any) => apiClient.post('/announcements', data),
  update: (id: number, data: any) => apiClient.put(`/announcements/${id}`, data),
  delete: (id: number) => apiClient.delete(`/announcements/${id}`),
  exportCsv: () => apiClient.get('/announcements/export/csv', { responseType: 'blob' }),
};
