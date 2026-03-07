# Pi Engine — Execution Layer Reference

> **Ruolo in Agent Forge:** Pi sostituisce il Layer 2 (tmux Manager + Detector + Capture).
> È il motore di esecuzione unificato per tutti i provider CLI (Claude, Gemini, Qwen, ecc.).
>
> **Fonte:** Analisi diretta del source `badlogic/pi-mono/packages/coding-agent` e `packages/agent` — Marzo 2026.

---

## 1. Cos'è pi

Pi (`@mariozechner/pi`) è un orchestratore CLI unificato per agenti AI che espone una modalità RPC: un processo long-running controllato via JSON su stdin/stdout. Invece di screen-scraping su `tmux capture-pane`, Agent Forge usa pi come subprocess strutturato con un protocollo eventi preciso.

**Repository:** https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent

---

## 2. RpcClient — API

```typescript
import { RpcClient } from '@mariozechner/pi/rpc';

interface RpcClientOptions {
  cliPath?: string;    // default: 'dist/cli.js'
  provider?: string;   // 'google-gemini-cli' | 'openai' | 'anthropic' | ...
  model?: string;      // model ID, opzionale (usa default del provider)
  cwd?: string;        // working directory — PI carica agents.md da qui
  env?: Record<string, string>;  // env vars aggiuntive
  args?: string[];     // flag extra passati al CLI
}
```

### Metodi principali

| Metodo | Firma | Note |
|--------|-------|------|
| `start()` | `async start(): Promise<void>` | Spawna il processo pi |
| `stop()` | `stop(): void` | Termina il processo |
| `prompt()` | `async prompt(message, images?): Promise<void>` | Invia prompt, non-blocking — gli eventi arrivano in streaming |
| `waitForIdle()` | `waitForIdle(timeout?): Promise<void>` | Attende `agent_end` event, default 60s |
| `collectEvents()` | `collectEvents(timeout?): Promise<AgentEvent[]>` | Raccoglie tutti gli eventi fino ad `agent_end` |
| `onEvent()` | `onEvent(listener): () => void` | Subscribe agli eventi, ritorna unsubscribe fn |
| `send()` | `async send(command): Promise<RpcResponse>` | Comando generico con risposta attesa |
| `getLastAssistantText()` | via `send()` | Recupera l'ultimo testo dell'assistant |
| `getMessages()` | via `send()` | Recupera tutti i messaggi della sessione |
| `abort()` | via `send()` | Interrompe la generazione in corso |
| `newSession()` | via `send()` | Nuova sessione (branch dal parent opzionale) |
| `switchSession()` | via `send({ type: 'switch_session', sessionPath })` | Recovery da JSONL esistente |
| `fork()` | via `send({ type: 'fork', entryId })` | Fork da un punto della history |
| `setModel()` | via `send({ type: 'set_model', provider, modelId })` | Cambia modello a runtime |
| `compact()` | via `send({ type: 'compact', customInstructions? })` | Compatta il contesto |

### Startup

```typescript
const pi = new RpcClient({
  provider: 'google-gemini-cli',
  cwd: '/path/to/session/dir',  // agents.md caricato da qui
});
await pi.start();
// Verifica: se exitCode !== null dopo 100ms, il processo è crashato
```

Spawna: `node dist/cli.js --mode rpc --provider <provider> [--model <model>] [...args]`

---

## 3. AgentEvent — Schema completo

Tutti gli eventi sono emessi su stdout come JSON lines. Il `session.subscribe()` interno li forwarda al client.

```typescript
type AgentEvent =
  // Lifecycle agente
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }

  // Lifecycle turn (una risposta assistant + tool calls/results)
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }

  // Lifecycle messaggio
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }  // streaming delta
  | { type: "message_end"; message: AgentMessage }

  // Lifecycle tool execution
  | { type: "tool_execution_start";  toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end";    toolCallId: string; toolName: string; result: any; isError: boolean }
```

### Mappatura eventi → stato Agent Forge

| AgentEvent | Stato sessione Agent Forge |
|---|---|
| `agent_start` | `booting → working` |
| `tool_execution_start` | conferma `working`, aggiorna `last_activity` |
| `tool_execution_end` | aggiorna `last_activity` |
| `message_update` | stream al TUI (delta) |
| `agent_end` | `working → idle`, leggi `get_last_assistant_text` |
| Nessun evento per N secondi | trigger stall detection → escalation |

