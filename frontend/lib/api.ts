import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Tự động đính kèm JWT từ localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Tự động logout khi token hết hạn
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// API endpoints
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
};

export const scheduleApi = {
  list: (params: { year: number; month: number; departmentId?: string }) =>
    api.get('/schedules', { params }).then((r) => r.data),
  create: (data: any) => api.post('/schedules', data).then((r) => r.data),
  bulkCreate: (schedules: any[]) =>
    api.post('/schedules/bulk', { schedules }).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/schedules/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/schedules/${id}`).then((r) => r.data),
  approve: (id: string, comment?: string) =>
    api.post(`/schedules/${id}/approve`, { comment }).then((r) => r.data),
  submitMonth: (year: number, month: number) =>
    api.post('/schedules/submit-month', { year, month }).then((r) => r.data),
};

export const reportApi = {
  monthly: (params: { year: number; month: number; departmentId?: string }) =>
    api.get('/reports/monthly', { params }).then((r) => r.data),
  exportExcel: (params: { year: number; month: number; departmentId?: string }) =>
    api.get('/reports/export', { params, responseType: 'blob' }).then((r) => r.data),
  reconciliation: (params: { year: number; month: number; departmentId?: string }) =>
    api.get('/reports/reconciliation', { params }).then((r) => r.data),
};

export const userApi = {
  list: (departmentId?: string) =>
    api.get('/users', { params: { departmentId } }).then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/users/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};

export const swapApi = {
  list: (status?: string) => api.get('/swaps', { params: { status } }).then(r=>r.data),
  create: (data: { scheduleId:string; targetUserId:string; reason?:string }) =>
    api.post('/swaps', data).then(r=>r.data),
  approve: (id: string, note?: string) => api.post(`/swaps/${id}/approve`, { note }).then(r=>r.data),
  reject: (id: string, note?: string) => api.post(`/swaps/${id}/reject`, { note }).then(r=>r.data),
  cancel: (id: string) => api.delete(`/swaps/${id}`).then(r=>r.data),
};

export const scheduleExtraApi = {
  lockStatus: (params: { year:number; month:number; departmentId?:string }) =>
    api.get('/schedules/lock-status', { params }).then(r=>r.data),
  duplicateFrom: (data: { fromYear:number; fromMonth:number; toYear:number; toMonth:number; departmentId?:string }) =>
    api.post('/schedules/duplicate-from', data).then(r=>r.data),
};

export const departmentApi = {
  list: () => api.get('/departments').then((r) => r.data),
  create: (data: any) => api.post('/departments', data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/departments/${id}`, data).then((r) => r.data),
};
