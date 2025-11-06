import { container } from '@sapphire/framework';
import * as crypto from 'crypto';
import * as net from 'net';
import * as path from 'path';

interface WhitelistResponseData {
	success: boolean;
	audioId: number;
	whitelisterId: number;
	severity: string;
	message?: string;
	requestId?: string;
}

export interface WhitelistResponse {
	type: string;
	data: WhitelistResponseData;
}

// Socket server configuration
export type SocketConfig = {
	path: string;
	connectionTimeout: number;
	queueTimeout: number;
	maxReconnects: number;
};

export class SelfBotSocket {
	private static instance: SelfBotSocket;
	private constructor() {}
	private readonly socketConfig: SocketConfig = {
		path: path.join('/app', 'ipc', 'blockate-audio-whitelisting.sock'),
		connectionTimeout: 30000,
		queueTimeout: 30 * 1000,
		maxReconnects: 3
	};

	// Persistent socket and state
	private client: net.Socket | null = null;
	private isConnecting = false;
	private reconnectCount = 0;

	public static getInstance(): SelfBotSocket {
		if (!SelfBotSocket.instance) {
			SelfBotSocket.instance = new SelfBotSocket();
		}
		return SelfBotSocket.instance;
	}

	private generateUUID(): string {
		const b = crypto.randomBytes(16);
		b[6] = (b[6] & 0x0f) | 0x40;
		b[8] = (b[8] & 0x3f) | 0x80;
		const h = b.toString('hex');
		return [h.substr(0, 8), h.substr(8, 4), h.substr(12, 4), h.substr(16, 4), h.substr(20)].join('-');
	}

	/**
	 * Ensures a socket connection is established, retrying up to maxReconnects times.
	 */
	private async ensureConnection(): Promise<net.Socket> {
		if (this.client && !this.client.destroyed) {
			return this.client;
		}
		if (this.isConnecting) {
			// Wait until connection completes
			return new Promise((resolve, reject) => {
				const check = () => {
					if (this.client && !this.client.destroyed) return resolve(this.client);
					if (!this.isConnecting && (!this.client || this.client.destroyed)) return reject(new Error('Failed to connect to IPC server'));
					setTimeout(check, 100);
				};
				check();
			});
		}

		this.isConnecting = true;
		while (this.reconnectCount < this.socketConfig.maxReconnects) {
			this.reconnectCount++;
			try {
				await new Promise<void>((resolve, reject) => {
					const client = new net.Socket();
					const timeout = setTimeout(() => {
						client.destroy();
						reject(new Error('Connection timeout'));
					}, this.socketConfig.connectionTimeout);

					client.connect({ path: this.socketConfig.path }, () => {
						clearTimeout(timeout);
						container.logger.debug(`IPC connected (attempt ${this.reconnectCount})`);
						this.client = client;
						client.on('error', (err) => {
							container.logger.error('IPC socket error:', err);
							client.destroy();
						});
						client.on('close', () => {
							container.logger.debug('IPC socket closed');
						});
						resolve();
					});
				});
				// Reset reconnect count on success
				this.reconnectCount = 0;
				break;
			} catch (err) {
				if (!(err instanceof Error)) break;
				container.logger.warn(`IPC connect attempt ${this.reconnectCount} failed: ${err?.message}`);
				if (this.reconnectCount >= this.socketConfig.maxReconnects) {
					this.isConnecting = false;
					console.error('Max IPC reconnects reached');
				}
			}
		}
		this.isConnecting = false;
		if (this.client) return this.client;
		throw new Error('Unable to establish IPC connection');
	}

	/**
	 * Sends an IPC message over the persistent socket, handles timeouts and response.
	 */
	public async sendIpcMessage(
		type: string,
		data: any,
		onQueued?: () => Promise<void> | void,
		onProcessing?: () => Promise<void> | void
	): Promise<WhitelistResponse> {
		// Ensure socket connection
		const client = await this.ensureConnection();
		const requestId = this.generateUUID();

		return new Promise((resolve, reject) => {
			let currentTimeout: NodeJS.Timeout;
			let processingTimeout: NodeJS.Timeout;

			const setQueueTimeout = () => {
				clearTimeout(currentTimeout);
				currentTimeout = setTimeout(() => {
					client.removeAllListeners('data');
					reject(new Error('Queue timeout - request took too long'));
				}, this.socketConfig.queueTimeout);
			};

			const setProcessingTimeout = () => {
				clearTimeout(processingTimeout);
				processingTimeout = setTimeout(() => {
					client.removeAllListeners('data');
					reject(new Error('Processing timeout - whitelisting took too long'));
				}, 30000); // 30 seconds for processing timeout
			};

			// Start queue timeout immediately
			setQueueTimeout();

			// Send the message
			const message = JSON.stringify({ type, data: { ...data, requestId } });
			client.write(message);
			container.logger.debug(`Sent IPC message: ${type} (request ${requestId})`);

			let buf = '';
			const onData = async (chunk: Buffer) => {
				buf += chunk.toString();

				let newlineIndex;
				while ((newlineIndex = buf.indexOf('\n')) !== -1) {
					const messageStr = buf.slice(0, newlineIndex);
					buf = buf.slice(newlineIndex + 1);

					let msg;
					try {
						msg = JSON.parse(messageStr);
					} catch (err) {
						container.logger.error('Invalid JSON from IPC:', messageStr);
						continue;
					}

					if (msg.data?.requestId !== requestId) continue;

					container.logger.debug(`Received IPC message: ${msg.type} (request ${requestId})`);
					switch (msg.type) {
						case 'whitelistQueued':
							//setQueueTimeout();
							if (onQueued) await onQueued();
							break;
						case 'whitelistProcessing':
							clearTimeout(currentTimeout); // Clear queue timeout
							setProcessingTimeout(); // Start processing timeout
							if (onProcessing) await onProcessing();
							break;
						case 'whitelistResponse':
							clearTimeout(currentTimeout);
							clearTimeout(processingTimeout);
							client.removeListener('data', onData);
							return resolve(msg as WhitelistResponse);
					}
				}
			};

			client.on('data', onData);

			client.once('error', (err) => {
				clearTimeout(currentTimeout);
				clearTimeout(processingTimeout);
				client.removeListener('data', onData);
				reject(err);
			});
		});
	}
}
