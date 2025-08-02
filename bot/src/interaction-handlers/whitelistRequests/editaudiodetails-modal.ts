import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ComponentType, MessageFlags, type ModalSubmitInteraction } from 'discord.js';

function inferBoolean(value: string): boolean {
	switch (value.toLowerCase()) {
		case 'yes':
		case 'y':
		case 'true':
			return true;
		case 'no':
		case 'n':
		case 'false':
			return false;
		default:
			return false;
	}
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class ModalHandler extends InteractionHandler {
	public async run(interaction: ModalSubmitInteraction) {
		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});

		// Get the values from the modal
		const id = interaction.fields.getTextInputValue('id');
		const name = interaction.fields.getTextInputValue('name');
		const category = interaction.fields.getTextInputValue('category');
		const tags = interaction.fields.getTextInputValue('tags');
		const is_private = inferBoolean(interaction.fields.getTextInputValue('is_private'));

		// Get the original message
		const message = interaction.message;
		if (!message) {
			return interaction.editReply({ content: 'Failed to retrieve the original message.' });
		}

		// Extract the requester from the original message
		const userMentionRegex = /<@!?(\d+)>/;
		const robloxUsernameMentionRegex = /\[(.*)\]/;
		const robloxUserIdMentionRegex = /roblox\.com\/users\/(\d+)/;
		const discordRequester = message.content.match(userMentionRegex)?.[1];
		const robloxRequester = { userId: message.content.match(robloxUserIdMentionRegex)?.[1], username: message.content.match(robloxUsernameMentionRegex)?.[1] };
		if (!discordRequester && (!robloxRequester || !robloxRequester.userId || !robloxRequester.username)) {
			return interaction.editReply({ content: 'Failed to extract requester from the message.' });
		}

		// Create the updated message content
		const updatedContent = [
			'**New audio whitelist request**',
			...(discordRequester ? [`<@${discordRequester}> (${discordRequester})`] : []),
			...(robloxRequester.userId && robloxRequester.username ? [`[${robloxRequester.username}](<https://www.roblox.com/users/${robloxRequester.userId}/profile>) (${robloxRequester.userId})`] : []),
			...(is_private ? [':lock: Marked as private — hidden from search results'] : []),
			'```',
			`ID: ${id}`,
			`Name: ${name}`,
			`Category: ${category}`,
			...(tags ? [`Tags: ${tags}`] : []),
			'```'
		].join('\n');

		// Preserve the existing buttons but update them
		const updatedComponents = message.components.map((row) => {
			const actionRow = new ActionRowBuilder<ButtonBuilder>();
			(row as any).components.forEach((component: any) => {
				if (component.type === ComponentType.Button) {
					const button = ButtonBuilder.from(component);
					actionRow.addComponents(button);
				}
			});
			return actionRow;
		});

		// Update the original message
		try {
			await message.edit({
				content: updatedContent,
				components: updatedComponents,
				allowedMentions: { parse: [] }
			});

			return interaction.editReply({ content: ':white_check_mark: Audio details updated successfully!' });
		} catch (error) {
			console.error('Error updating message:', error);
			return interaction.editReply({ content: 'Failed to update the message. Please try again or contact <@208876506146013185>.' });
		}
	}

	public override parse(interaction: ModalSubmitInteraction) {
		if (interaction.customId !== 'editaudiodetails-modal') return this.none();
	
		return this.some();
	}
}