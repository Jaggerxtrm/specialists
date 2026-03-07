/**
 * Dependency Injection Container
 *
 * Manages the lifecycle and injection of services, repositories, and databases.
 */
import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger.js';
let dependencies = null;
/**
 * Initialize all system dependencies
 */
export function initializeDependencies() {
    if (dependencies) {
        return dependencies;
    }
    logger.info("Initializing dependencies...");
    // Setup Data Directory
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    // Initialize Databases
    const activityDbPath = path.join(dataDir, 'activity.sqlite');
    logger.debug(`Opening Activity DB at ${activityDbPath}`);
    const activityDb = new Database(activityDbPath);
    // Enable WAL mode for better concurrency
    activityDb.pragma('journal_mode = WAL');
    dependencies = {
        activityDb
    };
    return dependencies;
}
/**
 * Get the singleton dependencies instance
 */
export function getDependencies() {
    if (!dependencies) {
        throw new Error("Dependencies not initialized. Call initializeDependencies() first.");
    }
    return dependencies;
}
/**
 * Cleanup dependencies (close DBs, etc)
 */
export function closeDependencies() {
    if (dependencies) {
        logger.info("Closing dependencies...");
        dependencies.activityDb.close();
        dependencies = null;
    }
}
//# sourceMappingURL=dependencies.js.map