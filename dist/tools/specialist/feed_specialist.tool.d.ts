import * as z from 'zod';
export declare const feedSpecialistSchema: z.ZodObject<{
    job_id: z.ZodString;
    cursor: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    job_id: string;
    cursor: number;
}, {
    job_id: string;
    limit?: number | undefined;
    cursor?: number | undefined;
}>;
export declare function createFeedSpecialistTool(jobsDir: string): {
    name: "feed_specialist";
    description: string;
    inputSchema: z.ZodObject<{
        job_id: z.ZodString;
        cursor: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        job_id: string;
        cursor: number;
    }, {
        job_id: string;
        limit?: number | undefined;
        cursor?: number | undefined;
    }>;
    execute(input: z.infer<typeof feedSpecialistSchema>): Promise<{
        error: string;
        job_id: string;
    } | {
        events: import("../../specialist/timeline-events.js").TimelineEvent[];
        cursor: number;
        next_cursor: number;
        has_more: boolean;
        is_complete: boolean;
        metrics?: Record<string, unknown> | undefined;
        bead_id?: string | undefined;
        status: string;
        model?: string | undefined;
        job_id: string;
        specialist: string;
        specialist_model: string;
        error?: undefined;
    }>;
};
//# sourceMappingURL=feed_specialist.tool.d.ts.map