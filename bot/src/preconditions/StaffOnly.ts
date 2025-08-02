import { Precondition } from '@sapphire/framework';
import type { ChatInputCommandInteraction, ContextMenuCommandInteraction } from 'discord.js';

const STAFF_ROLES = [
	'1330303680007770164',
	'1254252846459781172',
	'1175235899244691517'
]

export class UserPrecondition extends Precondition {
	public override chatInputRun(interaction: ChatInputCommandInteraction) {

		if (!interaction.guild) {
			return this.error({ message: 'This command can only be used in a guild.' });
		}

		const member = interaction.guild.members.cache.get(interaction.user.id);
		if (!member || !member.roles.cache.some(role => STAFF_ROLES.includes(role.id))) {
			return this.error({ message: ':x: This command can only be used by staff members.' });
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction): Precondition.Result {

		if (!interaction.guild) {
			return this.error({ message: 'This command can only be used in a guild.' });
		}

		const member = interaction.guild.members.cache.get(interaction.user.id);
		if (!member || !member.roles.cache.some(role => STAFF_ROLES.includes(role.id))) {
			return this.error({ message: ':x: This command can only be used by staff members.' });
		}

		return this.ok();
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		StaffOnly: never;
	}
}
