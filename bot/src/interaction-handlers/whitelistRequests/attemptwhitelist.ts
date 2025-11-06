import { ApplyOptions } from '@sapphire/decorators';
import { container, InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { getLocale, t } from '../../lib/localization';
import { SelfBotSocket } from '../../lib/selfbot-socket';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		const locale = getLocale(interaction.locale);
		await interaction.deferUpdate();

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
					const update = updateArray.find(u => c.type === 2 && c.customId.startsWith(u.customId));
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

			const socket = SelfBotSocket.getInstance();
			const response = await socket.sendIpcMessage(
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
				return updateButton([
					{ customId: 'whitelistrequest-attemptwhitelist', label: t('buttons.whitelisted', locale), disabled: true },
					{ customId: 'whitelistrequest-markdone', label: t('buttons.mark_done', locale), disabled: false }
				]);
			} else {
				await updateButton('whitelistrequest-attemptwhitelist', t('buttons.attempt_whitelist', locale), false);
				return interaction.followUp({ content: `❌ ${response.data.message}` });
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
		return interaction.customId.startsWith('whitelistrequest-attemptwhitelist') ? this.some() : this.none();
	}
}