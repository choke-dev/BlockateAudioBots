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

type CheckSeverity = 'error' | 'warning' | 'info' | 'success';

// Queue item type
type QueueItem = { selfbot: Selfbot; message: IPCMessage };

// Constants
const COMMAND_CHANNEL_ID = "1339543496239091784";
const BETWEEN_ITEMS_DELAY_MS = 1500;

// Queue implementation with single worker
class WhitelistQueue {
    private queue: QueueItem[] = [];
    private workerRunning = false;

    /**
     * Enqueue the item and notify the client:
     * - If worker is already running, send 'whitelistQueued'.
     * - If worker is not running, send 'whitelistProcessing'.
     *
     * Notification is best-effort; failures are logged but do not block enqueue.
     */
    async enqueueAndNotify(item: QueueItem) {
        const { message } = item;
        const requestId = message?.data?.requestId;

        // Notify client depending on whether we're already processing
        try {
            if (message.socket && requestId) {
                if (this.workerRunning) {
                    // Already processing something -> inform client they're queued
                    await sendResponse(message.socket, { type: 'whitelistQueued', data: { requestId } });
                } else {
                    // Nothing being processed -> inform client processing started
                    await sendResponse(message.socket, { type: 'whitelistProcessing', data: { requestId } });
                }
            }
        } catch (notifyErr: any) {
            console.error(`Socket notification error in enqueueAndNotify: ${notifyErr?.message ?? String(notifyErr)}`);
            // best-effort only; continue
        }

        // Push into queue and start the worker (non-blocking)
        this.queue.push(item);
        void this.startWorker();
    }

    private async startWorker() {
        if (this.workerRunning) return;
        this.workerRunning = true;
        try {
            while (this.queue.length > 0) {
                const item = this.queue.shift();
                if (!item) break;
                try {
                    await this.handleItem(item);
                } catch (err: any) {
                    // handleItem already logs and attempts socket response; log here for completeness
                    console.error(`Error handling queue item: ${err?.message ?? String(err)}`);
                }
                // small fixed delay between items to reduce rate-limit pressure
                await new Promise(r => setTimeout(r, BETWEEN_ITEMS_DELAY_MS));
            }
        } finally {
            this.workerRunning = false;
        }
    }

    private async handleItem(item: QueueItem) {
        const { selfbot, message } = item;
        const { audioId = 0, category, is_private, whitelisterId = 0, requestId } = message.data ?? {};

        // Notify the client that this queued item is now being processed (best-effort).
        if (message.socket && requestId) {
            try {
                await sendResponse(message.socket, { type: 'whitelistProcessing', data: { requestId } });
            } catch (socketErr: any) {
                console.error(`Socket error sending processing ack in handleItem: ${socketErr?.message ?? String(socketErr)}`);
                // continue even if send fails
            }
        }

        // Log queue status
        console.log(`Processing whitelist request for audio ${audioId}. Queue length: ${this.queue.length}`);

        let response: WhitelistResponse;

        try {
            const chan = selfbot.channels.cache.get(COMMAND_CHANNEL_ID);
            if (!chan || chan.type !== 'GUILD_TEXT') {
                throw new Error('Commands channel not found');
            }

            await chan.send(`Attempting to whitelist ${audioId} on behalf of <@${whitelisterId}>...`);

            const result: Message = await sendSlashCommandWithTimeout(
                chan,
                "1300028911274430537",
                'whitelist',
                [audioId, category, is_private]
            );

            const messageContent = result.content ?? '';
            const embed = result.embeds?.[0];

            // Normalize strings once
            const text = messageContent.toLowerCase();
            const title = (embed?.title ?? '').toLowerCase();
            const desc = (embed?.description ?? '').toLowerCase();

            const checks: Array<{ cond: boolean; msg: string; sev: CheckSeverity }> = [
                { cond: text.includes("publicassetcannotbegrantedto"), msg: "This audio is publicly available on the Roblox marketplace!", sev: 'error' },
                { cond: title.includes("can't access"), msg: 'No access', sev: 'error' },
                { cond: desc.includes('already whitelisted'), msg: 'Already whitelisted', sev: 'info' },
                { cond: title.includes('invalid asset'), msg: 'Invalid ID', sev: 'error' },
                { cond: title.includes('under review'), msg: 'Under review', sev: 'warning' },
                { cond: title.includes('failed'), msg: 'Moderation failed', sev: 'error' },
                { cond: title.includes('ratelimit'), msg: 'Rate limited', sev: 'warning' }
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
            console.error(`Error processing whitelist request: ${error?.message ?? String(error)}`);
            response = {
                type: 'whitelistResponse',
                data: {
                    success: false,
                    audioId: item.message?.data?.audioId ?? 0,
                    whitelisterId: item.message?.data?.whitelisterId ?? 0,
                    severity: 'error',
                    message: error?.message ?? String(error),
                    requestId: item.message?.data?.requestId
                }
            };
        }

        // Send response if socket is still open (best-effort)
        if (message.socket) {
            try {
                await sendResponse(message.socket, response);
                return;
            } catch (socketError: any) {
                console.error(`Socket error sending final response: ${socketError?.message ?? String(socketError)}`);
                // Continue even if socket is closed
            }
        }

        console.log(`Completed whitelist request for audio ${audioId}. Result: ${response.data.success ? 'Success' : 'Failed'}`);
    }
}

const whitelistQueue = new WhitelistQueue();

export default new SelfbotEvent({
    name: "ipcMessage" as any,
    async run(selfbot, message: IPCMessage) {
        // Validate type and respond if unknown
        if (message.type !== "whitelistAudio" && message.socket) {
            return sendResponse(message.socket, { type: 'error', data: { message: 'Unknown IPC type' } });
        }

        // Enqueue and notify client:
        // - if nothing is being processed, client receives 'whitelistProcessing'
        // - if something is already being processed, client receives 'whitelistQueued'
        await whitelistQueue.enqueueAndNotify({ selfbot, message });
    }
});

async function sendSlashCommandWithTimeout(
    channel: any,
    botId: string,
    cmd: string,
    args: any[]
): Promise<Message> {
    const m = await channel.sendSlash(botId, cmd, args);
    if (m.flags.has('LOADING')) {
        return new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error('Command timeout')), 60 * 1000); // 60 seconds
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
