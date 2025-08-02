import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { t, getLocale } from '../../lib/localization';

const userMentionRegex = /<@!?(\d+)>/;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class SelectMenuHandler extends InteractionHandler {
	public async run(interaction: StringSelectMenuInteraction) {
		const locale = getLocale(interaction.locale);
		const selectedValue = interaction.values[0];
		
		// Extract the requester's ID from the message content
		const requester = interaction.message.reference?.messageId
			? await interaction.channel?.messages.fetch(interaction.message.reference.messageId)
			: interaction.message;
		const requesterMention = requester?.content.match(userMentionRegex)?.[1];
		if (!requesterMention) {
			return interaction.update({
				content: t('general.error_find_requester', locale),
				components: []
			});
		}
		
		// Try to get the requester's locale from hidden data, fallback to staff member's locale
		const requesterLocale = locale;
		
		// Extract audio details for the DM
		const idMatch = requester.content.match(/ID:\s*(.+)/);
		const nameMatch = requester.content.match(/Name:\s*(.+)/);
		const categoryMatch = requester.content.match(/Category:\s*(.+)/);
		
		const id = idMatch?.[1] || 'unknown';
		const name = nameMatch?.[1] || 'unknown';
		const category = categoryMatch?.[1] || 'unknown';
		
		// Get the original message content
		const originalContent = requester.content;
		
		let responseMessage = t('general.notified_requester', locale);
		let dmMessage = '';
		
		// For other cases, just update to remove the select menu (ephemeral - can be localized)
		await interaction.update({
			content: responseMessage,
			components: [] // Remove all components (the select menu)
		});
		
		switch (selectedValue) {
			case 'no_permissions':
				// DM - can be localized using requester's locale
				dmMessage = t('issues.no_permissions.dm_message', requesterLocale, {
					id: id,
					category: category,
					name: name,
					userId: interaction.user.id
				});
				break;
			case 'moderated':
				responseMessage = responseMessage + t('general.additionally_ignored', locale);
				// DM - can be localized using requester's locale
				dmMessage = t('issues.moderated.dm_message', requesterLocale, {
					id: id,
					category: category,
					name: name
				});
				
				// Handle like the ignore button for moderated audio
				try {
					// Send the message to the target channel
					const targetChannel = await interaction.client.channels.fetch('1380906344139460688');
					if (targetChannel && targetChannel.isTextBased() && 'send' in targetChannel) {
						// Create a new message in the target channel (public - must be English)
						await targetChannel.send({
							content: `❌ This request has been ignored (moderated audio) by <@${interaction.user.id}>.\n\n${originalContent}`,
							allowedMentions: { parse: [] }
						});
						
						// Delete the original message
						await requester.delete();
					} else {
						// If we can't access the target channel, just update the original message (public - must be English)
						await interaction.message.edit({
							content: `❌ This request has been ignored (moderated audio) by <@${interaction.user.id}>.\n\n${originalContent}`,
							allowedMentions: { parse: [] }
						});
						interaction.followUp({
							content: t('general.failed_move_message', locale),
							flags: [MessageFlags.Ephemeral]
						});
					}
				} catch (error) {
					console.error('Error moving message:', error);
					// If there's an error, just update the original message (public - must be English)
					await interaction.message.edit({
						content: `❌ This request has been ignored (moderated audio) by <@${interaction.user.id}>.\n\n${originalContent}`,
						allowedMentions: { parse: [] }
					});
					interaction.followUp({
						content: t('general.failed_move_message', locale),
						flags: [MessageFlags.Ephemeral]
					});
				}
				break;
			default:
				break;
		}
		
		// Only send DM if we have a message to send
		if (dmMessage) {
			try {
				// Fetch the requester user and send them a DM
				const user = await interaction.client.users.fetch(requesterMention);
				await user.send(dmMessage);
			} catch (error) {
				// If we can't send a DM (e.g., user has DMs disabled)
				console.error(`Failed to send DM to requester ${requesterMention}:`, error);
				
				// Update the interaction response to inform the staff member (ephemeral - can be localized)
				return interaction.followUp({
					content: t('general.failed_dm', locale),
					flags: [MessageFlags.Ephemeral]
				});
			}
		}
		
		return;
	}

	public override parse(interaction: StringSelectMenuInteraction) {
		if (interaction.customId !== 'whitelistrequest-selectissue') return this.none();

		return this.some();
	}
}