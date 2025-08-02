import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ActionRowBuilder, AttachmentBuilder, AutocompleteInteraction, ButtonBuilder, ButtonStyle, InteractionContextType, MessageFlags } from 'discord.js';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { fetchAudioUrls } from '../../lib/audioService';
import { db } from '../../lib/db';
import { audios } from '../../lib/db/schema';
import { getLocale, localization, t } from '../../lib/localization';
import validateAudio from '../../lib/validateAudio';

const REQUESTS_CHANNEL_ID = "1373443972025815070";

@ApplyOptions<Command.Options>({
	description: 'Requests whitelisting for an audio',
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry
			.registerChatInputCommand((builder) =>
				builder //
					.setName(this.name)
					.setDescription('Requests whitelisting for an audio')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.description'))
					.setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])

					.addNumberOption(option => option
						.setName('id')
						.setDescription('The ID of the audio')
						.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.options.id'))
						.setRequired(true))
					.addStringOption(option => option
						.setName('name')
						.setDescription('The name of the audio')
						.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.options.name'))
						.setRequired(true))
					.addStringOption(option => option
						.setName('category')
						.setDescription('The category/source of the audio')
						.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.options.category'))
						.setRequired(true)
						.setAutocomplete(true))
					.addStringOption(option => option
						.setName('tags')
						.setDescription('Comma-separated tags for the audio (e.g., "meme, funny, loud")')
						.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.options.tags'))
						.setRequired(false))
					.addBooleanOption(option => option
						.setName('private')
						.setDescription('Indicates if the audio is private, used for world-specific audio')
						.setDescriptionLocalizations(localization.createLocalizationMap('commands.requestwhitelist.options.private'))
						.setRequired(false))
				, {
					guildIds: undefined
				});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const focusedOption = interaction.options.getFocused(true);

		if (focusedOption.name !== 'category') return interaction.respond([]);
		if (focusedOption.value.length < 3) return interaction.respond([]);

		const input = focusedOption.value.toLowerCase();

		const foundCategories = await db
			.select({
				category: audios.category,
			})
			.from(audios)
			.where(
				and(
					eq(audios.audioVisibility, 'PUBLIC'),
					eq(audios.audioLifecycle, 'ACTIVE'),
					ilike(
						sql`LOWER(${audios.category})`,
						`%${input.toLowerCase()}%`
					)
				)
			)
			.limit(25);

		const uniqueCategories = Array.from(new Set(foundCategories.map(category => category.category)));
		const options = uniqueCategories.map(category => ({
			name: category,
			value: category
		}));

		try {
			return interaction.respond(options);
		} catch (error) { }
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const id = interaction.options.getNumber('id', true);
		const name = interaction.options.getString('name', true);
		const category = interaction.options.getString('category', true);
		const tags = interaction.options.getString('tags');
		const is_private = interaction.options.getBoolean('private');
		const locale = getLocale(interaction.locale);
		console.log(interaction.locale)
		console.log(locale)

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		// Buttons for public channel - must be in English
		const acceptButton = new ButtonBuilder()
			.setCustomId('whitelistrequest-markdone')
			.setLabel('Mark as done')
			.setEmoji('✅')
			.setDisabled(true)
			.setStyle(ButtonStyle.Success);

		const attemptWhitelist = new ButtonBuilder()
			.setCustomId('whitelistrequest-attemptwhitelist')
			.setLabel('Attempt whitelist')
			.setEmoji('📥')
			.setStyle(ButtonStyle.Primary);

		const editButton = new ButtonBuilder()
			.setCustomId('whitelistrequest-editaudiodetails')
			.setLabel('Edit audio details')
			.setEmoji('📝')
			.setStyle(ButtonStyle.Secondary);

		const raiseIssueButton = new ButtonBuilder()
			.setCustomId('whitelistrequest-raiseissue')
			.setLabel('Raise issue')
			.setEmoji('⚠️')
			.setStyle(ButtonStyle.Danger);

		const deleteButton = new ButtonBuilder()
			.setCustomId('whitelistrequest-ignore')
			.setLabel('Ignore request')
			.setEmoji('🗑️')
			.setStyle(ButtonStyle.Danger);

		const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton, attemptWhitelist, editButton, raiseIssueButton, deleteButton);

		const guild = interaction.client.guilds.cache.get('1175226662745546793');
		const channel = guild?.channels.cache.get(REQUESTS_CHANNEL_ID);
		if (!(channel?.isTextBased())) {
			return interaction.editReply({ content: t('messages.request_whitelist.channel_error', locale) });
		}

		// Check if audio already exists using Drizzle ORM
		const audioExists = await db
			.select({
				id: audios.id,
				name: audios.name,
				category: audios.category
			})
			.from(audios)
			.where(eq(audios.id, BigInt(id)))
			.limit(1);

		if (audioExists.length > 0) {
			const existingAudio = audioExists[0];
			return interaction.editReply({
				content: t('messages.request_whitelist.audio_exists', locale, {
					id: id,
					name: existingAudio.name,
					category: existingAudio.category
				})
			});
		}

		const audioMetadata = await validateAudio(id);
		if (!audioMetadata.success) {
			return interaction.editReply({
				content: audioMetadata.reason
			});
		}

		const audioUrlsResponse = await fetchAudioUrls([id]);

		if (!audioUrlsResponse.success) {

			console.error(audioUrlsResponse)
			switch (audioUrlsResponse.code) {
				case 403:
					return interaction.editReply({
						content: t('messages.request_whitelist.permission_error', locale, { id: id })
					});
				default:
					return interaction.editReply({
						content: audioUrlsResponse.reason
					})
			}

		}

		const audioFileUrl = audioUrlsResponse.audioUrls[0]
		const audioFile = await fetch(audioFileUrl)
		const audioFileBuffer = await audioFile.arrayBuffer()
		const audioFileAttachment = new AttachmentBuilder(Buffer.from(audioFileBuffer), { name: `${id}.ogg` });

		try {
			// Public message - must be in English
			channel.send({
				content: [
					'**New audio whitelist request**',
					`Requested by <@${interaction.user.id}> (${interaction.user.id})`,
					...(is_private ? [':lock: Marked as private — hidden from search results'] : []),
					'```',
					`ID: ${id}`,
					`Name: ${name}`,
					`Category: ${category}`,
					...(tags ? [`Tags: ${tags}`] : []),
					'```'
				].join("\n"),
				allowedMentions: { parse: [] },
				components: [actionRow],
				files: [audioFileAttachment]
			});
			
			// Determine which success message to use based on tags and privacy
			let successKey = 'messages.request_whitelist.request_sent';
			if (tags && is_private) {
				successKey = 'messages.request_whitelist.request_sent_with_tags_private';
			} else if (tags) {
				successKey = 'messages.request_whitelist.request_sent_with_tags';
			} else if (is_private) {
				successKey = 'messages.request_whitelist.request_sent_private';
			}
			
			return interaction.editReply({
				content: t(successKey, locale, {
					id: id,
					name: name,
					category: category,
					tags: tags
				})
			});
		} catch (error) {
			return interaction.editReply({ content: t('messages.request_whitelist.send_failed', locale) });
		}

	}
}
