import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { prisma } from '@/app/prisma';
import { NextRequest } from 'next/server';

const DEV_PHNO = process.env.DEV_PHNO
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
      server.tool(
        "add_numbers",
        "Adds two numbers together and returns the sum",
        {
          a: z.number().describe("First number to add"),
          b: z.number().describe("Second number to add"),
        },
        async ({ a, b }) => {
          return {
            content: [
              {
                type: "text",
                text: `The sum of ${a} and ${b} is ${a + b}`,
              },
            ],
          };
        }
      );

      server.tool(
        "validate",
        "Returns the server owner's number in {country_code}{number} format.",
        {},
        async () => {
          return {
            content: [
              {
                type: "text",
                text: DEV_PHNO ?? "not_set",
              },
            ],
          };
        }
      );

      server.tool(
        "google_auth_link",
        "Sends a Google OAuth sign-in link for user authentication.",
        {},
        async () => {
          const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
          const signInUrl = `${baseUrl}/api/auth/signin?provider=google`;
          return {
            content: [
              {
                type: "text",
                text: `Sign in with Google: ${signInUrl}`,
              },
            ],
          };
        }
      );

      server.tool(
        "check_google_auth",
        "Checks if the user is currently authenticated with their Google account. Requires the session cookie as input.",
        {
          session_cookie: z.string().describe("Session cookie from NextAuth, e.g. next-auth.session-token=..."),
        },
        async ({ session_cookie }) => {
          try {
            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            // Attach the full session cookie to the request
            const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
              headers: {
                cookie: session_cookie,
              },
            });
            const session = await sessionRes.json();
            if (session && session.user && session.user.email) {
              return {
                content: [
                  {
                    type: "text",
                    text: `User is logged in as ${session.user.email}`,
                  },
                ],
              };
            } else {
              return {
                content: [
                  {
                    type: "text",
                    text: "User is not logged in with Google.",
                  },
                ],
              };
            }
          } catch (e) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error checking authentication status.",
                },
              ],
            };
          }
        }
      );

      server.tool(
        "send_email",
        "Sends a test email using the Gmail API. Requires the session cookie for authentication.",
        {
          session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
          to: z.string().describe("Recipient email address"),
          subject: z.string().describe("Email subject"),
          body: z.string().describe("Email body (plain text)"),
        },
        async ({ session_cookie, to, subject, body }) => {
          // Extract the session token from the cookie string
          const match = session_cookie.match(/(?:^|; )__Secure-authjs\.session-token=([^;]+)/);
          const sessionToken = match ? match[1] : null;
          if (!sessionToken) {
            return {
              content: [
                {
                  type: "text",
                  text: "Session token not found in cookie.",
                },
              ],
            };
          }

          // Get user session from NextAuth
          const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
          const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
            headers: {
              cookie: session_cookie,
            },
          });
          const session = await sessionRes.json();
          if (!session || !session.user || !session.user.email) {
            return {
              content: [
                {
                  type: "text",
                  text: "User session not found or not authenticated.",
                },
              ],
            };
          }

          // Get user's access token from NextAuth (assumes Google provider)
          // You may need to adjust this depending on your NextAuth config
          const email = session.user.email;
          // Fetch the user's account from the database
          const account = await prisma.account.findFirst({
            where: {
              provider: "google",
              user: { email },
            },
            include: { user: true },
          });
          if (!account || !account.access_token) {
            return {
              content: [
                {
                  type: "text",
                  text: "Google access token not found for user.",
                },
              ],
            };
          }
          const accessToken = account.access_token;

          // Send email using Gmail API
          const gmailApiUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
          // Construct raw email (RFC 5322)
          const rawEmail = [
            `To: ${to}`,
            `Subject: ${subject}`,
            "Content-Type: text/plain; charset=UTF-8",
            "",
            body,
          ].join("\r\n");
          // Base64 encode (URL-safe)
          const base64Encoded = Buffer.from(rawEmail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

          const gmailRes = await fetch(gmailApiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: base64Encoded }),
          });
          if (!gmailRes.ok) {
            const errorText = await gmailRes.text();
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to send email: ${errorText}`,
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `Test email sent to ${to} successfully!`,
              },
            ],
          };
        }
      );
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
