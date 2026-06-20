import { type Server } from 'node:net';
export interface SyncHintFrame {
    event: 'specialists:sync_hint';
    data: {
        repoSlug: string;
    };
}
export type OnHint = (repoSlug: string) => void;
export declare function prototypeEnabled(): boolean;
export declare function connectSubscriber(socketPath: string, onHint: OnHint): {
    close: () => void;
};
export declare function spawnFakeMaterializer(repoSlugs: string[]): {
    server: Server;
    socketPath: string;
    close: () => void;
} | null;
//# sourceMappingURL=subscribe-prototype.d.ts.map