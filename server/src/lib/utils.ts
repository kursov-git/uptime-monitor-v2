export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseBoolEnv(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function envBool(
    name: string,
    defaultValue: boolean,
    source: Record<string, string | undefined> = process.env,
): boolean {
    return parseBoolEnv(source[name], defaultValue);
}
