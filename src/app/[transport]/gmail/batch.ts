// Batch operations for emails

export async function batchModifyEmails(gmail: any, args: any) {
    // args: { messageIds, addLabelIds, removeLabelIds, batchSize }
    const batchSize = args.batchSize || 50;
    const results = [];
    for (let i = 0; i < args.messageIds.length; i += batchSize) {
        const batchIds = args.messageIds.slice(i, i + batchSize);
        const res = await gmail.users.messages.batchModify({
            userId: 'me',
            requestBody: {
                ids: batchIds,
                addLabelIds: args.addLabelIds,
                removeLabelIds: args.removeLabelIds,
            },
        });
        results.push(res.data);
    }
    return results;
}


export async function batchDeleteEmails(gmail: any, args: any) {
    // args: { messageIds, batchSize }
    const batchSize = args.batchSize || 50;
    const results = [];
    for (let i = 0; i < args.messageIds.length; i += batchSize) {
        const batchIds = args.messageIds.slice(i, i + batchSize);
        const res = await gmail.users.messages.batchDelete({
            userId: 'me',
            requestBody: { ids: batchIds },
        });
        results.push(res.data);
    }
    return results;
}
