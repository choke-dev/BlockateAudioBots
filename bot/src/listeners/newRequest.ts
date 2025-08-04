import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ActionRowBuilder, AttachmentBuilder, BaseGuildTextChannel, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { whitelistRequests } from '../lib/db/schema';
// Using require for WebSocket to avoid TypeScript module import issues
import WebSocket from 'ws';

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
	private channel: WebSocket | null = null;

	public override run() {
		const guild = this.container.client.guilds.cache.get('1175226662745546793');
		const channel = guild?.channels.cache.get('1373443972025815070') as BaseGuildTextChannel;
		if (!channel) return console.error('Whitelist channel not found');
		this.whitelistRequestChannel = channel;

		this.subscribeToWhitelist();         // live listener

		this.scanForWhitelistRequests();
		setInterval(() => this.scanForWhitelistRequests(), 2 * 60 * 60 * 1000);
	}

	private subscribeToWhitelist() {
		if (this.channel) {
			this.channel.close();
			this.channel = null;
		}

		if (!process.env.NTFY_USER || !process.env.NTFY_PASSWORD) {
			console.error('Missing NTFY credentials. NTFY_USERNAME or NTFY_PASSWORD is not set');
			return;
		}

		
		const authParam = btoa(`Basic ${btoa(`${process.env.NTFY_USER}:${process.env.NTFY_PASSWORD}`)}`).replaceAll("=", '');
		this.channel = new WebSocket(`ws://ntfy:80/audioRequests/ws`, {
			headers: {
				Authorization: `Basic ${authParam}`
			}
		});

		// Add null check before accessing WebSocket properties
		if (this.channel) {
			this.channel.onmessage = (event) => {
				if (typeof event.data === 'string') {
					try {
						const data = JSON.parse(event.data);
						if (data.message) {
							try {
								const requestData = JSON.parse(data.message);
								if (!requestData.requestId) return;
								this.sendWhitelistRequestMessage(requestData as WhitelistRequest);
							} catch (error) {
								console.error('Error parsing request data:', error);
							}
						} else {
							console.error('Received message without request data');
						}
					} catch (error) {
						console.error('Error parsing message data:', error);
					}
				} else {
					console.error('Received non-string data from WebSocket');
				}
			};

			this.channel.onopen = () => {
				console.log('Connected to NTFY');
			};

			this.channel.onerror = (error) => {
				console.error('Error connecting to NTFY:', error);
			};
		} else {
			console.error('Failed to create WebSocket connection');
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