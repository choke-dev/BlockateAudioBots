import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { db } from '../../lib/db';
import { audios } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { t, getLocale, localization } from '../../lib/localization';

const filePath = "./data/deleteaudio-command-usage.json";

@ApplyOptions<Command.Options>({
	description: 'Deletes an audio from the blockate audio database.',
	preconditions: ["StaffOnly"]
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription('Deletes an audio from the blockate audio database.')
				.setDescriptionLocalizations(localization.createLocalizationMap('commands.deleteaudio.description'))
				.addNumberOption(option => option
					.setName('id')
					.setDescription('The id of the audio to delete')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.deleteaudio.options.id'))
					.setRequired(true)
				)
				.addBooleanOption(option => option
					.setName('confirm')
					.setDescription('Confirm that you want to delete this audio (required)')
					.setDescriptionLocalizations(localization.createLocalizationMap('commands.deleteaudio.options.confirm'))
					.setRequired(true)
				)
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const id = interaction.options.getNumber('id', true);
		const confirm = interaction.options.getBoolean('confirm', true);
		const locale = getLocale(interaction.locale);

		if (!confirm) {
			return interaction.reply({
				content: t('messages.delete_audio.confirm_required', locale),
				flags: [MessageFlags.Ephemeral]
			});
		}

		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});

		try {
			// First, check if the audio exists and get its details for logging
			const existingAudio = await db
				.select()
				.from(audios)
				.where(eq(audios.id, BigInt(id)))
				.limit(1);

			if (existingAudio.length === 0) {
				return interaction.editReply({
					content: t('messages.delete_audio.not_found', locale)
				});
			}

			// Delete the audio
			const deletedAudio = await db
				.delete(audios)
				.where(eq(audios.id, BigInt(id)))
				.returning();

			if (deletedAudio.length === 0) {
				throw new Error("Failed to delete audio");
			}

		} catch (error: unknown) {
			console.error(error);
			return interaction.editReply({
				content: t('messages.delete_audio.something_wrong', locale)
			});
		}

		// Log the delete operation
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
				confirm
			}
		};

		jsonData.push(newEntry);
		writeFileSync(filePath, JSON.stringify(jsonData, null, 2));

		return interaction.editReply({
			content: t('messages.delete_audio.success', locale, { id: id })
		});
	}
}