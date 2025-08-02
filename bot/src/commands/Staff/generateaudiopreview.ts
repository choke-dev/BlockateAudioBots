import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { ofetch } from 'ofetch';

@ApplyOptions<Command.Options>({
	description: 'Generates an audio preview of a provided audio ID',
	preconditions: ["StaffOnly"]
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder //
				.setName(this.name)
				.setDescription(this.description)
				.addIntegerOption(option => 
					option
						.setName('audio_id')
						.setDescription('The ID of the audio to generate a preview for')
						.setRequired(true)
				)

		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const audioId = interaction.options.getInteger("audio_id", true);

		await interaction.deferReply({
			flags: [MessageFlags.Ephemeral]
		});
		
		const audioURL = await ofetch<string[] | { code: number, message: string }[]>('http://109.106.244.58:3789/audio/', {
			method: "POST",
			body: [audioId],
			headers: {
				"Authorization": process.env.AUDIO_FILE_PROXY_AUTH!
			}
		})
		

		if (typeof audioURL[0] !== "string") {
			return interaction.editReply(audioURL[0].message);
		}

		const audioBuffer = await ofetch(audioURL[0], { responseType: 'arrayBuffer' });
		const attachment = new AttachmentBuilder(Buffer.from(audioBuffer), { name: `${audioId}.ogg` });

		return interaction.editReply({
			content: `:white_check_mark: Generated audio preview for: ${audioId}`,
			files: [attachment],
		});

	}
}
