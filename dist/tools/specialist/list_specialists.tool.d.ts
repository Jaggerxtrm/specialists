import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
export declare const listSpecialistsSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<z.ZodEnum<["project", "user", "system", "all"]>>;
}, "strip", z.ZodTypeAny, {
    category?: string | undefined;
    scope?: "system" | "user" | "project" | "all" | undefined;
}, {
    category?: string | undefined;
    scope?: "system" | "user" | "project" | "all" | undefined;
}>;
export declare function createListSpecialistsTool(loader: SpecialistLoader): {
    name: "list_specialists";
    description: string;
    inputSchema: z.ZodObject<{
        category: z.ZodOptional<z.ZodString>;
        scope: z.ZodOptional<z.ZodEnum<["project", "user", "system", "all"]>>;
    }, "strip", z.ZodTypeAny, {
        category?: string | undefined;
        scope?: "system" | "user" | "project" | "all" | undefined;
    }, {
        category?: string | undefined;
        scope?: "system" | "user" | "project" | "all" | undefined;
    }>;
    execute(input: z.infer<typeof listSpecialistsSchema>): Promise<import("../../specialist/loader.js").SpecialistSummary[]>;
};
//# sourceMappingURL=list_specialists.tool.d.ts.map