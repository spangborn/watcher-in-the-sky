/** Format a date in the container's local time (ISO-like: YYYY-MM-DDTHH:mm:ss.sss). */
export function formatLocalTime(d: Date): string {
    const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
