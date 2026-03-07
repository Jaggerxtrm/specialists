/**
 * Dependency Injection Container
 *
 * Manages the lifecycle and injection of services, repositories, and databases.
 */
import { Database } from 'bun:sqlite';
export interface AppDependencies {
    activityDb: Database;
}
/**
 * Initialize all system dependencies
 */
export declare function initializeDependencies(): AppDependencies;
/**
 * Get the singleton dependencies instance
 */
export declare function getDependencies(): AppDependencies;
/**
 * Cleanup dependencies (close DBs, etc)
 */
export declare function closeDependencies(): void;
//# sourceMappingURL=dependencies.d.ts.map