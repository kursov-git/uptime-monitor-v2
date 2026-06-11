import type { AxiosRequestHeaders, AxiosResponse } from 'axios';

export function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
    return {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
            headers: {} as AxiosRequestHeaders,
        },
    };
}
