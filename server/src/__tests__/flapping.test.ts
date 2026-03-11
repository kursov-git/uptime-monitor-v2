import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FlappingService } from '../services/flapping';
import prisma from '../lib/prisma';
import { Monitor } from '@prisma/client';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('FlappingService', () => {
    let service: FlappingService;
    let dummyMonitor: Monitor;

    beforeEach(async () => {
        service = new FlappingService(prisma);

        // Clean up DB
        await prisma.notificationHistory.deleteMany();
        await prisma.monitorNotificationOverride.deleteMany();
        await prisma.monitor.deleteMany();
        await prisma.notificationSettings.deleteMany();

        // Create a basic notification setting
        await prisma.notificationSettings.create({
            data: {
                appBaseUrl: 'https://uptime.example.com',
                flappingFailCount: 3,
                flappingIntervalSec: 300,
                telegramEnabled: true,
                telegramBotToken: 'secret_fake_token',
                telegramChatId: '12345',
            }
        });

        // Create a dummy monitor
        dummyMonitor = await prisma.monitor.create({
            data: {
                name: 'Flapping Test Monitor',
                url: 'http://flap.com',
                method: 'GET',
            }
        });

        // Reset the static states map in FlappingService
        (FlappingService as any).states = new Map();
        vi.clearAllMocks();

        // Mock successful axios requests
        mockedAxios.post.mockResolvedValue({ data: { ok: true, result: 'success' } });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should NOT notify on the first or second failure (requires 3)', async () => {
        await service.handleCheckResult(dummyMonitor, false, 'Connection Timeout');
        await service.handleCheckResult(dummyMonitor, false, 'Connection Timeout 2');

        const state = FlappingService.getDiagnosticState(dummyMonitor.id);
        expect(state?.consecutiveFailures).toBe(2);
        expect(state?.notified).toBe(false);

        // Verify that notification wasn't sent
        expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should notify on the third consecutive failure', async () => {
        await service.handleCheckResult(dummyMonitor, false, 'Err 1');
        await service.handleCheckResult(dummyMonitor, false, 'Err 2');
        await service.handleCheckResult(dummyMonitor, false, 'Err 3', {
            executorLabel: 'cloudruvm1',
            statusCode: 502,
            responseTimeMs: 187,
        });

        const state = FlappingService.getDiagnosticState(dummyMonitor.id);
        expect(state?.consecutiveFailures).toBe(3);
        expect(state?.notified).toBe(true);
        expect(state?.lastError).toBe('Err 3');

        // Note: the Send is an async operation, we can check the history table
        const history = await prisma.notificationHistory.findMany({ where: { monitorId: dummyMonitor.id } });
        expect(history.length).toBe(1);
        expect(history[0].channel).toBe('TELEGRAM');
        expect(history[0].status).toBe('SUCCESS');
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('Check source: cloudruvm1');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('HTTP status: 502');
        expect(mockedAxios.post.mock.calls[0]?.[1]?.text).toContain('Open monitor history');
    });

    it('should send a recovery notification when it comes back UP', async () => {
        // Trigger failures until notified
        await service.handleCheckResult(dummyMonitor, false, 'Down');
        await service.handleCheckResult(dummyMonitor, false, 'Down');
        await service.handleCheckResult(dummyMonitor, false, 'Down');

        let state = FlappingService.getDiagnosticState(dummyMonitor.id);
        expect(state?.notified).toBe(true);

        // Now recover
        await service.handleCheckResult(dummyMonitor, true, null);

        state = FlappingService.getDiagnosticState(dummyMonitor.id);
        expect(state?.notified).toBe(false);
        expect(state?.consecutiveFailures).toBe(0);

        const history = await prisma.notificationHistory.findMany({ where: { monitorId: dummyMonitor.id } });
        // 1 for DOWN, 1 for UP
        expect(history.length).toBe(2);
    });

    it('should not send recovery if it was never notified as DOWN', async () => {
        await service.handleCheckResult(dummyMonitor, false, 'Down once');
        await service.handleCheckResult(dummyMonitor, true, null);

        const history = await prisma.notificationHistory.findMany({ where: { monitorId: dummyMonitor.id } });
        expect(history.length).toBe(0); // 0 because it never reached fail Count of 3
    });
});
