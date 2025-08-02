import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

@ApplyOptions<Command.Options>({
  description: 'Downloads video/audio from a URL and returns an .ogg file',
  cooldownDelay: 1_000,
  cooldownLimit: 5
})
export class UserCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(builder =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption(opt =>
          opt
            .setName('url')
            .setDescription('The URL of the audio')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('custom_name')
            .setDescription('A custom name for the audio file')
            .setRequired(false)
        )
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const url = interaction.options.getString('url', true);
    const custom_name = interaction.options.getString('custom_name');

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return interaction.reply({
        content: '❌ That’s not a valid URL.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const tempBase = join(tmpdir(), `audio-${randomUUID()}`);
    const tempPath = `${tempBase}.ogg`;

    const dumpPromise = execFileAsync('yt-dlp', ['-j', '--no-playlist', parsedUrl.toString()])
      .then(({ stdout }) => JSON.parse(stdout));

    const downloadPromise = new Promise<void>((resolve, reject) => {
      const proc = spawn('yt-dlp', [
        '-x', 
		    '--no-mtime', 
		    '--audio-format', 'vorbis', 
		    '--no-playlist',
        '-o', tempBase,
        parsedUrl.toString()
      ]);

      let err = '';
      proc.stderr.on('data', c => err += c.toString());
      proc.on('close', code => {
        if (code !== 0 || !existsSync(tempPath)) reject(new Error(err || `Exit ${code}`));
        else resolve();
      });
    });

    let metadata: any;
    try {
      [metadata] = await Promise.all([dumpPromise, downloadPromise]);
    } catch (e: any) {
    //   const msg = e.stderr || e.message || JSON.stringify(e);
      return interaction.editReply(`❌ Download failed! Please try again.`);
    }

    const title = metadata.title ?? 'Unknown';

    const file = new AttachmentBuilder(createReadStream(tempPath), { name: custom_name ? `${custom_name}.ogg` : `${title || 'audio'}.ogg` });

    await interaction.editReply({
		content: [
			'# ✅ Download complete!',
			`**Title:** ${title}`,
			`**Source:** ${metadata.extractor_key}`
		].join('\n'),
		files: [file]
    });
	unlink(tempPath).catch(() => {});
	return;
  }
}
