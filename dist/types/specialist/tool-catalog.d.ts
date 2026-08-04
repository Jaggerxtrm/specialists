import * as z from 'zod';
export declare const ToolCatalogSchema: z.ZodObject<{
    catalog: z.ZodEnum<["native", "gitnexus"]>;
    package: z.ZodString;
    version: z.ZodString;
    precedence: z.ZodNumber;
    source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    catalog: z.ZodEnum<["native", "gitnexus"]>;
    package: z.ZodString;
    version: z.ZodString;
    precedence: z.ZodNumber;
    source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    catalog: z.ZodEnum<["native", "gitnexus"]>;
    package: z.ZodString;
    version: z.ZodString;
    precedence: z.ZodNumber;
    source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
}, z.ZodTypeAny, "passthrough">>;
export declare const ToolCatalogIndexSchema: z.ZodObject<{
    precedence_order: z.ZodArray<z.ZodEnum<["native", "gitnexus"]>, "many">;
    default_overrides: z.ZodOptional<z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodObject<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    catalogs: z.ZodArray<z.ZodObject<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    precedence_order: z.ZodArray<z.ZodEnum<["native", "gitnexus"]>, "many">;
    default_overrides: z.ZodOptional<z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodObject<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    catalogs: z.ZodArray<z.ZodObject<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    precedence_order: z.ZodArray<z.ZodEnum<["native", "gitnexus"]>, "many">;
    default_overrides: z.ZodOptional<z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodObject<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        denied_natives_when_extension: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        denied_natives_mode: z.ZodOptional<z.ZodEnum<["soft", "hard"]>>;
    }, z.ZodTypeAny, "passthrough">>>>;
    catalogs: z.ZodArray<z.ZodObject<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        catalog: z.ZodEnum<["native", "gitnexus"]>;
        package: z.ZodString;
        version: z.ZodString;
        precedence: z.ZodNumber;
        source_tiers: z.ZodRecord<z.ZodEnum<["READ_ONLY", "LOW", "MEDIUM", "HIGH"]>, z.ZodArray<z.ZodString, "many">>;
    }, z.ZodTypeAny, "passthrough">>, "many">;
}, z.ZodTypeAny, "passthrough">>;
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;
export type ToolCatalogIndex = z.infer<typeof ToolCatalogIndexSchema>;
/**
 * §3.0 conflict resolution:
 * (1) most restrictive wins for tool inclusion
 * (2) exception: runtime health degradation or catalog incompatibility restores native fallbacks
 * (3) hard-deny in specialist override does not override runtime health downgrade
 */
export declare const SPECIALIST_TOOL_PRECEDENCE: readonly ["native", "gitnexus"];
export declare function validateToolCatalogIndex(value: unknown): ToolCatalogIndex;
export declare function loadToolCatalogIndex(jsonText: string): ToolCatalogIndex;
//# sourceMappingURL=tool-catalog.d.ts.map