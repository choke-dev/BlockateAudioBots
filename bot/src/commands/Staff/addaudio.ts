import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { AutocompleteInteraction, MessageFlags } from 'discord.js';
import { db } from '../../lib/db';
import { audios } from '../../lib/db/schema';
import { and, DrizzleError, eq, ilike, sql } from 'drizzle-orm';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { PostgresError } from 'postgres';
import { t, getLocale, localization } from '../../lib/localization';

const filePath = "./data/addaudio-command-usage.json";

@ApplyOptions<Command.Options>({
	description: 'Adds an audio to the blockate audio database.',
	preconditions: ["StaffOnly"]
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription('Adds an audio to the blockate audio database.')
				.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.description'))
				.addNumberOption(option => option
					.setName('id')
					.setDescription('The id of the audio')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.id'))
					.setRequired(true)
				)
				.addStringOption(option => option
					.setName('name')
					.setDescription('The name of the audio')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.name'))
					.setRequired(true)
				)
				.addStringOption(option => option
					.setName('category')
					.setDescription('The category of the audio')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.category'))
					.setRequired(true)
					.setAutocomplete(true)
				)
				.addStringOption(option => option
					.setName('audio_visibility')
					.setDescription('Indicates if the audio is publicly searchable on the database or not')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.audio_visibility'))
					.setChoices([
						{ name: 'Public', value: 'PUBLIC' },
						{ name: 'Private', value: 'PRIVATE' }
					])
				)
				.addStringOption(option => option
					.setName('audio_lifecycle')
					.setDescription('Indicates if the audio is available or moderated')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.audio_lifecycle'))
					.setChoices([
						{ name: 'Active', value: 'ACTIVE' },
						{ name: 'Moderated', value: 'MODERATED' }
					])
				)
				.addStringOption(option => option
					.setName('whitelister_name')
					.setDescription('The whitelister name')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.whitelister_name'))
				)
				.addStringOption(option => option
					.setName('whitelister_id')
					.setDescription('The whitelister id')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.whitelister_id'))
				)
				.addStringOption(option => option
					.setName('whitelister_type')
					.setDescription('The whitelister type')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.whitelister_type'))
					.setChoices([
						{ name: 'Roblox', value: 'roblox' },
						{ name: 'Discord', value: 'discord' }
					])
				)
				.addStringOption(option => option
					.setName('requester_name')
					.setDescription('The requester name')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.requester_name'))
				)
				.addStringOption(option => option
					.setName('requester_id')
					.setDescription('The requester id')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.requester_id'))
				)
				.addStringOption(option => option
					.setName('requester_type')
					.setDescription('The requester type')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.addaudio.options.requester_type'))
					.setChoices([
						{ name: 'Roblox', value: 'roblox' },
						{ name: 'Discord', value: 'discord' }
					])
				)
		);
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
		const audio_visibility = interaction.options.getString('audio_visibility') as "PUBLIC" | "PRIVATE" | null;
		const audio_lifecycle = interaction.options.getString('audio_lifecycle') as "ACTIVE" | "MODERATED" | null;
		const locale = getLocale(interaction.locale);

		const whitelisterName = interaction.options.getString('whitelister_name');
		const whitelisterId = interaction.options.getString('whitelister_id');
		const whitelisterType = interaction.options.getString('whitelister_type');

		const requesterName = interaction.options.getString('requester_name');
		const requesterId = interaction.options.getString('requester_id');
		const requesterType = interaction.options.getString('requester_type');


		// Check if some but not all whitelister fields are provided
		const hasPartialWhitelisterInfo =
			(whitelisterName !== null || whitelisterId !== null || whitelisterType !== null) &&
			!(whitelisterName !== null && whitelisterId !== null && whitelisterType !== null);

		if (hasPartialWhitelisterInfo) {
			return interaction.editReply({
				content: t('messages.add_audio.partial_whitelister_info', locale)
			});
		}

		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});
		try {
			const whitelisterPayload = {
				discord: { id: null as string | null, name: null as string | null },
				roblox: { id: null as string | null, name: null as string | null }
			};
			const chosenType = (whitelisterType ?? "discord") as "discord" | "roblox";
			whitelisterPayload[chosenType] = {
				id: whitelisterId ?? interaction.user.id,
				name: whitelisterName ?? interaction.user.username
			};
			const requesterPayload = {
				discord: { id: null as string | null, name: null as string | null },
				roblox: { id: null as string | null, name: null as string | null }
			};
			const chosenRequesterType = (requesterType ?? "discord") as "discord" | "roblox";
			requesterPayload[chosenRequesterType] = {
				id: requesterId ?? interaction.user.id,
				name: requesterName ?? interaction.user.username
			};

			const audio = await db
				.insert(audios)
				.values({
					id: BigInt(id),
					name: name,
					category: category,
					whitelister: whitelisterPayload,
					requester: requesterPayload,
					audioVisibility: audio_visibility ?? 'PUBLIC',
					audioLifecycle: audio_lifecycle ?? 'ACTIVE',
				})
				.returning(); // returns created row(s) depending on DB support

			if (audio instanceof Error) {
				throw audio;
			}

		} catch (error: unknown) {
			let isUniqueViolation = false;

			if (error instanceof DrizzleError && error.cause && typeof error.cause === 'object') {
				const cause = error.cause as PostgresError;
				if (cause.code === '23505') {
					isUniqueViolation = true;
				}
			}

			if (isUniqueViolation) {
				return interaction.editReply({
					content: t('messages.add_audio.audio_exists', locale)
				});
			} else {
				console.error(error);
				return interaction.editReply({
					content: t('messages.add_audio.something_wrong', locale)
				});
			}
		}

		if (!existsSync(filePath)) {
			await writeFile(filePath, JSON.stringify([]));
		}

		const fileContent = await readFile(filePath, 'utf-8');
		const jsonData = JSON.parse(fileContent);

		const newEntry = {
			user: interaction.user.id,
			timestamp: Date.now(),
			timestamp_string: new Date(),
			arguments: {
				id,
				name,
				category,
				whitelisterName: whitelisterName ?? interaction.user.username,
				whitelisterUserId: whitelisterId ? parseInt(whitelisterId) : interaction.user.id,
				whitelisterType: whitelisterType ?? "discord",
				audio_visibility: audio_visibility ?? "PUBLIC",
				audio_lifecycle: audio_lifecycle ?? "ACTIVE",
			}
		};

		jsonData.push(newEntry);
		writeFileSync(filePath, JSON.stringify(jsonData, null, 2));

		return interaction.editReply({
			content: t('messages.add_audio.success', locale, {
				id: id,
				name: name,
				category: category,
				whitelisterName: whitelisterName ?? interaction.user.username,
				whitelisterId: whitelisterId ? whitelisterId : interaction.user.id,
				whitelisterType: whitelisterType ?? "discord",
				visibility: audio_visibility ?? "PUBLIC",
				lifecycle: audio_lifecycle ?? "ACTIVE"
			})
		})
	}
}
