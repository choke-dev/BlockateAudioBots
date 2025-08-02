import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { db } from '../../lib/db';
import { whitelistRequests } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { t, getLocale } from '../../lib/localization';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		const locale = getLocale(interaction.locale);
		
		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});

		const rejectionReason = interaction.fields.getTextInputValue('rejection_reason') || null;
		const deleter = interaction.user;

		// Get the original message content
		const originalContent = interaction.message?.content;
		if (!originalContent) {
			return interaction.editReply({ content: t('rejection.failed_retrieve', locale) });
		}
		
		// Try to get the requester's locale from hidden data, fallback to staff member's locale
		const requesterLocale = locale;

		// Extract requester information
		const userMentionRegex = /<@!?(\d+)>/;
		const discordRequesterId = originalContent.match(userMentionRegex)?.[1] || null;

		const idMatch = originalContent.match(/ID:\s*(.+)/);
		const nameMatch = originalContent.match(/Name:\s*(.+)/);
		const categoryMatch = originalContent.match(/Category:\s*(.+)/);
		const tagsMatch = originalContent.match(/Tags:\s*(.+)/);
		const isPrivate = originalContent.includes(':lock:');

		const id = idMatch?.[1];
		const name = nameMatch?.[1];
		const category = categoryMatch?.[1];
		const tags = tagsMatch?.[1];

		if (id) {
			try {
				// Update whitelist requests status using Drizzle ORM
				await db
					.update(whitelistRequests)
					.set({
						status: 'REJECTED',
						rejectionReason: rejectionReason,
						updatedAt: new Date().toISOString()
					})
					.where(eq(whitelistRequests.audioId, id));
			} catch (error) {
				console.error('Error updating whitelist request status:', error);
				return interaction.editReply({ content: t('rejection.failed_update', locale) });
			}
		}

		try {
			// Send the message to the new channel
			const targetChannel = await interaction.client.channels.fetch('1380906344139460688');
			if (targetChannel && targetChannel.isTextBased() && 'send' in targetChannel) {
				// Create rejection message content (public - must be English)
				let rejectionContent = `❌ This request has been rejected by <@${deleter.id}>.`;
				if (rejectionReason) {
					rejectionContent += `\n**Rejection Reason:** ${rejectionReason}`;
				}
				rejectionContent += `\n\n${originalContent}`;

				// Create a new message in the target channel
				await targetChannel.send({
					content: rejectionContent,
					allowedMentions: { parse: [] }
				});
				
				// Delete the original message
				await interaction.message?.delete();
				
				interaction.editReply({ content: t('rejection.success', locale) });
			} else {
				// If we can't access the target channel, just update the original message (public - must be English)
				let rejectionContent = `❌ This request has been rejected by <@${deleter.id}>.`;
				if (rejectionReason) {
					rejectionContent += `\n**Rejection Reason:** ${rejectionReason}`;
				}
				rejectionContent += `\n\n${originalContent}`;

				await interaction.message?.edit({
					content: rejectionContent,
					allowedMentions: { parse: [] }
				});
				
				interaction.editReply({
					content: t('rejection.failed_move', locale)
				});
			}
		} catch (error) {
			console.error('Error moving message:', error);
			// If there's an error, just update the original message (public - must be English)
			let rejectionContent = `❌ This request has been rejected by <@${deleter.id}>.`;
			if (rejectionReason) {
				rejectionContent += `\n**Rejection Reason:** ${rejectionReason}`;
			}
			rejectionContent += `\n\n${originalContent}`;

			await interaction.message?.edit({
				content: rejectionContent,
				allowedMentions: { parse: [] }
			});
			
			interaction.editReply({
				content: t('rejection.failed_move', locale)
			});
		}

		// DM Discord requester if they exist (DM - can be localized using requester's locale)
		if (discordRequesterId) {
			try {
				const user = await interaction.client.users.fetch(discordRequesterId!);
				const privateText = isPrivate ? t('rejection.dm_message_private', requesterLocale) : '';
				const tagsText = tags ? t('rejection.dm_message_tags', requesterLocale, { tags: tags }) : '';
				let dmMessage = t('rejection.dm_message', requesterLocale, {
					private: privateText,
					id: id,
					category: category,
					name: name,
					tags: tagsText,
					userId: deleter.id
				});
				
				if (rejectionReason) {
					dmMessage += `\n\n${t('rejection.rejection_reason', requesterLocale, { reason: rejectionReason })}`;
				}
				
				await user.send(dmMessage);
			} catch (err) {
				console.error('DM error:', err);
				// Don't fail the entire operation if DM fails
			}
		}

		return;
	}

	public override parse(interaction: ModalSubmitInteraction) {
		if (interaction.customId !== 'reject-request-modal') return this.none();

		return this.some();
	}
}