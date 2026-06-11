import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type {
    Agent,
    AuditLogEntry,
    CheckResult,
    Monitor,
    MonitorFormData,
    NotificationHistoryEntry,
    NotificationSettings,
    PublicStatusDrilldownResponse,
    PublicStatusResponse,
    Role,
    User,
} from '@uptime-monitor/shared';

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

export interface AuthUser {
    id: string;
    username: string;
    role: Role;
}

export interface AuthMeResponse extends AuthUser {
    createdAt: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    user: AuthUser;
}

export interface AuthRequestConfig extends AxiosRequestConfig {
    skipAuthExpired?: boolean;
}

export interface SuccessResponse {
    success: true;
}

// API instances implementations (backward compatibility wrappers)
export const authApi = {
    get: (url: '/me', config?: AuthRequestConfig) => apiClient.get<AuthMeResponse>(`/auth${url}`, config),
    post: (url: '/login', data: LoginRequest) => apiClient.post<LoginResponse>(`/auth${url}`, data),
    logout: () => apiClient.post<SuccessResponse>('/auth/logout'),
};

export const monitorsApi = {
    get: getMonitors,
    post: (url: '/', data: MonitorFormData) => apiClient.post<Monitor>(`/monitors${url}`, data),
    put: (url: `/${string}`, data: MonitorFormData) => apiClient.put<Monitor>(`/monitors${url}`, data),
    patch: patchMonitor,
    delete: (url: `/${string}`) => apiClient.delete<SuccessResponse>(`/monitors${url}`),
};

export interface MonitorStatsResponse {
    results: CheckResult[];
    total: number;
    limit: number;
    offset: number;
    overallUptimePercent: string;
    overallAvgResponseMs: number;
}

export type MonitorStatsPath = `/${string}/stats?${string}`;
type MonitorGetPath = '/' | MonitorStatsPath | `/${string}`;
type MonitorGetResult<TPath extends MonitorGetPath> =
    TPath extends '/' ? Monitor[] :
        TPath extends MonitorStatsPath ? MonitorStatsResponse :
            Monitor;

function getMonitors<TPath extends MonitorGetPath>(url: TPath): Promise<AxiosResponse<MonitorGetResult<TPath>>> {
    return apiClient.get(`/monitors${url}`);
}

function patchMonitor(url: `/${string}/toggle`): Promise<AxiosResponse<Monitor>>;
function patchMonitor(url: `/${string}/public`, data: { isPublic: boolean }): Promise<AxiosResponse<Monitor>>;
function patchMonitor(url: `/${string}/toggle` | `/${string}/public`, data?: { isPublic: boolean }) {
    return apiClient.patch(`/monitors${url}`, data);
}

export type UserDirectoryEntry = Omit<User, 'apiKey'> & {
    apiKey?: {
        id: string;
        createdAt: string;
        revokedAt: string | null;
    } | null;
};

export interface UserCreateRequest {
    username: string;
    password: string;
    role?: Role;
}

export interface UserRoleUpdateRequest {
    role: Role;
}

export interface UserPasswordUpdateRequest {
    password: string;
}

type UserPatchPath = `/${string}/role` | `/${string}/password`;

function patchUser(url: `/${string}/role`, data: UserRoleUpdateRequest): Promise<AxiosResponse<UserDirectoryEntry>>;
function patchUser(url: `/${string}/password`, data: UserPasswordUpdateRequest): Promise<AxiosResponse<SuccessResponse>>;
function patchUser(url: UserPatchPath, data: UserRoleUpdateRequest | UserPasswordUpdateRequest) {
    return apiClient.patch(`/users${url}`, data);
}

export const usersApi = {
    get: (url: '/') => apiClient.get<UserDirectoryEntry[]>(`/users${url}`),
    post: (url: '/', data: UserCreateRequest) => apiClient.post<UserDirectoryEntry>(`/users${url}`, data),
    patch: patchUser,
    delete: (url: `/${string}`) => apiClient.delete<SuccessResponse>(`/users${url}`),
};

export interface ApiKeySummary {
    id: string;
    userId: string;
    createdAt: string;
    revokedAt: string | null;
}

export interface GeneratedApiKey extends ApiKeySummary {
    key: string;
}

export const apikeysApi = {
    get: (url: '/me') => apiClient.get<ApiKeySummary | null>(`/apikeys${url}`),
    generate: () => apiClient.post<GeneratedApiKey>('/apikeys/generate'),
    revoke: () => apiClient.delete<SuccessResponse>('/apikeys/revoke'),
};

export interface AuditLogResponse {
    logs: AuditLogEntry[];
    total: number;
    limit: number;
    offset: number;
}

