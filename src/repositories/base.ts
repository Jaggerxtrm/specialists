/**
 * Base Repository Pattern
 *
 * Abstract class for data access layers using bun:sqlite.
 */
import { Database } from 'bun:sqlite';

export abstract class BaseRepository {
    protected db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    /**
     * Initialize tables - to be overridden by subclasses
     */
    abstract initializeSchema(): void;

    /**
     * Helper to run a transaction
     */
    protected transaction<T>(fn: () => T): T {
        return this.db.transaction(fn)();
    }
}