**Watchdog semplificato:** non serve più `capture-pane` + regex. Il watchdog registra il timestamp dell'ultimo evento ricevuto. Se `now - lastEventTime > stall_threshold`, l'agente è stalled.

---

## 4. RpcCommand — Schema completo

Inviati su stdin come JSON lines.

```typescript
type RpcCommand =
  // Prompting
  | { id?: string; type: "prompt";     message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
  | { id?: string; type: "steer";      message: string; images?: ImageContent[] }
  | { id?: string; type: "follow_up";  message: string; images?: ImageContent[] }
  | { id?: string; type: "abort" }
  | { id?: string; type: "new_session"; parentSession?: string }

  // Stato
  | { id?: string; type: "get_state" }
  | { id?: string; type: "get_messages" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "get_commands" }

  // Modello
  | { id?: string; type: "set_model";           provider: string; modelId: string }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "get_available_models" }

  // Sessione
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork";           entryId: string }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "export_html";    outputPath?: string }

  // Compaction
  | { id?: string; type: "compact";             customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }

  // Retry
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }

  // Bash diretto (orchestratore può eseguire bash nell'env dell'agente)
  | { id?: string; type: "bash";       command: string }
  | { id?: string; type: "abort_bash" }

  // Thinking
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }
```

Il campo `id` è opzionale — se presente, la risposta `RpcResponse` include lo stesso `id` per correlazione.

---

## 5. Sessioni — Persistenza e Recovery

Pi salva le sessioni come JSONL in `~/.pi/agent/sessions/`. Il `SessionManager` gestisce la struttura ad albero con branching.

### RpcSessionState

```typescript
interface RpcSessionState {
  sessionId: string;
  sessionFile?: string;   // path al JSONL — necessario per recovery
  sessionName?: string;
  model?: Model;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingMessageCount: number;
  autoCompactionEnabled: boolean;
}
```

### Recovery pattern (Agent Forge)

```typescript
// Al launch di una sessione, salva sessionFile nel checkpoint SQLite
const state = await pi.send({ type: 'get_state' });
await db.updateSession(sessionId, { piSessionFile: state.data.sessionFile });

// Al restart di Agent Forge, per ogni sessione con piSessionFile:
await pi.start();
await pi.send({ type: 'switch_session', sessionPath: checkpoint.piSessionFile });
// La sessione riprende dal punto in cui era
```

### Operazioni sessione

| Operazione | Metodo |
|---|---|
| Nuova sessione | `{ type: 'new_session' }` |
| Riprendi sessione esistente | `{ type: 'switch_session', sessionPath }` |
| Fork da un punto | `{ type: 'fork', entryId }` |
| Lista sessioni | `SessionManager.list()` (API interna, non RPC) |

---

## 6. Context Injection — Specialist System

Pi carica automaticamente `agents.md` dalla `cwd` della sessione come contesto persistente del sistema. Questo è il meccanismo nativo di pi equivalente a `CLAUDE.md` per Claude Code.

### Specialist spawn flow

