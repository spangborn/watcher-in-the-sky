import chalk from 'chalk';

/** Info / section headers */
export const info = (s: string) => console.log(chalk.cyan(s));
/** Success / positive outcomes */
export const success = (s: string) => console.log(chalk.green(s));
/** Warnings (rate limit, skipped) */
export const warn = (s: string) => console.warn(chalk.yellow(s));
/** Errors */
export const err = (s: string) => console.error(chalk.red(s));
/** Dim / secondary */
export const dim = (s: string) => console.log(chalk.dim(s));
/** Highlight a URL/link in a message */
export const link = (s: string) => chalk.cyan(s);

/**
 * Color the curviness value by how close it is to the circling threshold.
 * Far from threshold -> dim; approaching -> yellow; close -> magenta; at/over -> green.
 */
export function curvinessColor(curviness: number, threshold: number): string {
    const ratio = curviness / threshold;
    const value = curviness.toFixed(0);
    if (ratio >= 1) return chalk.green(value);
    if (ratio >= 0.75) return chalk.magenta(value);
    if (ratio >= 0.5) return chalk.yellow(value);
    return chalk.dim(value);
}
