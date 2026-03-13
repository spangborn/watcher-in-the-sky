/**
 * Counters and app start time for the /health endpoint.
 */

export const metrics = {
    circlingDetected: 0,
    zigzagDetected: 0,
    errors429: 0,
    errorsNon429: 0,
    startedAt: new Date(),
};

export function incrementCircling(): void {
    metrics.circlingDetected += 1;
}

export function incrementZigzag(): void {
    metrics.zigzagDetected += 1;
}

export function increment429(): void {
    metrics.errors429 += 1;
}

export function incrementNon429(): void {
    metrics.errorsNon429 += 1;
}
