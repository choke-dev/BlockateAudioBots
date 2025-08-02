import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { ActionRowBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { t, getLocale } from '../../lib/localization';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
	public async run(interaction: ButtonInteraction) {
		const locale = getLocale(interaction.locale);
		
		// Create a select menu with issue options
		const select = new StringSelectMenuBuilder()
			.setCustomId('whitelistrequest-selectissue')
			.setPlaceholder(t('issues.select_placeholder', locale))
			.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel(t('issues.no_permissions.label', locale))
					.setEmoji('🔒')
					.setValue('no_permissions')
					.setDescription(t('issues.no_permissions.description', locale)),
				new StringSelectMenuOptionBuilder()
					.setLabel(t('issues.moderated.label', locale))
					.setEmoji('🚫')
					.setValue('moderated')
					.setDescription(t('issues.moderated.description', locale))
			);

		// Create an action row with the select menu
		const row = new ActionRowBuilder<StringSelectMenuBuilder>()
			.addComponents(select);

		// Reply with the select menu (ephemeral - can be localized)
		await interaction.reply({
			content: t('issues.select_prompt', locale),
			components: [row],
			flags: [MessageFlags.Ephemeral]
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (interaction.customId !== 'whitelistrequest-raiseissue') return this.none();

		return this.some();
	}
}