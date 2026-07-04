import type { ChatInputCommand, CommandData } from 'commandkit';
import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { Game } from '../schemas/game.ts';

export const command: CommandData = {
  name: 'cd-cancel',
  description: 'Cancel the current Codenames game in this channel',
};

export const chatInput: ChatInputCommand = async (ctx) => {
  const userId = ctx.interaction.user.id;
  const channelId = ctx.interaction.channelId;

  const game = await Game.findOne({ channelId, status: { $ne: 'ENDED' } });

  if (!game) {
    return ctx.interaction.reply({
      content: "❌ There is no active Codenames game to cancel in this channel.",
      ephemeral: true
    });
  }

  const isSpymaster = userId === game.redSpymaster || userId === game.blueSpymaster;
  const isAdmin = ctx.interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

  if (!isSpymaster && !isAdmin) {
    return ctx.interaction.reply({
      content: "❌ Only the Red/Blue Spymasters or a server Admin can cancel this game.",
      ephemeral: true
    });
  }

  await Game.updateOne(
    { _id: game._id },
    { $set: { status: 'ENDED' } }
  );

  await ctx.interaction.reply({
    content: `🛑 **Game Cancelled.** The active Codenames match in this channel has been closed by <@${userId}>.`
  });

  const channel = ctx.interaction.channel;

  if (channel && channel.type === ChannelType.GuildText && channel.name.startsWith('🕵️‍♂️-codenames-')) {
    setTimeout(async () => {
      try {
        await channel.delete('Codenames game cancelled.');
      } catch (err) {
        console.error("Failed to delete channel upon cancellation:", err);
      }
    }, 10000); 
  }
};