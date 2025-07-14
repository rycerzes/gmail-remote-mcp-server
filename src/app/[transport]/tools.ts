import { z } from "zod";
import { prisma } from '@/app/prisma';
import { google } from 'googleapis';
import {
    sendEmail, draftEmail, readEmail, searchEmails, modifyEmail, deleteEmail,
    createLabel, updateLabel, deleteLabel, listLabels, findLabelByName, getOrCreateLabel,
    batchModifyEmails, batchDeleteEmails
} from './gmail';
import {
    SendEmailSchema, ReadEmailSchema, SearchEmailsSchema, ModifyEmailSchema, DeleteEmailSchema,
    ListEmailLabelsSchema, CreateLabelSchema, UpdateLabelSchema, DeleteLabelSchema, GetOrCreateLabelSchema,
    BatchModifyEmailsSchema, BatchDeleteEmailsSchema
} from './gmail/schemas';

const DEV_PHNO = process.env.DEV_PHNO;

async function getGmailClient(sessionCookie: string) {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
        headers: {
            cookie: sessionCookie,
        },
    });
    const session = await sessionRes.json();

    if (!session || !session.user || !session.user.email) {
        throw new Error("User session not found or not authenticated.");
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
        throw new Error("Google access token not found for user.");
    }

    let accessToken = account.access_token;
    const now = Math.floor(Date.now() / 1000);

    if (account.expires_at && account.expires_at < now) {
        if (!account.refresh_token) {
            throw new Error("Google refresh token not found for user.");
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
            throw new Error("Failed to refresh Google access token.");
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

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth });
}

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

    // send_test_email
    server.tool(
        "send_test_email",
        "Sends a test email using the Gmail API. Requires the session cookie for authentication.",
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

    // Gmail Tools

    // send_gmail_email
    server.tool(
        "send_gmail_email",
        "Send an email using Gmail API with advanced options",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...SendEmailSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await sendEmail(gmail, args);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Email sent successfully! Message ID: ${result.id}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to send email: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // draft_email
    server.tool(
        "draft_email",
        "Create a draft email using Gmail API",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...SendEmailSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await draftEmail(gmail, args);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Draft created successfully! Draft ID: ${result.id}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to create draft: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // read_email
    server.tool(
        "read_email",
        "Read an email by its message ID",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...ReadEmailSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await readEmail(gmail, args.messageId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to read email: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // search_emails
    server.tool(
        "search_emails",
        "Search emails using Gmail query syntax",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...SearchEmailsSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await searchEmails(gmail, args.query, args.maxResults);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to search emails: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // modify_email
    server.tool(
        "modify_email",
        "Modify email labels",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...ModifyEmailSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await modifyEmail(gmail, args);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Email modified successfully! Message ID: ${result.id}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to modify email: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // delete_email
    server.tool(
        "delete_email",
        "Delete an email by its message ID",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...DeleteEmailSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await deleteEmail(gmail, args.messageId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Email deleted successfully!`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to delete email: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // list_labels
    server.tool(
        "list_labels",
        "List all Gmail labels",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...ListEmailLabelsSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await listLabels(gmail);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to list labels: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // create_label
    server.tool(
        "create_label",
        "Create a new Gmail label",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...CreateLabelSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await createLabel(gmail, args.name, {
                    messageListVisibility: args.messageListVisibility,
                    labelListVisibility: args.labelListVisibility
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Label created successfully! Label ID: ${result.id}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to create label: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // update_label
    server.tool(
        "update_label",
        "Update an existing Gmail label",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...UpdateLabelSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const updates: any = {};
                if (args.name) updates.name = args.name;
                if (args.messageListVisibility) updates.messageListVisibility = args.messageListVisibility;
                if (args.labelListVisibility) updates.labelListVisibility = args.labelListVisibility;

                const result = await updateLabel(gmail, args.id, updates);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Label updated successfully! Label ID: ${result.id}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to update label: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // delete_label
    server.tool(
        "delete_label",
        "Delete a Gmail label",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...DeleteLabelSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await deleteLabel(gmail, args.id);
                return {
                    content: [
                        {
                            type: "text",
                            text: result.message,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to delete label: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // get_or_create_label
    server.tool(
        "get_or_create_label",
        "Get an existing label or create it if it doesn't exist",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...GetOrCreateLabelSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await getOrCreateLabel(gmail, args.name, {
                    messageListVisibility: args.messageListVisibility,
                    labelListVisibility: args.labelListVisibility
                });
                return {
                    content: [
                        {
                            type: "text",
                            text: `Label found/created successfully! Label ID: ${result.id}, Name: ${result.name}`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to get or create label: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // batch_modify_emails
    server.tool(
        "batch_modify_emails",
        "Modify multiple emails at once",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...BatchModifyEmailsSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await batchModifyEmails(gmail, args);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Batch modification completed! Processed ${args.messageIds.length} emails in ${result.length} batches.`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to batch modify emails: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );

    // batch_delete_emails
    server.tool(
        "batch_delete_emails",
        "Delete multiple emails at once",
        {
            session_cookie: z.string().describe("Full session cookie from NextAuth, e.g. __Secure-authjs.session-token=..."),
            ...BatchDeleteEmailsSchema.shape,
        },
        async (args: any) => {
            try {
                const gmail = await getGmailClient(args.session_cookie);
                const result = await batchDeleteEmails(gmail, args);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Batch deletion completed! Processed ${args.messageIds.length} emails in ${result.length} batches.`,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Failed to batch delete emails: ${error.message}`,
                        },
                    ],
                };
            }
        }
    );
}
