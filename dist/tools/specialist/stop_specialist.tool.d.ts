import * as z from 'zod';
export declare const stopSpecialistSchema: z.ZodObject<{
    job_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    job_id: string;
}, {
    job_id: string;
}>;
export declare function createStopSpecialistTool(): {
    name: "stop_specialist";
    description: string;
    inputSchema: z.ZodObject<{
        job_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        job_id: string;
    }, {
        job_id: string;
    }>;
    execute(input: z.infer<typeof stopSpecialistSchema>): Promise<{
        status: string;
        job_id: string;
        pid: number;
        error?: undefined;
    } | {
        status: string;
        error: any;
        job_id: string;
        pid?: undefined;
    }>;
};
//# sourceMappingURL=stop_specialist.tool.d.ts.map