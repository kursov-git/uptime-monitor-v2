import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

// Token management
export function getToken(): string | null {
    return localStorage.getItem('token');
}

export function setToken(token: string): void {
    localStorage.setItem('token', token);
}

export function removeToken(): void {
    localStorage.removeItem('token');
}

// Auth interceptor
apiClient.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            removeToken();
            window.dispatchEvent(new Event('auth:expired'));
        }
        return Promise.reject(err);
    }
);

// API instances implementations (backward compatibility wrappers)
export const authApi = {
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/auth${url}`, data),
    get: <T = any>(url: string) => apiClient.get<T>(`/auth${url}`),
};

export const monitorsApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/monitors${url}`),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/monitors${url}`, data),
    put: <T = any>(url: string, data?: any) => apiClient.put<T>(`/monitors${url}`, data),
    patch: <T = any>(url: string, data?: any) => apiClient.patch<T>(`/monitors${url}`, data),
    delete: <T = any>(url: string) => apiClient.delete<T>(`/monitors${url}`),
};

export const usersApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/users${url}`),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/users${url}`, data),
    put: <T = any>(url: string, data?: any) => apiClient.put<T>(`/users${url}`, data),
    patch: <T = any>(url: string, data?: any) => apiClient.patch<T>(`/users${url}`, data),
    delete: <T = any>(url: string) => apiClient.delete<T>(`/users${url}`),
};

export const apikeysApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/apikeys${url}`),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/apikeys${url}`, data),
    delete: <T = any>(url: string) => apiClient.delete<T>(`/apikeys${url}`),
};

export const auditApi = {
    get: <T = any>(url: string, config?: any) => apiClient.get<T>(`/audit${url}`, config),
};

export const notificationsApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/notifications${url}`),
    put: <T = any>(url: string, data?: any) => apiClient.put<T>(`/notifications${url}`, data),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/notifications${url}`, data),
};

export const agentsApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/agents${url}`),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/agents${url}`, data),
    patch: <T = any>(url: string, data?: any) => apiClient.patch<T>(`/agents${url}`, data),
    delete: <T = any>(url: string) => apiClient.delete<T>(`/agents${url}`),
};

export type * from '@uptime-monitor/shared';
