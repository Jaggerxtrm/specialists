import type { SupervisorStatus } from './supervisor.js';
export declare const CHAIN_KINDS: readonly ["chain", "prep"];
export type ChainKind = (typeof CHAIN_KINDS)[number];
export interface PersistedChainIdentity {
    chain_kind: ChainKind;
    chain_id?: string;
    chain_root_job_id?: string;
    chain_root_bead_id?: string;
}
export interface ChainIdentityResolverInput extends Pick<SupervisorStatus, 'id' | 'bead_id' | 'worktree_path' | 'worktree_owner_job_id' | 'chain_id' | 'chain_root_job_id' | 'chain_root_bead_id'> {
}
export interface ChainRootSnapshot {
    bead_id?: string;
    chain_root_bead_id?: string;
}
export declare function isChainKind(value: string | undefined): value is ChainKind;
export declare function derivePersistedChainIdentity(status: ChainIdentityResolverInput, chainRootSnapshot?: ChainRootSnapshot): PersistedChainIdentity;
//# sourceMappingURL=chain-identity.d.ts.map