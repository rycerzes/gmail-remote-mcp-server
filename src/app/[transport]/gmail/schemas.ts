import { z } from 'zod';

export const SendEmailSchema = z.object({
    to: z.array(z.string()).describe('List of recipient email addresses'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content (used for text/plain or when htmlBody not provided)'),
    htmlBody: z.string().optional().describe('HTML version of the email body'),
    mimeType: z.enum(['text/plain', 'text/html', 'multipart/alternative']).optional().default('text/plain').describe('Email content type'),
    cc: z.array(z.string()).optional().describe('List of CC recipients'),
    bcc: z.array(z.string()).optional().describe('List of BCC recipients'),
    threadId: z.string().optional().describe('Thread ID to reply to'),
    inReplyTo: z.string().optional().describe('Message ID being replied to'),
    attachments: z.array(z.string()).optional().describe('List of file paths to attach to the email'),
});

export const ReadEmailSchema = z.object({
    messageId: z.string().describe('ID of the email message to retrieve'),
});

export const SearchEmailsSchema = z.object({
    query: z.string().describe("Gmail search query (e.g., 'from:example@gmail.com')"),
    maxResults: z.number().optional().describe('Maximum number of results to return'),
});

export const ModifyEmailSchema = z.object({
    messageId: z.string().describe('ID of the email message to modify'),
    labelIds: z.array(z.string()).optional().describe('List of label IDs to apply'),
    addLabelIds: z.array(z.string()).optional().describe('List of label IDs to add to the message'),
    removeLabelIds: z.array(z.string()).optional().describe('List of label IDs to remove from the message'),
});

export const DeleteEmailSchema = z.object({
    messageId: z.string().describe('ID of the email message to delete'),
});

export const ListEmailLabelsSchema = z.object({}).describe('Retrieves all available Gmail labels');

export const CreateLabelSchema = z.object({
    name: z.string().describe('Name for the new label'),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe('Whether to show or hide the label in the message list'),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Visibility of the label in the label list'),
});

export const UpdateLabelSchema = z.object({
    id: z.string().describe('ID of the label to update'),
    name: z.string().optional().describe('New name for the label'),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe('Whether to show or hide the label in the message list'),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Visibility of the label in the label list'),
});

export const DeleteLabelSchema = z.object({
    id: z.string().describe('ID of the label to delete'),
});

export const GetOrCreateLabelSchema = z.object({
    name: z.string().describe('Name of the label to get or create'),
    messageListVisibility: z.enum(['show', 'hide']).optional().describe('Whether to show or hide the label in the message list'),
    labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Visibility of the label in the label list'),
});

export const BatchModifyEmailsSchema = z.object({
    messageIds: z.array(z.string()).describe('List of message IDs to modify'),
    addLabelIds: z.array(z.string()).optional().describe('List of label IDs to add to all messages'),
    removeLabelIds: z.array(z.string()).optional().describe('List of label IDs to remove from all messages'),
    batchSize: z.number().optional().default(50).describe('Number of messages to process in each batch (default: 50)'),
});

export const BatchDeleteEmailsSchema = z.object({
    messageIds: z.array(z.string()).describe('List of message IDs to delete'),
    batchSize: z.number().optional().default(50).describe('Number of messages to process in each batch (default: 50)'),
});

export const DownloadAttachmentSchema = z.object({
    messageId: z.string().describe('ID of the email message containing the attachment'),
    attachmentId: z.string().describe('ID of the attachment to download'),
    filename: z.string().optional().describe('Filename to save the attachment as (if not provided, uses original filename)'),
    savePath: z.string().optional().describe('Directory path to save the attachment (defaults to current directory)'),
});
