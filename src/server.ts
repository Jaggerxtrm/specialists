/**
 * UnitAI MCP Server — v2 Specialist System
 *
 * 4-tool orchestration layer: list_specialists, use_specialist,
 * run_parallel, specialist_status. All workflow logic lives in
 * .specialist.yaml files discovered across 3 scopes.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { join } from "node:path";
import { MCP_CONFIG } from "./constants.js";
import { logger } from "./utils/logger.js";
import { SpecialistLoader } from "./specialist/loader.js";
import { SpecialistRunner } from "./specialist/runner.js";
import { HookEmitter } from "./specialist/hooks.js";
import { CircuitBreaker } from "./utils/circuitBreaker.js";
import { createListSpecialistsTool, listSpecialistsSchema } from "./tools/specialist/list_specialists.tool.js";
import { createUseSpecialistTool, useSpecialistSchema } from "./tools/specialist/use_specialist.tool.js";
import { createRunParallelTool, runParallelSchema } from "./tools/specialist/run_parallel.tool.js";
import { createSpecialistStatusTool } from "./tools/specialist/specialist_status.tool.js";
import { JobRegistry } from "./specialist/jobRegistry.js";
import { createStartSpecialistTool, startSpecialistSchema } from "./tools/specialist/start_specialist.tool.js";
import { createPollSpecialistTool, pollSpecialistSchema } from "./tools/specialist/poll_specialist.tool.js";
import { z } from "zod";

type AnyTool = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute(input: unknown, onProgress?: (msg: string) => void): Promise<unknown>;
};

export class UnitAIServer {
  private server: Server;
  private tools: AnyTool[];

  constructor() {
    const circuitBreaker = new CircuitBreaker();
    const loader = new SpecialistLoader();
    const hooks = new HookEmitter({
      tracePath: join(process.cwd(), ".unitai", "trace.jsonl"),
    });
    const runner = new SpecialistRunner({ loader, hooks, circuitBreaker });
    const registry = new JobRegistry();

    this.tools = [
      createListSpecialistsTool(loader),
      createUseSpecialistTool(runner),
      createRunParallelTool(runner),
      createSpecialistStatusTool(loader, circuitBreaker),
      createStartSpecialistTool(runner, registry),
      createPollSpecialistTool(registry),
    ];

    this.server = new Server(
      { name: MCP_CONFIG.SERVER_NAME, version: MCP_CONFIG.VERSION },
      { capabilities: MCP_CONFIG.CAPABILITIES }
    );

    this.setupHandlers();
  }

  private toolSchemas: Record<string, z.ZodTypeAny> = {};

  private setupHandlers(): void {
    const schemaMap: Record<string, z.ZodTypeAny> = {
      list_specialists: listSpecialistsSchema,
      use_specialist: useSpecialistSchema,
      run_parallel: runParallelSchema,
      specialist_status: z.object({}),
      start_specialist: startSpecialistSchema,
      poll_specialist: pollSpecialistSchema,
    };
    this.toolSchemas = schemaMap;

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Received ListTools request");
      const tools = this.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(schemaMap[t.name] ?? z.object({})),
      }));
      logger.debug(`Returning ${tools.length} tools`);
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args = {} } = request.params;
      logger.info(`Tool call: ${toolName}`);

      const tool = this.tools.find(t => t.name === toolName);
      if (!tool) {
        logger.error(`Tool not found: ${toolName}`);
        throw new Error(`Tool '${toolName}' not found`);
      }

      const schema = this.toolSchemas[toolName];
      const parsed = schema ? schema.parse(args) : args;

      // Stream pi tokens → MCP logging notifications
      const onProgress = (msg: string) => {
        this.server.notification({
          method: 'notifications/message',
          params: { level: 'info', logger: 'unitai', data: msg },
        }).catch(() => {});
      };

      try {
        const result = await tool.execute(parsed, onProgress);
        return {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Tool ${toolName} failed: ${message}`);
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info(`UnitAI MCP Server v2 started — ${this.tools.length} tools registered`);
    } catch (error) {
      logger.error("Failed to start server", error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info("Stopping server...");
  }
}