export interface AuditQuery {
    limit?: number;
    offset?: number;
}

export type AuditRequestConfig = AxiosRequestConfig<unknown> & {
    params?: AuditQuery;
};

export const auditApi = {
    get: (url: '/', config?: AuditRequestConfig) => apiClient.get<AuditLogResponse>(`/audit${url}`, config),
};

type NotificationSecretFields =
    | 'telegramBotToken'
    | 'telegramChatId'
    | 'zulipApiKey'
    | 'zulipBotEmail'
    | 'zulipServerUrl'
    | 'zulipStream'
    | 'zulipTopic';

export interface NotificationSettingsResponse extends Omit<NotificationSettings, NotificationSecretFields> {
    id: string;
    telegramBotToken: string | null;
    telegramChatId: string | null;
    zulipApiKey: string | null;
    zulipBotEmail: string | null;
    zulipServerUrl: string | null;
    zulipStream: string | null;
    zulipTopic: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export type NotificationSettingsUpdate = Partial<Omit<NotificationSettingsResponse, 'id' | 'createdAt' | 'updatedAt'>>;

export interface NotificationTestResult {
    success: boolean;
    error?: string;
}

export interface TelegramTestRequest {
    botToken: string;
    chatId: string;
}

export interface ZulipTestRequest {
    botEmail: string;
    apiKey: string;
    serverUrl: string;
    stream: string | null;
    topic: string | null;
}

export interface NotificationHistoryResponse {
    history: NotificationHistoryEntry[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

type NotificationsGetPath = '/settings' | `/history?${string}`;
type NotificationsPostPath = '/test/telegram' | '/test/zulip';

type NotificationGetResult<TPath extends NotificationsGetPath> =
    TPath extends '/settings' ? NotificationSettingsResponse : NotificationHistoryResponse;

const getNotifications = <TPath extends NotificationsGetPath>(url: TPath) =>
    apiClient.get<NotificationGetResult<TPath>>(`/notifications${url}`);

function postNotificationTest(url: '/test/telegram', data: TelegramTestRequest): Promise<AxiosResponse<NotificationTestResult>>;
function postNotificationTest(url: '/test/zulip', data: ZulipTestRequest): Promise<AxiosResponse<NotificationTestResult>>;
function postNotificationTest(url: NotificationsPostPath, data: TelegramTestRequest | ZulipTestRequest) {
    return apiClient.post(`/notifications${url}`, data);
}

export const notificationsApi = {
    get: getNotifications,
    put: (url: '/settings', data: NotificationSettingsUpdate) => apiClient.put<NotificationSettingsResponse>(`/notifications${url}`, data),
    post: postNotificationTest,
};

type PublicStatusDrilldownPath = `/status/${string}/drilldown?start=${string}`;

type PublicGetPath = '/status' | PublicStatusDrilldownPath;
type PublicGetResult<TPath extends PublicGetPath> =
    TPath extends '/status' ? PublicStatusResponse : PublicStatusDrilldownResponse;

const getPublic = <TPath extends PublicGetPath>(url: TPath) =>
    apiClient.get<PublicGetResult<TPath>>(`/public${url}`);

export const publicApi = {
    get: getPublic,
};

export interface AgentCreateRequest {
    name: string;
    heartbeatIntervalSec?: number;
    offlineAfterSec?: number;
}

export interface AgentUpdateRequest {
    name?: string;
    heartbeatIntervalSec?: number;
    offlineAfterSec?: number;
}

export interface AgentTokenResponse {
    token: string;
}

export interface AgentCreateResponse extends AgentTokenResponse {
    agent: Agent;
}

export interface AgentRevokeResponse {
    id: string;
    revokedAt: string;
    status: Agent['status'];
}

type AgentPostPath = '/' | `/${string}/rotate-token` | `/${string}/revoke`;

function postAgent(url: '/', data: AgentCreateRequest): Promise<AxiosResponse<AgentCreateResponse>>;
function postAgent(url: `/${string}/rotate-token`): Promise<AxiosResponse<AgentTokenResponse>>;
function postAgent(url: `/${string}/revoke`): Promise<AxiosResponse<AgentRevokeResponse>>;
function postAgent(url: AgentPostPath, data?: AgentCreateRequest) {
    return apiClient.post(`/agents${url}`, data);
}

export const agentsApi = {
    get: (url: '/') => apiClient.get<Agent[]>(`/agents${url}`),
    post: postAgent,
    patch: (url: `/${string}`, data: AgentUpdateRequest) => apiClient.patch<Agent>(`/agents${url}`, data),
    delete: (url: `/${string}`) => apiClient.delete<void>(`/agents${url}`),
};

export type * from '@uptime-monitor/shared';
