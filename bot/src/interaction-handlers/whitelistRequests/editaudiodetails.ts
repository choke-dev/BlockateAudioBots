import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from 'discord.js';
import { t, getLocale } from '../../lib/localization';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		const locale = getLocale(interaction.locale);
		
		// Extract ID, Name, Category, and Tags using regex
		const idMatch = interaction.message.content.match(/ID:\s*(.+)/);
		const nameMatch = interaction.message.content.match(/Name:\s*(.+)/);
		const categoryMatch = interaction.message.content.match(/Category:\s*(.+)/);
		const tagsMatch = interaction.message.content.match(/Tags:\s*(.+)/);
		const is_private = interaction.message.content.includes('Marked as private');

		const id = idMatch?.[1] || '';
		const name = nameMatch?.[1] || '';
		const category = categoryMatch?.[1] || '';
		const tags = tagsMatch?.[1] || '';

		// Create the modal
		const modal = new ModalBuilder()
			.setCustomId('editaudiodetails-modal')
			.setTitle(t('modals.edit_audio_details.title', locale));

		// Create the text input components
		const idInput = new TextInputBuilder()
			.setCustomId('id')
			.setLabel(t('modals.edit_audio_details.id_label', locale))
			.setStyle(TextInputStyle.Short)
			.setValue(id)
			.setRequired(true);

		const nameInput = new TextInputBuilder()
			.setCustomId('name')
			.setLabel(t('modals.edit_audio_details.name_label', locale))
			.setStyle(TextInputStyle.Short)
			.setValue(name)
			.setRequired(true);

		const categoryInput = new TextInputBuilder()
			.setCustomId('category')
			.setLabel(t('modals.edit_audio_details.category_label', locale))
			.setStyle(TextInputStyle.Short)
			.setValue(category)
			.setRequired(true);

		const tagsInput = new TextInputBuilder()
			.setCustomId('tags')
			.setLabel(t('modals.edit_audio_details.tags_label', locale))
			.setStyle(TextInputStyle.Short)
			.setValue(tags)
			.setRequired(false);

		const isPrivateInput = new TextInputBuilder()
			.setCustomId('is_private')
			.setLabel(t('modals.edit_audio_details.is_private_label', locale))
			.setStyle(TextInputStyle.Short)
			.setValue(is_private ? 'true' : 'false')
			.setRequired(true);

		// Add inputs to the modal
		const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(idInput);
		const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
		const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput);
		const fourthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput);
		const fifthActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(isPrivateInput);

		modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);

		// Show the modal
		await interaction.showModal(modal);
	}

	public override parse(interaction: ButtonInteraction) {
		if (interaction.customId !== 'whitelistrequest-editaudiodetails') return this.none();

		return this.some();
	}
}