import { ApplyOptions } from '@sapphire/decorators';
import { container, InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import * as crypto from 'crypto';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import * as net from 'net';
import * as path from 'path';
import { t, getLocale } from '../../lib/localization';

// Interfaces for IPC messages
interface WhitelistResponseData {
	success: boolean;
	audioId: number;
	whitelisterId: number;
	severity: string;
	message?: string;
	requestId?: string;
}

interface WhitelistResponse {
	type: string;
	data: WhitelistResponseData;
}

// Socket server configuration
type SocketConfig = {
	path: string;
	connectionTimeout: number;
	queueTimeout: number;
	maxReconnects: number;
};

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class ButtonHandler extends InteractionHandler {
	// Default socket configuration
	private readonly socketConfig: SocketConfig = {
		path: path.join("/app", "ipc", 'blockate-audio-whitelisting.sock'),
		connectionTimeout: 30000,
		queueTimeout: 30 * 1000,
		maxReconnects: 3
	};

	// Persistent socket and state
	private client: net.Socket | null = null;
	private isConnecting = false;
	private reconnectCount = 0;

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
						client.on('error', err => {
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
	private async sendIpcMessage(
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
							setQueueTimeout();
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

			client.once('error', err => {
				clearTimeout(currentTimeout);
				clearTimeout(processingTimeout);
				client.removeListener('data', onData);
				reject(err);
			});
		});
	}

	public async run(interaction: ButtonInteraction) {
		const locale = getLocale(interaction.locale);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		// extract details
		const id = interaction.message.content.match(/ID:\s*(\d+)/)?.[1] ?? '';
		const category = interaction.message.content.match(/Category:\s*(.+)/)?.[1] ?? '';
		const is_private = interaction.message.content.includes('Marked as private');
		const whitelisterId = interaction.user.id;
		const orig = interaction.message;

		// Button update data type
		type ButtonUpdate = {
			customId: string;
			label?: string;
			disabled?: boolean;
		};

		const updateButton = async (updates: ButtonUpdate | ButtonUpdate[] | string, label?: string, disabled: boolean = false) => {
			if (!orig.components.length) return;

			// Handle both old and new function signatures
			let updateArray: ButtonUpdate[] = [];

			if (typeof updates === 'string') {
				// Old signature: (customId, label, disabled)
				updateArray = [{
					customId: updates,
					label: label,
					disabled: disabled
				}];
			} else {
				// New signature: (updates)
				updateArray = Array.isArray(updates) ? updates : [updates];
			}

			const comps = orig.components.map(r => ({
				type: 1, components: (r as any).components.map((c: any) => {
					// Check if this component should be updated
					const update = updateArray.find(u => c.type === 2 && c.customId === u.customId);
					if (update) {
						// Create a new object with the updated properties
						return {
							...c.data,
							...(update.label !== undefined && { label: update.label }),
							...(update.disabled !== undefined && { disabled: update.disabled })
						};
					}
					return c.data;
				})
			}));

			await orig.edit({ components: comps });
		};

		try {
			// Define status update handlers (these run on the bot side when messages are received)
			const onQueuedHandler = async () => {
				await updateButton('whitelistrequest-attemptwhitelist', t('buttons.in_queue', locale), true);
			};

			const onProcessingHandler = async () => {
				await updateButton('whitelistrequest-attemptwhitelist', t('buttons.whitelisting', locale), true);
			};

			// Log the whitelist attempt
			container.logger.info(`Attempting to whitelist audio ${id} by user ${whitelisterId}`);

			const response = await this.sendIpcMessage(
				'whitelistAudio',
				{
					audioId: Number(id),
					category,
					is_private,
					whitelisterId,
					interactionId: interaction.id,
					timestamp: new Date().toISOString() // Add timestamp for tracking
				},
				onQueuedHandler,
				onProcessingHandler
			);

			if (response.data.success || response.data.severity === 'info') {
				console.log(`Whitelisted audio ${id} by user ${whitelisterId}`);
				await updateButton([
					{ customId: 'whitelistrequest-attemptwhitelist', label: t('buttons.whitelisted', locale), disabled: true },
					{ customId: 'whitelistrequest-markdone', label: t('buttons.mark_done', locale), disabled: false }
				]);
				return interaction.editReply({ content: t('messages.whitelist_attempt.whitelisted', locale, { id: id }) });
			} else {
				await updateButton('whitelistrequest-attemptwhitelist', t('buttons.attempt_whitelist', locale), false);
				return interaction.editReply({ content: `❌ ${response.data.message}` });
			}
		} catch (e) {
			// Log the detailed error
			container.logger.error(`Error whitelisting audio ${id}:`, e);

			// Determine a more specific error message based on the error type
			let errorMessage = t('messages.whitelist_attempt.socket_error', locale);

			if (e instanceof Error) {
				if (e.message.includes('Processing timeout')) {
					errorMessage = t('messages.whitelist_attempt.processing_timeout', locale);
				} else if (e.message.includes('Queue timeout')) {
					errorMessage = t('messages.whitelist_attempt.queue_timeout', locale);
				} else if (e.message.includes('ECONNREFUSED') || e.message.includes('ENOENT')) {
					errorMessage = t('messages.whitelist_attempt.connection_error', locale);
				}
			}

			await updateButton('whitelistrequest-attemptwhitelist', t('buttons.attempt_whitelist', locale), false);
			return interaction.editReply({ content: errorMessage });
		}
	}

	public override parse(interaction: ButtonInteraction) {
		return interaction.customId === 'whitelistrequest-attemptwhitelist' ? this.some() : this.none();
	}
}