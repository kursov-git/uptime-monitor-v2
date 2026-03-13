export type Role = 'ADMIN' | 'VIEWER';
export const CURRENT_AGENT_VERSION = '1.0.0';
export type BodyAssertionType =
    | 'NONE'
    | 'AUTO'
    | 'CONTAINS'
    | 'REGEX'
    | 'JSON_PATH_EQUALS'
    | 'JSON_PATH_CONTAINS';

export interface SslCheckSnapshot {
    expiresAt: string | null;
    daysRemaining: number | null;
    issuer: string | null;
    subject: string | null;
}

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
    sslExpiresAt?: string | null;
    sslDaysRemaining?: number | null;
    sslIssuer?: string | null;
    sslSubject?: string | null;
}

export interface Monitor {
    id: string;
    name: string;
    url: string;
    agentId?: string | null;
    agentName?: string | null;
    method: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string | null;
    bodyAssertionType: BodyAssertionType;
    bodyAssertionPath: string | null;
    headers: string | null;

    authMethod: string;
    authUrl: string | null;
    authPayload: string | null;
    authTokenRegex: string | null;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;

    isActive: boolean;
    isPublic: boolean;
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
    agentId?: string | null;
    method: string;
    intervalSeconds: number;
    timeoutSeconds: number;
    expectedStatus: number;
    expectedBody: string;
    bodyAssertionType: BodyAssertionType;
    bodyAssertionPath: string;
    headers: string;

    authMethod: string;
    authUrl: string;
    authPayload: string;
    authTokenRegex: string;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;
}

export interface Agent {
    id: string;
    name: string;
    status: 'ONLINE' | 'OFFLINE' | string;
    agentVersion: string | null;
    heartbeatIntervalSec: number;
    offlineAfterSec: number;
    lastSeen: string;
    lastSeenIp: string | null;
    lastSeenCountry: string | null;
    lastSeenCity: string | null;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
    _count?: {
        monitors: number;
    };
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
    appBaseUrl: string | null;
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

export interface PublicStatusMonitor {
    id: string;
    name: string;
    url: string;
    method: string;
    isActive: boolean;
    status: 'up' | 'down' | 'paused' | 'unknown';
    lastCheck: CheckResult | null;
    uptimePercent24h: string;
    history24h: PublicStatusBucket[];
}

export interface PublicStatusBucket {
    timestamp: string;
    totalChecks: number;
    upChecks: number;
    uptimePercent: number | null;
    avgResponseTimeMs: number | null;
}

export interface PublicStatusDrilldownFailure {
    timestamp: string;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
}

export interface PublicStatusDrilldownResponse {
    monitorId: string;
    monitorName: string;
    windowStart: string;
    windowEnd: string;
    bucketSizeMinutes: number;
    totalChecks: number;
    upChecks: number;
    uptimePercent: number | null;
    history: PublicStatusBucket[];
    failures: PublicStatusDrilldownFailure[];
}

export interface PublicStatusResponse {
    generatedAt: string;
    monitorCount: number;
    summary: {
        up: number;
        down: number;
        paused: number;
        unknown: number;
    };
    history24h: PublicStatusBucket[];
    monitors: PublicStatusMonitor[];
}

export interface NotificationHistoryEntry {
    id: string;
    monitorId: string | null;
    channel: string;
    status: 'SUCCESS' | 'FAILED';
    error: string | null;
    timestamp: string;
}
