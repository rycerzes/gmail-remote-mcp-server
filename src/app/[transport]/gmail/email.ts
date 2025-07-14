// Email management utilities

export async function sendEmail(gmail: any, args: any) {
    // args: { to, subject, body, htmlBody, mimeType, cc, bcc, attachments, inReplyTo, threadId }
    const rawEmail = [
        `To: ${args.to.join(', ')}`,
        args.cc ? `Cc: ${args.cc.join(', ')}` : '',
        args.bcc ? `Bcc: ${args.bcc.join(', ')}` : '',
        `Subject: ${args.subject}`,
        args.inReplyTo ? `In-Reply-To: ${args.inReplyTo}` : '',
        args.inReplyTo ? `References: ${args.inReplyTo}` : '',
        'MIME-Version: 1.0',
        args.htmlBody ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
        '',
        args.htmlBody || args.body,
    ].filter(Boolean).join('\r\n');
    const base64Encoded = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: base64Encoded, threadId: args.threadId },
    });
    return res.data;
}


export async function draftEmail(gmail: any, args: any) {
    const rawEmail = [
        `To: ${args.to.join(', ')}`,
        args.cc ? `Cc: ${args.cc.join(', ')}` : '',
        args.bcc ? `Bcc: ${args.bcc.join(', ')}` : '',
        `Subject: ${args.subject}`,
        args.inReplyTo ? `In-Reply-To: ${args.inReplyTo}` : '',
        args.inReplyTo ? `References: ${args.inReplyTo}` : '',
        'MIME-Version: 1.0',
        args.htmlBody ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
        '',
        args.htmlBody || args.body,
    ].filter(Boolean).join('\r\n');
    const base64Encoded = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: base64Encoded, threadId: args.threadId } },
    });
    return res.data;
}


export async function readEmail(gmail: any, messageId: string) {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId });
    return res.data;
}


export async function searchEmails(gmail: any, query: string, maxResults?: number) {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
    return res.data;
}


export async function modifyEmail(gmail: any, args: any) {
    // args: { messageId, addLabelIds, removeLabelIds }
    const res = await gmail.users.messages.modify({
        userId: 'me',
        id: args.messageId,
        requestBody: {
            addLabelIds: args.addLabelIds,
            removeLabelIds: args.removeLabelIds,
        },
    });
    return res.data;
}


export async function deleteEmail(gmail: any, messageId: string) {
    await gmail.users.messages.delete({ userId: 'me', id: messageId });
    return { success: true };
}
