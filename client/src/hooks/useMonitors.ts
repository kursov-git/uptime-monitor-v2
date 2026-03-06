import { useState, useEffect, useCallback } from 'react';
import { monitorsApi, Monitor, MonitorFormData } from '../api';

export function useMonitors() {
    const [monitors, setMonitors] = useState<Monitor[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchMonitors = useCallback(async () => {
        try {
            setLoading(true);
            const res = await monitorsApi.get('/');
            setMonitors(res.data);
        } catch (err) {
            console.error('Failed to fetch monitors:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const createMonitor = async (data: MonitorFormData) => {
        await monitorsApi.post('/', data);
        await fetchMonitors();
    };

    const updateMonitor = async (id: string, data: MonitorFormData) => {
        await monitorsApi.put(`/${id}`, data);
        await fetchMonitors();
    };

    const deleteMonitor = async (id: string) => {
        await monitorsApi.delete(`/${id}`);
        await fetchMonitors();
    };

    const toggleMonitor = async (id: string) => {
        await monitorsApi.patch(`/${id}/toggle`);
        await fetchMonitors();
    };

    // SSE integration — update monitors in place when broadcast arrives
    const handleSSEUpdate = useCallback((updatedMonitor: Monitor) => {
        setMonitors(prev => {
            const cloned = [...prev];
            const index = cloned.findIndex(m => m.id === updatedMonitor.id);
            if (index !== -1) {
                cloned[index] = { ...cloned[index], ...updatedMonitor };
            }
            return cloned;
        });
    }, []);

    return {
        monitors,
        loading,
        fetchMonitors,
        createMonitor,
        updateMonitor,
        deleteMonitor,
        toggleMonitor,
        handleSSEUpdate,
    };
}
