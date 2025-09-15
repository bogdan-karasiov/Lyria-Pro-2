/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Throttles a callback to be called at most once per `delay` milliseconds.
 * Also returns the result of the last "fresh" call...
 */
export function throttle(func, delay) {
    let lastCall = -Infinity;
    let lastResult;
    return (...args) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;
        if (timeSinceLastCall >= delay) {
            lastResult = func(...args);
            lastCall = now;
        }
        return lastResult;
    };
}
