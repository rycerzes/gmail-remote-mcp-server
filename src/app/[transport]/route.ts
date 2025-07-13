import { createMcpHandler } from "@vercel/mcp-adapter";
import { prisma } from '@/app/prisma';
import { NextRequest } from 'next/server';
import { registerTools } from './tools';

// Authentication helper
async function authenticateRequest(request: NextRequest) {

  const authHeader = request.headers.get('authorization');
  console.log('[MCP] Auth header present:', !!authHeader);

  // Hardcoded token for development/testing
  const SIMPLE_BEARER_TOKEN = process.env.SIMPLE_BEARER_TOKEN;

  if (!authHeader) {
    console.log('[MCP] No auth header, returning 401');
    return null;
  }

  const token = authHeader.split(' ')[1];
  console.log('[MCP] Token extracted:', token ? 'present' : 'missing');

  if (!token) {
    console.log('[MCP] No token, returning 401');
    return null;
  }

  // Accept hardcoded token for authentication
  if (token === SIMPLE_BEARER_TOKEN) {
    console.log('[MCP] Hardcoded token accepted');
    return { token: SIMPLE_BEARER_TOKEN, user: { id: 'dev-user' } };
  }

  try {
    console.log('[MCP] Looking up access token in database');
    const accessToken = await prisma.accessToken.findUnique({
      where: { token },
    });

    console.log('[MCP] Access token found:', !!accessToken);

    if (!accessToken) {
      console.log('[MCP] No access token found, returning 401');
      return null;
    }

    console.log('[MCP] Token expires at:', accessToken.expiresAt);
    console.log('[MCP] Current time:', new Date());

    if (accessToken.expiresAt < new Date()) {
      console.log('[MCP] Token expired, returning 401');
      return null;
    }

    console.log('[MCP] Authentication successful');
    return accessToken;
  } catch (e) {
    console.error('[MCP] Error validating token:', e);
    return null;
  }
}

// MCP handler with authentication
const handler = async (req: Request) => {
  // Inject authentication here
  const nextReq = req as any as NextRequest; // for type compatibility
  const accessToken = await authenticateRequest(nextReq);
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }


  // Extract cookie from NextRequest and store in memory (TODO: store in Redis)
  let cookie = '';
  try {
    cookie = nextReq.cookies?.toString?.() || '';
    if (!cookie && nextReq.headers?.get) {
      cookie = nextReq.headers.get('cookie') || '';
    }
  } catch { }

  // Store cookie in memory for now
  // TODO: Store cookie in Redis for persistent session management
  // Store cookie in memory for now (using a typed property)
  (globalThis as any)._lastSessionCookie = cookie;

  // Log request body
  const requestBody = await req.clone().json().catch(() => null);
  console.log('[MCP] Request body:', requestBody);

  return createMcpHandler(
    (server) => {
      registerTools(server);
    },
    {
      // Optionally add server capabilities here
    },
    {
      basePath: "/",
      verboseLogs: true,
      redisUrl: process.env.REDIS_URL,
    }
  )(req);
};

export { handler as GET, handler as POST };

// CORS preflight handler
export async function OPTIONS() {
  const response = new Response(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
} 
