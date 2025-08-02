import { Message } from "discord.js-selfbot-v13";
import SelfbotEvent from "../structures/event.js";
import { IPCMessage, sendResponse } from "../ipcServerManager.js";
import Selfbot from "../structures/client.js";

// Type for responses
interface WhitelistResponse {
    type: string;
    data: {
        success: boolean;
        audioId: number;
        whitelisterId: number;
        severity: string;
        message?: string;
        requestId?: string;
    };
}

type CheckSeverity = 'error' | 'warning' | 'info';

// Queue and processing flag
const whitelistQueue: Array<{ selfbot: Selfbot; message: IPCMessage }> = [];
let processing = false;

export default new SelfbotEvent({
    name: "ipcMessage" as any,
    run(selfbot, message: IPCMessage) {
        if (message.type !== "whitelistAudio" && message.socket) return sendResponse(message.socket, { type: 'error', data: { message: 'Unknown IPC type' } });
        const { requestId } = message.data;

        whitelistQueue.push({ selfbot, message });
        if (whitelistQueue.length === 1) {
            return processQueue();
        }

        if (message.socket && requestId) {
            sendResponse(message.socket, { type: 'whitelistQueued', data: { requestId } });
        }
        return processQueue();
    }
});

async function processQueue() {
    if (processing || whitelistQueue.length === 0) return;
    processing = true;

    let currentItem: { selfbot: Selfbot; message: IPCMessage } | null = null;

    try {
        currentItem = whitelistQueue.shift()!;
        const { selfbot, message } = currentItem;
        const { audioId, category, is_private, whitelisterId, requestId } = message.data;

        // Log queue status
        console.log(`Processing whitelist request for audio ${audioId}. Queue length: ${whitelistQueue.length}`);

        // Emit processing ack
        if (message.socket && requestId) {
            try {
                sendResponse(message.socket, { type: 'whitelistProcessing', data: { requestId } });
            } catch (socketError) {
                console.error(`Socket error sending processing ack: ${socketError.message}`);
                // Continue processing even if socket is closed
            }
        }

        let response: WhitelistResponse;
        try {
            const chan = selfbot.channels.cache.get("1339543496239091784");
            if (!chan || chan.type !== 'GUILD_TEXT') {
                throw new Error('Commands channel not found');
            }
            await chan.send(
                `Attempting to whitelist ${audioId} on behalf of <@${whitelisterId}>...`
            );

            const result: Message = await sendSlashCommandWithTimeout(
                chan,
                "1300028911274430537",
                'whitelist',
                [audioId, category, is_private]
            );

            const messageContent = result.content;
            const embed = result.embeds[0];
            if (!messageContent && !embed) throw new Error('Missing response data');

            const checks: Array<{ cond?: boolean; msg: string; sev: CheckSeverity }> = [
                { cond: messageContent?.toLowerCase().includes("publicassetcannotbegrantedto"), msg: "This audio is publicly available on the Roblox marketplace!", sev: 'error' },
                { cond: embed?.title?.toLowerCase().includes("can't access"), msg: 'No access', sev: 'error' },
                { cond: embed?.description?.toLowerCase().includes('already whitelisted'), msg: 'Already whitelisted', sev: 'info' },
                { cond: embed?.title?.toLowerCase().includes('invalid asset'), msg: 'Invalid ID', sev: 'error' },
                { cond: embed?.title?.toLowerCase().includes('under review'), msg: 'Under review', sev: 'warning' },
                { cond: embed?.title?.toLowerCase().includes('failed'), msg: 'Moderation failed', sev: 'error' },
                { cond: embed?.title?.toLowerCase().includes('ratelimit'), msg: 'Rate limited', sev: 'warning' }
            ];

            const found = checks.find(c => c.cond);
            if (found) {
                response = {
                    type: 'whitelistResponse',
                    data: {
                        success: false,
                        audioId,
                        whitelisterId,
                        severity: found.sev,
                        message: found.msg,
                        requestId
                    }
                };
            } else {
                response = {
                    type: 'whitelistResponse',
                    data: {
                        success: true,
                        audioId,
                        whitelisterId,
                        severity: 'success',
                        requestId
                    }
                };
            }
        } catch (error: any) {
            console.error(`Error processing whitelist request: ${error.message}`);
            response = {
                type: 'whitelistResponse',
                data: {
                    success: false,
                    audioId,
                    whitelisterId,
                    severity: 'error',
                    message: error.message,
                    requestId
                }
            };
        }

        // Send response if socket is still open
        if (message.socket) {
            try {
                return sendResponse(message.socket, response);
            } catch (socketError) {
                console.error(`Socket error sending final response: ${socketError.message}`);
                // Continue even if socket is closed
            }
        }

        console.log(`Completed whitelist request for audio ${audioId}. Result: ${response.data.success ? 'Success' : 'Failed'}`);
    } catch (fatalError: any) {
        console.error(`Fatal error in queue processing: ${fatalError.message}`);

        // Try to send error response if we have message details
        if (currentItem?.message?.socket && currentItem?.message?.data?.requestId) {
            try {
                const { audioId = 0, whitelisterId = 0, requestId } = currentItem.message.data;
                sendResponse(currentItem.message.socket, {
                    type: 'whitelistResponse',
                    data: {
                        success: false,
                        audioId,
                        whitelisterId,
                        severity: 'error',
                        message: 'Internal server error',
                        requestId
                    }
                });
            } catch (e) {
                // Ignore socket errors at this point
            }
        }
    } finally {
        // Always reset processing flag and continue queue
        processing = false;

        // Add small delay before processing next item to prevent rate limiting
        setTimeout(() => {
            void processQueue();
        }, 1000);
    }
}

async function sendSlashCommandWithTimeout(
    channel: any,
    botId: string,
    cmd: string,
    args: any[]
): Promise<Message> {
    const m = await channel.sendSlash(botId, cmd, args);
    if (m.flags.has('LOADING')) {
        return new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error('Command timeout')), 15 * 60 * 1000);
            const handler = (oldMsg: Message, newMsg: Message) => {
                if (oldMsg.id === m.id) {
                    clearTimeout(timeout);
                    m.client.removeListener('messageUpdate', handler);
                    res(newMsg);
                }
            };
            m.client.on('messageUpdate', handler);
        });
    }
    return m;
}
