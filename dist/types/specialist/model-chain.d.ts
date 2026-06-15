export interface ModelChainExecution {
    model: string | null;
    fallback_model?: string | null;
    fallback_models?: readonly string[] | null;
}
export declare function resolveModelChain(execution: ModelChainExecution): string[];
//# sourceMappingURL=model-chain.d.ts.map