```typescript
async function spawnWithSpecialist(
  provider: string,
  specialist: Specialist,
  userTask: string,
  sessionId: string,
): Promise<RpcClient> {
  const sessionDir = path.join(AF_SESSIONS_DIR, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  // 1. Componi agents.md: system prompt + skill_inherit + diagnostic_scripts
  let agentsMd = specialist.prompt.system;

  // 2. Se skill_inherit presente, appendi il SKILL.md del servizio
  if (specialist.prompt.skill_inherit) {
    const skillContent = await fs.readFile(specialist.prompt.skill_inherit, 'utf-8');
    agentsMd += '\n\n---\n# Service Knowledge (inherited from SKILL.md)\n\n' + skillContent;
  }

  // 3. Se diagnostic_scripts presente, documenta gli script disponibili
  if (specialist.capabilities?.diagnostic_scripts?.length) {
    agentsMd += '\n\n---\n# Diagnostic Scripts\nYou have access to the following diagnostic scripts via Bash:\n';
    for (const script of specialist.capabilities.diagnostic_scripts) {
      agentsMd += `- \`${script}\`\n`;
    }
  }

  await fs.writeFile(
    path.join(sessionDir, 'agents.md'),
    agentsMd
  );

  // 4. Crea client con cwd = sessionDir (pi carica agents.md in automatico)
  const pi = new RpcClient({ provider, cwd: sessionDir });
  await pi.start();

  // 5. Invia il task renderizzato (task_template con $query sostituito)
  await pi.prompt(renderTaskTemplate(specialist, userTask));

  return pi;
}
```

**Contenuto di agents.md (in ordine):**
1. `prompt.system` dello specialist
2. `skill_inherit` SKILL.md (se presente) — conoscenza operativa del servizio
3. `diagnostic_scripts` istruzioni (se presenti) — script eseguibili via Bash
4. Istruzioni AF_STATUS (aggiunte dal boss)

**Vantaggi rispetto a CLAUDE.md approach:**
- Funziona con tutti i provider (non solo Claude)
- `agents.md` è la convenzione nativa di pi — zero workaround
- Persiste per tutta la sessione, non va re-iniettato ad ogni messaggio
- `skill_inherit` evita duplicazione tra specialist YAML e service SKILL.md

### execution.mode e context injection

| `execution.mode` | Comportamento |
|---|---|
| `skill` | System prompt scritto in `agents.md` prima dello spawn. Nessuna chiamata backend aggiuntiva |
| `tool` | Specialist invocato come chiamata discreta, attende risposta |
| `auto` | Se sessione interattiva → skill mode. Se invocazione programmatica (MCP) → tool mode |

---

## 7. Provider Auth

Pi non ha un config centralizzato. Ogni provider legge le credenziali dai propri file nativi — nessun setup aggiuntivo se l'utente ha già fatto login ai CLI:

| Provider | Credenziali |
|---|---|
| Claude (`anthropic`) | `~/.claude/` (OAuth — Claude Pro/Max) |
| Gemini CLI (`google-gemini-cli`) | `~/.gemini/` (OAuth) |
| Qwen (`openai` + DashScope) | `~/.qwen/oauth_creds.json` (OAuth device flow) |
| OpenAI | env `OPENAI_API_KEY` |
| DashScope diretto | env `DASHSCOPE_API_KEY` |
| Azure OpenAI | env `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT` |
| Google Vertex | env `GOOGLE_CLOUD_PROJECT` + ADC |

### 7.1 Qwen CLI — Protocollo di Connessione

Ispezione diretta del bundle (`cli.js`) rivela che Qwen CLI **non usa un protocollo SSE custom** come Gemini CLI, ma l'**OpenAI SDK standard** puntato a DashScope.

| Parametro | Valore |
|---|---|
| **Base URL** | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| **API** | OpenAI `/chat/completions` con `stream: true` |
| **Auth (free tier)** | OAuth2 device flow via `https://chat.qwen.ai/api/v1/oauth2/` (PKCE) |
| **Token storage** | `~/.qwen/oauth_creds.json` |
| **User-Agent** | `QwenCode/<version> (<platform>; <arch>)` |
| **Header DashScope** | `X-DashScope-CacheControl`, `X-DashScope-AuthType`, `X-DashScope-UserAgent` |

Come viene costruito il client internamente (`DashScopeOpenAICompatibleProvider.buildClient()`):

```typescript
new OpenAI({
  apiKey,          // OAuth access token oppure DASHSCOPE_API_KEY
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  timeout: 120_000,
  maxRetries: 3,
  defaultHeaders: {
    'User-Agent': `QwenCode/${version} (linux; x64)`,
    'X-DashScope-CacheControl': 'enable',
    'X-DashScope-AuthType': authType,
  }
})
```

Il token OAuth viene letto da `~/.qwen/oauth_creds.json` (già scritto da `qwen auth login`) e passato come `apiKey` — nessuna logica OAuth da reimplementare.

**Aggiungere Qwen come provider in pi è banale**: pi supporta già provider OpenAI-compatible. Basta registrare un provider con `baseURL` DashScope:

```typescript
// pseudo-config per pi ModelRegistry
{
  name: 'qwen',
  type: 'openai-compatible',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: () => readQwenOAuthToken(),  // legge ~/.qwen/oauth_creds.json
  model: 'qwen-coder-plus-latest',
}
```

