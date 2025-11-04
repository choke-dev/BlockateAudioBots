import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { db } from '../../lib/db';
import { audios, whitelistRequests } from '../../lib/db/schema';
import { eq, DrizzleError } from 'drizzle-orm';
import { PostgresError } from 'postgres';
import { t, getLocale } from '../../lib/localization';

const userMentionRegex = /<@!?(\d+)>/;
const robloxUserRegex = /https?:\/\/www\.roblox\.com\/users\/(\d+)\/profile/;

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button
})
export class ButtonHandler extends InteractionHandler {
  public async run(interaction: ButtonInteraction) {
    const locale = getLocale(interaction.locale);
    const whitelister = interaction.user;
    const requestId = interaction.customId.split("-")[2];

    // Try to get the requester's locale from hidden data, fallback to staff member's locale
    const requesterLocale = locale;

    const discordRequesterId = interaction.message.content.match(userMentionRegex)?.[1] || null;
    const robloxRequesterId = interaction.message.content.match(robloxUserRegex)?.[1] || null;

    if (!discordRequesterId && !robloxRequesterId) {
      return interaction.reply({ content: t('messages.mark_done.requester_not_found', locale), flags: [MessageFlags.Ephemeral] });
    }

    const discordRequester = discordRequesterId ? await interaction.guild?.members.fetch(discordRequesterId) : null;
    const discordRequesterName = discordRequester ? `${discordRequester.user.username}` : null;

    // Parse ID, Name, Category, Tags, Privacy
    const idMatch = interaction.message.content.match(/ID:\s*(.+)/);
    const nameMatch = interaction.message.content.match(/Name:\s*(.+)/);
    const categoryMatch = interaction.message.content.match(/Category:\s*(.+)/);
    const tagsMatch = interaction.message.content.match(/Tags:\s*(.+)/);
    const isPrivate = interaction.message.content.includes(':lock:');

    const id = idMatch?.[1];
    const name = nameMatch?.[1];
    const category = categoryMatch?.[1];
    const tags = tagsMatch?.[1];

    if (!id || !name || !category) {
      return interaction.reply({ content: t('messages.mark_done.parse_failed', locale), flags: [MessageFlags.Ephemeral] });
    }

    // Build whitelister JSON
    const whitelisterPayload = {
      discord: { id: null as string | null, name: null as string | null },
      roblox: { id: null as string | null, name: null as string | null }
    };
    whitelisterPayload.discord = { id: whitelister.id, name: whitelister.username };

    // Build requester JSON
    const requesterPayload = {
      discord: { id: null as string | null, name: null as string | null },
      roblox: { id: null as string | null, name: null as string | null }
    };
    if (discordRequesterId) {
      requesterPayload.discord = { id: discordRequesterId, name: discordRequesterName };
    } else if (robloxRequesterId) {
      requesterPayload.roblox = { id: robloxRequesterId, name: null };
    }

    // Defer the button update
    await interaction.deferUpdate();

    // Move or mark message
    try {
      const targetChannel = await interaction.client.channels.fetch('1380906344139460688');
      const original = interaction.message.content;
      // Public message - must be in English
      const doneText = `✅ This request has been marked as done by <@${whitelister.id}>.\n\n${original}`;

      if (targetChannel && targetChannel.isTextBased() && 'send' in targetChannel) {
        await targetChannel.send({ content: doneText, allowedMentions: { parse: [] } });
        await interaction.message.delete();
      } else {
        await interaction.message.edit({ content: doneText, allowedMentions: { parse: [] } });
        interaction.followUp({
          content: t('messages.mark_done.move_failed', locale),
          flags: [MessageFlags.Ephemeral]
        });
      }
    } catch (err) {
      console.error('Error moving message:', err);
      // Public message - must be in English
      await interaction.message.edit({ content: `✅ Marked done by <@${whitelister.id}>.\n\n${interaction.message.content}`, allowedMentions: { parse: [] } });
      interaction.followUp({ content: t('messages.mark_done.move_failed', locale), flags: [MessageFlags.Ephemeral] });
    }

    // Create audio record using Drizzle ORM
    try {
      // Convert tags string to array
      const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];

      await db
        .insert(audios)
        .values({
          id: BigInt(id),
          name,
          category,
          tags: tagsArray,
          whitelister: whitelisterPayload,
          requester: requesterPayload,
          audioVisibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
          audioLifecycle: 'ACTIVE'
        });
    } catch (error) {
      let isUniqueViolation = false;

      if (error instanceof DrizzleError && error.cause && typeof error.cause === 'object') {
        const cause = error.cause as PostgresError;
        if (cause.code === '23505') {
          isUniqueViolation = true;
        }
      }

      if (isUniqueViolation) {
        return interaction.followUp({ content: t('messages.mark_done.audio_exists', locale), flags: [MessageFlags.Ephemeral] });
      }

      console.error(error);
      return interaction.followUp({ content: t('messages.mark_done.error_adding', locale), flags: [MessageFlags.Ephemeral] });
    }

    // Approve whitelist request if Roblox
    if (robloxRequesterId) {
      try {
        await db
          .update(whitelistRequests)
          .set({
            status: 'APPROVED',
            updatedAt: new Date().toISOString()
          })
          .where(eq(whitelistRequests.requestId, requestId));
      } catch (error) {
        console.error('Error updating whitelist request:', error);
      }
    }

    // DM Discord requester
    if (discordRequesterId) {
      try {
        const user = await interaction.client.users.fetch(discordRequesterId);
        // DM - can be localized using requester's locale
        const privateText = isPrivate ? t('messages.mark_done.completion_dm_private', requesterLocale) : '';
        const tagsText = tags ? t('messages.mark_done.completion_dm_tags', requesterLocale, { tags: tags }) : '';
        return user.send(
          t('messages.mark_done.completion_dm', requesterLocale, {
            private: privateText,
            id: id,
            category: category,
            name: name,
            tags: tagsText,
            userId: whitelister.id
          })
        );
      } catch (err) {
        console.error('DM error:', err);
        return interaction.followUp({ content: t('messages.mark_done.dm_failed', locale), flags: [MessageFlags.Ephemeral] });
      }
    }
    return;
  }

  public override parse(interaction: ButtonInteraction) {
    return interaction.customId.startsWith('whitelistrequest-markdone') ? this.some() : this.none();
  }
}