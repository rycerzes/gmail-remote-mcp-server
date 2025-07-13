import { z } from "zod";
import { prisma } from '@/app/prisma';

const DEV_PHNO = process.env.DEV_PHNO;

export function registerTools(server: any) {
    // add_numbers
    server.tool(
        "add_numbers",
        "Adds two numbers together and returns the sum",
        {
            a: z.number().describe("First number to add"),
            b: z.number().describe("Second number to add"),
        },
        async ({ a, b }: { a: number; b: number }) => {
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

    // validate
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

    // google_auth_link
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

    // check_google_auth
    server.tool(
        "check_google_auth",
        "Checks if the user is currently authenticated with their Google account. Requires the session cookie as input.",
        {
            session_cookie: z.string().describe("Session cookie from NextAuth, e.g. next-auth.session-token=..."),
        },
        async ({ session_cookie }: { session_cookie: string }) => {
            try {
                const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
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

    // send_email
    server.tool(
        "send_email",
        "Sends a email using the Gmail API. Requires the session cookie for authentication.",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            to: z.string().describe("Recipient email address"),
            subject: z.string().describe("Email subject"),
            body: z.string().describe("Email body (plain text)"),
        },
        async ({ session_cookie, to, subject, body }: { session_cookie: string; to: string; subject: string; body: string }) => {
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
            const email = session.user.email;
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
            let accessToken = account.access_token;
            const now = Math.floor(Date.now() / 1000);
            if (account.expires_at && account.expires_at < now) {
                if (!account.refresh_token) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "Google refresh token not found for user.",
                            },
                        ],
                    };
                }
                const params = new URLSearchParams({
                    client_id: process.env.GOOGLE_CLIENT_ID!,
                    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                    refresh_token: account.refresh_token,
                    grant_type: "refresh_token",
                });
                const resp = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params.toString(),
                });
                const data = await resp.json();
                if (!data.access_token) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "Failed to refresh Google access token.",
                            },
                        ],
                    };
                }
                accessToken = data.access_token;
                await prisma.account.update({
                    where: { id: account.id },
                    data: {
                        access_token: data.access_token,
                        expires_at: data.expires_in ? now + data.expires_in : null,
                    },
                });
            }
            const gmailApiUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
            const rawEmail = [
                `To: ${to}`,
                `Subject: ${subject}`,
                "Content-Type: text/plain; charset=UTF-8",
                "",
                body,
            ].join("\r\n");
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
                        text: `Email sent to ${to} successfully!`,
                    },
                ],
            };
        }
    );
}
