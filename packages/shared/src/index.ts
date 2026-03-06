export type Role = 'ADMIN' | 'VIEWER';

export interface User {
    id: string;
    username: string;
    role: Role;
    createdAt: string;
    apiKey?: {
        id: string;
        key: string;
        createdAt: string;
        revokedAt: string | null;
    } | null;
}

export interface CheckResult {
    id: string;
    monitorId: string;
    timestamp: string;
    isUp: boolean;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
}

export interface Monitor {
    id: string;
    name: string;
    url: string;
    method: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string | null;
    headers: string | null;

    authMethod: string;
    authUrl: string | null;
    authPayload: string | null;
    authTokenRegex: string | null;

    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastCheck: CheckResult | null;
    flappingState?: {
        isFlapping: boolean;
        consecutiveFailures: number;
        firstFailureTime: string | null;
        lastError: string | null;
    } | null;
}

export interface MonitorFormData {
    name: string;
    url: string;
    method: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string;
    headers: string;

    authMethod: string;
    authUrl: string;
    authPayload: string;
    authTokenRegex: string;
}

export interface AuditLogEntry {
    id: string;
    action: string;
    details: string | null;
    userId: string | null;
    user: { username: string } | null;
    ipAddress: string | null;
    timestamp: string;
}

export interface NotificationSettings {
    telegramBotToken: string;
    telegramChatId: string;
    telegramEnabled: boolean;
    zulipApiKey: string;
    zulipBotEmail: string;
    zulipServerUrl: string;
    zulipStream: string;
    zulipTopic: string;
    zulipEnabled: boolean;
    flappingFailCount: number;
    flappingIntervalSec: number;
    retentionDays: number;
}

export interface StatsResponse {
    results: CheckResult[];
    total: number;
    limit: number;
    offset: number;
    overallUptimePercent: string;
    overallAvgResponseMs: number;
}

export interface NotificationHistoryEntry {
    id: string;
    monitorId: string | null;
    channel: string;
    status: 'SUCCESS' | 'FAILED';
    error: string | null;
    timestamp: string;
}
