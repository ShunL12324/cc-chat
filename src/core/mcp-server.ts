/**
 * Embedded MCP HTTP Server
 *
 * Minimal Streamable HTTP MCP server that exposes a `send_file` tool.
 * Claude CLI connects via --mcp-config at spawn time.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST (MCP Streamable HTTP transport)
 * Endpoint: POST /mcp/{token}/{threadId}
 *
 * Only implements the minimum required methods:
 * - initialize
 * - notifications/initialized (client notification)
 * - tools/list
 * - tools/call
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, statSync, existsSync } from 'fs';
import { basename, resolve, normalize } from 'path';
import { randomBytes } from 'crypto';
import { getLogger } from './logger.js';

/** Max file size for Discord attachments (25MB) */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Callback to send a file to a Discord thread */
export type SendFileCallback = (threadId: string, filePath: string, message?: string) => Promise<void>;

/** MCP server instance state */
let server: Server | null = null;
let serverPort = 0;
let serverToken = '';
let sendFileCallback: SendFileCallback | null = null;

/** Map of threadId -> projectDir for path validation */
const threadProjectDirs = new Map<string, string>();

/**
 * Register a thread's project directory for path validation.
 */
export function registerThread(threadId: string, projectDir: string): void {
  threadProjectDirs.set(threadId, projectDir);
}

/**
 * Unregister a thread.
 */
export function unregisterThread(threadId: string): void {
  threadProjectDirs.delete(threadId);
}

/**
 * Get the MCP config JSON string for a specific thread.
 * Used in --mcp-config argument when spawning Claude.
 */
export function getMcpConfigArg(threadId: string): string {
  const url = `http://127.0.0.1:${serverPort}/mcp/${serverToken}/${threadId}`;
  return JSON.stringify({ mcpServers: { 'cc-chat': { type: 'http', url } } });
}

/**
 * Check if the MCP server is running.
 */
export function isMcpServerRunning(): boolean {
  return server !== null && serverPort > 0;
}

// --- JSON-RPC helpers ---

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: unknown;
}

function jsonRpcResponse(id: string | number | undefined, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcError(id: string | number | undefined, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// --- MCP method handlers ---

function handleInitialize(req: JsonRpcRequest): string {
  return jsonRpcResponse(req.id, {
    protocolVersion: '2025-03-26',
    capabilities: { tools: {} },
    serverInfo: { name: 'cc-chat', version: '1.0.0' },
  });
}

function handleToolsList(req: JsonRpcRequest): string {
  return jsonRpcResponse(req.id, {
    tools: [
      {
        name: 'send_file',
        description: 'Send a file to the user via Discord. Use when the user asks to see, download, or receive a file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path to the file to send' },
            message: { type: 'string', description: 'Optional message to accompany the file' },
          },
          required: ['path'],
        },
      },
    ],
  });
}

async function handleToolsCall(req: JsonRpcRequest, threadId: string): Promise<string> {
  const params = req.params as { name: string; arguments?: Record<string, unknown> };
  if (params.name !== 'send_file') {
    return jsonRpcError(req.id, -32602, `Unknown tool: ${params.name}`);
  }

  const args = params.arguments ?? {};
  const filePath = String(args.path ?? '');
  const message = args.message ? String(args.message) : undefined;

  if (!filePath) {
    return jsonRpcError(req.id, -32602, 'path is required');
  }

  // Validate file exists
  if (!existsSync(filePath)) {
    return jsonRpcResponse(req.id, {
      content: [{ type: 'text', text: `File not found: ${filePath}` }],
      isError: true,
    });
  }

  // Validate file is within project directory
  const projectDir = threadProjectDirs.get(threadId);
  if (projectDir) {
    const resolved = normalize(resolve(filePath));
    const projectResolved = normalize(resolve(projectDir));
    if (!resolved.startsWith(projectResolved)) {
      return jsonRpcResponse(req.id, {
        content: [{ type: 'text', text: `Access denied: file must be within project directory ${projectDir}` }],
        isError: true,
      });
    }
  }

  // Check file size
  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    return jsonRpcResponse(req.id, {
      content: [{ type: 'text', text: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds Discord's 25MB limit` }],
      isError: true,
    });
  }

  // Send via callback
  if (!sendFileCallback) {
    return jsonRpcResponse(req.id, {
      content: [{ type: 'text', text: 'File sending not available' }],
      isError: true,
    });
  }

  try {
    await sendFileCallback(threadId, filePath, message);
    return jsonRpcResponse(req.id, {
      content: [{ type: 'text', text: `Sent ${basename(filePath)} to Discord` }],
    });
  } catch (error) {
    return jsonRpcResponse(req.id, {
      content: [{ type: 'text', text: `Failed to send file: ${error}` }],
      isError: true,
    });
  }
}

// --- HTTP request handler ---

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const log = getLogger();

  // Only accept POST
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(jsonRpcError(undefined, -32600, 'Method not allowed'));
    return;
  }

  // Parse URL: /mcp/{token}/{threadId}
  const parts = (req.url ?? '').split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== 'mcp') {
    res.writeHead(404);
    res.end();
    return;
  }

  const [, token, threadId] = parts;

  // Validate token
  if (token !== serverToken) {
    res.writeHead(403);
    res.end();
    return;
  }

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks).toString('utf-8');

  let rpcReq: JsonRpcRequest;
  try {
    rpcReq = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(jsonRpcError(undefined, -32700, 'Parse error'));
    return;
  }

  log.debug({ method: rpcReq.method, threadId }, '[mcp] Request');

  let response: string;

  switch (rpcReq.method) {
    case 'initialize':
      response = handleInitialize(rpcReq);
      break;
    case 'notifications/initialized':
      // Client notification, no response needed
      res.writeHead(202);
      res.end();
      return;
    case 'tools/list':
      response = handleToolsList(rpcReq);
      break;
    case 'tools/call':
      response = await handleToolsCall(rpcReq, threadId);
      break;
    default:
      response = jsonRpcError(rpcReq.id, -32601, `Method not found: ${rpcReq.method}`);
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(response);
}

// --- Lifecycle ---

/**
 * Start the embedded MCP HTTP server.
 * @param callback - Function to send files to Discord threads
 * @param port - Port to listen on (0 = random)
 */
export function startMcpServer(callback: SendFileCallback, port = 0): Promise<number> {
  sendFileCallback = callback;
  serverToken = randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      handleRequest(req, res).catch(err => {
        getLogger().error(err, '[mcp] Request handler error');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(jsonRpcError(undefined, -32603, 'Internal error'));
        }
      });
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server!.address();
      serverPort = typeof addr === 'object' && addr ? addr.port : 0;
      getLogger().info(`[mcp] Server listening on 127.0.0.1:${serverPort}`);
      resolve(serverPort);
    });

    server.on('error', reject);
  });
}

/**
 * Stop the MCP HTTP server.
 */
export function stopMcpServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
      server = null;
      serverPort = 0;
    } else {
      resolve();
    }
  });
}
