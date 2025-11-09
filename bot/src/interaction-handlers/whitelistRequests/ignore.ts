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
        const requestId = interaction.customId.split('-')?.[2];
		
		// Create the modal for rejection reason
		const modal = new ModalBuilder()
			.setCustomId(`reject-request-modal${requestId ? `-${requestId}` : ''}`)
			.setTitle(t('modals.reject_request.title', locale));

		// Create the text input for rejection reason
		const rejectionReasonInput = new TextInputBuilder()
			.setCustomId('rejection_reason')
			.setLabel(t('modals.reject_request.rejection_reason_label', locale))
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder(t('modals.reject_request.rejection_reason_placeholder', locale))
			.setRequired(false)
			.setMaxLength(1000);

		// Add input to the modal
		const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(rejectionReasonInput);
		modal.addComponents(actionRow);

		// Show the modal
		await interaction.showModal(modal);
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('whitelistrequest-ignore')) return this.none();

		return this.some();
	}
}