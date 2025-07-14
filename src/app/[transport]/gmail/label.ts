// Gmail label management utilities
import { GmailLabel } from './types';


export async function createLabel(gmail: any, labelName: string, options: {
    messageListVisibility?: string;
    labelListVisibility?: string;
} = {}) {
    try {
        const messageListVisibility = options.messageListVisibility || 'show';
        const labelListVisibility = options.labelListVisibility || 'labelShow';
        const response = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: labelName,
                messageListVisibility,
                labelListVisibility,
            },
        });
        return response.data;
    } catch (error: any) {
        if (error.message && error.message.includes('already exists')) {
            throw new Error(`Label "${labelName}" already exists. Please use a different name.`);
        }
        throw new Error(`Failed to create label: ${error.message}`);
    }
}


export async function updateLabel(gmail: any, labelId: string, updates: {
    name?: string;
    messageListVisibility?: string;
    labelListVisibility?: string;
}) {
    try {
        await gmail.users.labels.get({ userId: 'me', id: labelId });
        const response = await gmail.users.labels.update({
            userId: 'me',
            id: labelId,
            requestBody: updates,
        });
        return response.data;
    } catch (error: any) {
        if (error.code === 404) {
            throw new Error(`Label with ID "${labelId}" not found.`);
        }
        throw new Error(`Failed to update label: ${error.message}`);
    }
}


export async function deleteLabel(gmail: any, labelId: string) {
    try {
        const label = await gmail.users.labels.get({ userId: 'me', id: labelId });
        if (label.data.type === 'system') {
            throw new Error(`Cannot delete system label with ID "${labelId}".`);
        }
        await gmail.users.labels.delete({ userId: 'me', id: labelId });
        return { success: true, message: `Label "${label.data.name}" deleted successfully.` };
    } catch (error: any) {
        if (error.code === 404) {
            throw new Error(`Label with ID "${labelId}" not found.`);
        }
        throw new Error(`Failed to delete label: ${error.message}`);
    }
}


export async function listLabels(gmail: any) {
    try {
        const response = await gmail.users.labels.list({ userId: 'me' });
        const labels = response.data.labels || [];
        const systemLabels = labels.filter((label: GmailLabel) => label.type === 'system');
        const userLabels = labels.filter((label: GmailLabel) => label.type === 'user');
        return {
            all: labels,
            system: systemLabels,
            user: userLabels,
            count: {
                total: labels.length,
                system: systemLabels.length,
                user: userLabels.length
            }
        };
    } catch (error: any) {
        throw new Error(`Failed to list labels: ${error.message}`);
    }
}


export async function findLabelByName(gmail: any, labelName: string) {
    try {
        const labelsResponse = await listLabels(gmail);
        const allLabels = labelsResponse.all;
        const foundLabel = allLabels.find(
            (label: GmailLabel) => label.name.toLowerCase() === labelName.toLowerCase()
        );
        return foundLabel || null;
    } catch (error: any) {
        throw new Error(`Failed to find label: ${error.message}`);
    }
}


export async function getOrCreateLabel(gmail: any, labelName: string, options: {
    messageListVisibility?: string;
    labelListVisibility?: string;
} = {}) {
    try {
        const existingLabel = await findLabelByName(gmail, labelName);
        if (existingLabel) {
            return existingLabel;
        }
        return await createLabel(gmail, labelName, options);
    } catch (error: any) {
        throw new Error(`Failed to get or create label: ${error.message}`);
    }
}
