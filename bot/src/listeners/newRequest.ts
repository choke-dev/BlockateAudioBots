import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ActionRowBuilder, AttachmentBuilder, BaseGuildTextChannel, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { whitelistRequests } from '../lib/db/schema';
import { createClient } from 'redis';

type WhitelistRequest = {
	status: 'PENDING' | 'APPROVED' | 'REJECTED';
	updatedAt: string;
	category: string;
	name: string;
	audioId: string;
	audioVisibility: 'PUBLIC' | 'PRIVATE';
	tags?: string[];
	createdAt: string;
	requestId: string;
	requester: Record<string, any>;
	userId: string;
	acknowledged: boolean;
	audioUrl: string;
};


@ApplyOptions<Listener.Options>({
	event: Events.ClientReady
})
export class UserEvent extends Listener {
	private whitelistRequestChannel!: BaseGuildTextChannel;
	private subscriber: ReturnType<typeof createClient> | null = null;

	public override async run() {
		const guild = this.container.client.guilds.cache.get('1175226662745546793');
		const channel = guild?.channels.cache.get('1373443972025815070') as BaseGuildTextChannel;
		if (!channel) return console.error('Whitelist channel not found');
		this.whitelistRequestChannel = channel;

		await this.subscribeToWhitelist();         // live listener

		this.scanForWhitelistRequests();
		setInterval(() => this.scanForWhitelistRequests(), 2 * 60 * 60 * 1000);
	}

	private async subscribeToWhitelist() {
		// Clean up existing connection
		if (this.subscriber) {
			await this.subscriber.quit();
			this.subscriber = null;
		}

		try {
			// Create Redis subscriber client for KeyDB
			this.subscriber = createClient({
				url: 'redis://keydb:6379'
			});

			// Connect to KeyDB
			await this.subscriber.connect();
			console.log('Connected to KeyDB');

			// Subscribe to the audioRequests channel
			await this.subscriber.subscribe('audioRequests', (message) => {
				try {
					const requestData = JSON.parse(message);
					if (!requestData.requestId) return;
					this.sendWhitelistRequestMessage(requestData as WhitelistRequest);
				} catch (error) {
					console.error('Error parsing request data:', error);
				}
			});

			console.log('Subscribed to audioRequests channel');

			// Handle connection errors and reconnection
			this.subscriber.on('error', (error) => {
				console.error('Redis subscriber error:', error);
			});

			this.subscriber.on('reconnecting', () => {
				console.log('Redis subscriber reconnecting...');
			});

		} catch (error) {
			console.error('Error connecting to KeyDB:', error);
		}
	}

	private async scanForWhitelistRequests() {
		try {
			const unacknowledgedRequests = await db
				.select()
				.from(whitelistRequests)
				.where(eq(whitelistRequests.acknowledged, false));

			for (const request of unacknowledgedRequests) {
				await this.sendWhitelistRequestMessage(request as WhitelistRequest);
			}
		} catch (error) {
			console.error('Error scanning for whitelist requests:', error);
		}
	}

	private async sendWhitelistRequestMessage(payload: WhitelistRequest) {
		if (!this.whitelistRequestChannel) {
			console.error('Whitelist request channel not found');
			return;
		}

		// Create the same buttons as in the requestwhitelist command
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

		const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			acceptButton,
			attemptWhitelist,
			editButton,
			raiseIssueButton,
			deleteButton
		);

		try {
			const audioFileUrl = payload.audioUrl;
			const audioFile = await fetch(audioFileUrl);
			const audioFileBuffer = await audioFile.arrayBuffer();
			const audioFileAttachment = new AttachmentBuilder(Buffer.from(audioFileBuffer), {
				name: `${payload.audioId}.ogg`
			});

			const messageContent = [
				'**New audio whitelist request**',
				//@ts-ignore
				`Requested by [${payload.requester.roblox.username}](<https://www.roblox.com/users/${payload.requester.roblox.id}/profile>) (${payload.requester.roblox.id})`,
				...(payload.audioVisibility === 'PRIVATE' ? [':lock: Marked as private — hidden from search results'] : []),
				'```',
				`ID: ${payload.audioId}`,
				`Name: ${payload.name}`,
				`Category: ${payload.category}`,
				...(payload.tags && payload.tags.length > 0 ? [`Tags: ${payload.tags.join(', ')}`] : []),
				'```'
			].join("\n");

			const messageOptions: any = {
				content: messageContent,
				allowedMentions: { parse: [] },
				components: [actionRow]
			};

			if (audioFileAttachment) {
				messageOptions.files = [audioFileAttachment];
			}

			await this.whitelistRequestChannel.send(messageOptions).then(async (_message) => {
				try {
					// Update using Drizzle ORM
					await db
						.update(whitelistRequests)
						.set({
							acknowledged: true,
							updatedAt: new Date().toISOString()
						})
						.where(eq(whitelistRequests.audioId, payload.audioId));
				} catch (error) {
					console.error('Error updating whitelist request acknowledgment:', error);
				}
			})

		} catch (error) {
			console.error('Failed to send whitelist request message:', error);
		}
	}
}