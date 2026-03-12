import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

export function removeToken(): void {
    return;
}

apiClient.interceptors.response.use(
    (res) => res,
    (err) => {
        const requestUrl = String(err.config?.url || '');
        const skipAuthExpired = Boolean(err.config?.skipAuthExpired);
        const isLoginRequest = requestUrl.endsWith('/auth/login');

        if (err.response?.status === 401 && !skipAuthExpired && !isLoginRequest) {
            removeToken();
            window.dispatchEvent(new Event('auth:expired'));
        }
        return Promise.reject(err);
    }
);

// API instances implementations (backward compatibility wrappers)
export const authApi = {
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/auth${url}`, data),
    get: <T = any>(url: string, config?: any) => apiClient.get<T>(`/auth${url}`, config),
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

export const publicApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/public${url}`),
};

export const agentsApi = {
    get: <T = any>(url: string) => apiClient.get<T>(`/agents${url}`),
    post: <T = any>(url: string, data?: any) => apiClient.post<T>(`/agents${url}`, data),
    patch: <T = any>(url: string, data?: any) => apiClient.patch<T>(`/agents${url}`, data),
    delete: <T = any>(url: string) => apiClient.delete<T>(`/agents${url}`),
};

export type * from '@uptime-monitor/shared';
