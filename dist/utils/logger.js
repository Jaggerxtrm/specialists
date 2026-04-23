import { LOG_PREFIX } from "../constants.js";
/**
 * Logger utility for consistent logging across the application
 */
export const logger = {
    info: (message, ...args) => {
        console.error(`${LOG_PREFIX} [INFO] ${message}`, ...args);
    },
    error: (message, ...args) => {
        console.error(`${LOG_PREFIX} [ERROR] ${message}`, ...args);
    },
    warn: (message, ...args) => {
        console.error(`${LOG_PREFIX} [WARN] ${message}`, ...args);
    },
    debug: (message, ...args) => {
        if (process.env.DEBUG) {
            console.error(`${LOG_PREFIX} [DEBUG] ${message}`, ...args);
        }
    },
    progress: (message) => {
        console.error(`${LOG_PREFIX} [PROGRESS] ${message}`);
    }
};
//# sourceMappingURL=logger.js.map