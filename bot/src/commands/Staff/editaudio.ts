import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { AutocompleteInteraction, MessageFlags } from 'discord.js';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { db } from '../../lib/db';
import { audios } from '../../lib/db/schema';

const filePath = "./data/editaudio-command-usage.json";

@ApplyOptions<Command.Options>({
	description: 'Edits an audio in the blockate audio database.',
	preconditions: ["StaffOnly"]
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
				.addNumberOption(option => option
					.setName('id')
					.setDescription('The id of the audio to edit')
					.setRequired(true)
				)
				.addStringOption(option => option
					.setName('name')
					.setDescription('The new name of the audio')
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('category')
					.setDescription('The new category of the audio')
					.setRequired(false)
					.setAutocomplete(true)
				)
				.addStringOption(option => option
					.setName('audio_visibility')
					.setDescription('The new visibility of the audio')
					.setChoices([
						{ name: 'Public', value: 'PUBLIC' },
						{ name: 'Private', value: 'PRIVATE' }
					])
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('audio_lifecycle')
					.setDescription('The new lifecycle status of the audio')
					.setChoices([
						{ name: 'Active', value: 'ACTIVE' },
						{ name: 'Moderated', value: 'MODERATED' }
					])
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('whitelister_name')
					.setDescription('The new whitelister name')
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('whitelister_id')
					.setDescription('The new whitelister id')
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('whitelister_type')
					.setDescription('The new whitelister type')
					.setChoices([
						{ name: 'Roblox', value: 'roblox' },
						{ name: 'Discord', value: 'discord' }
					])
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('requester_name')
					.setDescription('The new requester name')
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('requester_id')
					.setDescription('The new requester id')
					.setRequired(false)
				)
				.addStringOption(option => option
					.setName('requester_type')
					.setDescription('The new requester type')
					.setChoices([
						{ name: 'Roblox', value: 'roblox' },
						{ name: 'Discord', value: 'discord' }
					])
					.setRequired(false)
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
		const name = interaction.options.getString('name');
		const category = interaction.options.getString('category');
		const audio_visibility = interaction.options.getString('audio_visibility') as "PUBLIC" | "PRIVATE" | null;
		const audio_lifecycle = interaction.options.getString('audio_lifecycle') as "ACTIVE" | "MODERATED" | null;

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
			return interaction.reply({
				content: ":x: If providing whitelister information, all fields (name, id, and type) must be filled out.",
				flags: [MessageFlags.Ephemeral]
			});
		}

		// Check if some but not all requester fields are provided
		const hasPartialRequesterInfo =
			(requesterName !== null || requesterId !== null || requesterType !== null) &&
			!(requesterName !== null && requesterId !== null && requesterType !== null);

		if (hasPartialRequesterInfo) {
			return interaction.reply({
				content: ":x: If providing requester information, all fields (name, id, and type) must be filled out.",
				flags: [MessageFlags.Ephemeral]
			});
		}

		// Check if at least one field is provided for editing
		if (!name && !category && !audio_visibility && !audio_lifecycle && !whitelisterName && !requesterName) {
			return interaction.reply({
				content: ":x: At least one field must be provided to edit the audio.",
				flags: [MessageFlags.Ephemeral]
			});
		}

		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});

		try {
			// First, check if the audio exists
			const existingAudio = await db
				.select()
				.from(audios)
				.where(eq(audios.id, BigInt(id)))
				.limit(1);

			if (existingAudio.length === 0) {
				return interaction.editReply({
					content: ":x: No audio with the specified ID exists in the database."
				});
			}

			// Prepare update object with only provided fields
			const updateData: any = {};

			if (name !== null) updateData.name = name;
			if (category !== null) updateData.category = category;
			if (audio_visibility !== null) updateData.audio_visibility = audio_visibility;
			if (audio_lifecycle !== null) updateData.audio_lifecycle = audio_lifecycle;

			// Handle whitelister update
			if (whitelisterName !== null && whitelisterId !== null && whitelisterType !== null) {
				const whitelisterPayload = {
					discord: { id: null as string | null, name: null as string | null },
					roblox: { id: null as string | null, name: null as string | null }
				};
				const chosenType = whitelisterType as "discord" | "roblox";
				whitelisterPayload[chosenType] = {
					id: whitelisterId,
					name: whitelisterName
				};
				updateData.whitelister = whitelisterPayload;
			}

			// Handle requester update
			if (requesterName !== null && requesterId !== null && requesterType !== null) {
				const requesterPayload = {
					discord: { id: null as string | null, name: null as string | null },
					roblox: { id: null as string | null, name: null as string | null }
				};
				const chosenRequesterType = requesterType as "discord" | "roblox";
				requesterPayload[chosenRequesterType] = {
					id: requesterId,
					name: requesterName
				};
				updateData.requester = requesterPayload;
			}

			// Update the audio
			const updatedAudio = await db
				.update(audios)
				.set(updateData)
				.where(eq(audios.id, BigInt(id)))
				.returning();

			if (updatedAudio.length === 0) {
				throw new Error("Failed to update audio");
			}

		} catch (error: unknown) {
			console.error(error);
			return interaction.editReply({
				content: "Something went wrong, please contact <@208876506146013185>."
			});
		}

		// Log the edit operation
		console.log(`Attempting to access file at: ${filePath}`);
		try {
			if (!existsSync(filePath)) {
				console.log(`File doesn't exist, creating it...`);
				try {
					await writeFile(filePath, JSON.stringify([]));
					console.log(`Successfully created file`);
				} catch (error: any) {
					console.error(`Error creating file: ${error.message}`);
					console.error(`Error code: ${error.code}`);
					// Continue execution to see if we can read the file anyway
				}
			} else {
				console.log(`File exists`);
			}
		} catch (error: any) {
			console.error(`Error checking if file exists: ${error.message}`);
			console.error(`Error code: ${error.code}`);
		}

		const fileContent = await readFile(filePath, 'utf-8');
		const jsonData = JSON.parse(fileContent);

		const newEntry = {
			user: interaction.user.id,
			timestamp: Date.now(),
			timestamp_string: new Date(),
			arguments: {
				id,
				...(name && { name }),
				...(category && { category }),
				...(whitelisterName && { whitelisterName }),
				...(whitelisterId && { whitelisterUserId: whitelisterId }),
				...(whitelisterType && { whitelisterType }),
				...(requesterName && { requesterName }),
				...(requesterId && { requesterUserId: requesterId }),
				...(requesterType && { requesterType }),
				...(audio_visibility && { audio_visibility }),
				...(audio_lifecycle && { audio_lifecycle })
			}
		};

		jsonData.push(newEntry);
		writeFileSync(filePath, JSON.stringify(jsonData, null, 2));

		// Build response message
		const responseLines = [":white_check_mark: Successfully edited audio in the database.", "", `ID: ${id}`];
		
		if (name) responseLines.push(`New Name: ${name}`);
		if (category) responseLines.push(`New Category: ${category}`);
		if (whitelisterName) responseLines.push(`New Whitelister: ${whitelisterName} (${whitelisterId}) [${whitelisterType}]`);
		if (requesterName) responseLines.push(`New Requester: ${requesterName} (${requesterId}) [${requesterType}]`);
		if (audio_visibility) responseLines.push(`New Visibility: ${audio_visibility}`);
		if (audio_lifecycle) responseLines.push(`New Lifecycle: ${audio_lifecycle}`);

		return interaction.editReply({
			content: responseLines.join("\n")
		});
	}
}