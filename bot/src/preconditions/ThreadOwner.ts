import { Precondition } from '@sapphire/framework';
import { ChannelType, type ChatInputCommandInteraction } from 'discord.js';

export class UserPrecondition extends Precondition {
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const channel = interaction.channel
		if (!channel) return this.error({ message: 'This command can only be used in a channel.' });
		if (channel.type !== ChannelType.PublicThread) return this.error({ message: 'This command can only be used in a public thread channel.' });

		const threadOwner = await channel.fetchOwner();
		if (threadOwner?.id !== interaction.user.id) {
			return this.error({
				message: `:x: You must be the owner of the thread to use this command.`
			});
		}

		return this.ok();
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		ThreadOwner: never;
	}
}