Nessun bisogno di OpenRouter o endpoint proxy — connessione diretta a DashScope con OAuth token già disponibile localmente.

---

## 8. Integrazione Agent Forge — Sostituzione tmux

### Layer 2: da tmux a pi

```
src/tmux/               →    src/pi/
  manager.ts            →      rpc-pool.ts       (gestisce N istanze RpcClient)
  detector.ts           →      event-router.ts   (routing AgentEvent → SQLite)
  capture.ts            →      (eliminato — get_last_assistant_text sostituisce capture-pane)
```

### Profile YAML semplificato

```yaml
# Vecchio profile (PRD v1.2.0):
id: gemini
commands:
  start: "gemini"
  start_with_prompt: "gemini -p '${PROMPT}'"
  resume: "gemini -r ${SESSION_REF} -p '${PROMPT}'"
detection:
  ready_patterns: ["^>"]
  busy_patterns: ["Generating"]
  poll_interval_ms: 3000
tmux:
  prefix: "af_"
  socket_path: "~/.tmux/agent-forge"

# Nuovo profile (con pi):
id: gemini
provider: google-gemini-cli
model: gemini-2.5-pro    # opzionale
```

Le sezioni `commands.*`, `detection.*`, `tmux.*` sono eliminate. Il comportamento è gestito da pi.

### Protocol Engine — turn execution

```typescript
// Vecchio (tmux):
await waitForReady(session);
tmux.sendKeys(session.tmux_session, rendered_prompt);
const output = await scanLogFileForAFStatus(session);

// Nuovo (pi):
await pi.prompt(rendered_prompt);
await pi.waitForIdle(turn.timeout_ms);
const { data } = await pi.send({ type: 'get_last_assistant_text' });
// data.text = output del turn
```

### sendToAgent semplificato

```typescript
async function sendToAgent(session: Session, message: string): Promise<void> {
  const pi = piPool.get(session.id);
  await pi.prompt(message);
  await db.updateSession(session.id, { status: 'working' });
  // Gli eventi pi aggiornano last_activity in tempo reale via onEvent()
}
```

`waitForReady()` con polling + regex è eliminato. Pi è sempre pronto a ricevere prompt (è un long-running process). La "readiness" è implicita.

### Resilienza: daemon in tmux

```
tmux session "af_daemon"
└── agent-forge process (Node/Bun)
    ├── RpcClient [gemini]    pid 1234  ← child process
    ├── RpcClient [qwen]      pid 1235  ← child process
    └── RpcClient [claude]    pid 1236  ← child process
```

- Se l'utente fa `tmux detach`, forge e tutti i pi continuano
- Se forge crasha (raro), i pi muoiono — forge rilancia al restart leggendo `piSessionFile` da SQLite
- `tmux pass-through` (tasto `t`) non è più necessario — l'output arriva via eventi, non da pane

---

## 9. Differenza con AF_STATUS

Con pi, **AF_STATUS non è più necessario** per il segnale di completamento. `agent_end` è la completion signal nativa.

AF_STATUS rimane rilevante solo per **compatibilità con sistemi che non usano pi** (es. unitAI che legge da stdout CLI). Agent Forge con pi ignora AF_STATUS e usa `agent_end` + `get_last_assistant_text`.

| Segnale | Source | Usato da |
|---|---|---|
| `agent_end` event | pi RPC stream | Agent Forge (Layer 2 pi) |
| `AF_STATUS` block | stdout testo | unitAI, sistemi tmux-based |

---

## 10. Limitazioni note e rischi

| Aspetto | Status |
|---|---|
| **Concorrenza N istanze** | Supportato — ogni `RpcClient` è un processo indipendente |
| **Timeout lunga durata** | Da testare — il `DEFAULT_TIMEOUT = 120_000ms` è per request; il processo rimane attivo |
| **Progetto giovane** | Singolo autore, attivo. Piano B: reimplementare il thin protocol (spawn + readline + event dispatch) senza dipendere dal binario |
| **Qwen come provider nativo** | Non presente — si usa `openai` provider con `baseURL` DashScope |
| **GLM/CCS** | Da verificare se pi ha un provider o si usa OpenAI-compatible |
