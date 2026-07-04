import type { ChatInputCommand, CommandData } from 'commandkit';
import { Game } from '../schemas/game.ts';

export const command: CommandData = {
    name: "leave", 
    description: "Leave the game", 
}

export const chatInput: ChatInputCommand = async (ctx) => {
    const userId = ctx.interaction.user.id;
    const channelId = ctx.interaction.channelId;

    const game = await Game.findOne({channelId, status: 'LOBBY'}); 

    if (!game) {
        return ctx.interaction.reply({
            content: "There is no active game to leave in this channel.", 
            ephemeral: true
        });
    }

    if (userId === game.redSpymaster || userId === game.blueSpymaster) {
        return ctx.interaction.reply({
            content: "❌ You are a Spymaster. You cannot leave the game room. If you want to cancel the match, wait for the cancel command.",
            ephemeral: true
        });
    }

    const isOnBlue = game.blueOperatives.includes(userId); 
    const isOnRed = game.redOperatives.includes(userId);

    if (!isOnBlue && !isOnRed) {
        return ctx.interaction.reply({
            content: "❌ You haven't joined either the Red or Blue team yet.",
            ephemeral: true
        });
    }

    await Game.updateOne(
        { _id: game._id },
        { 
            $pull: { 
                redOperatives: userId, 
                blueOperatives: userId 
            } 
        }
    );

    const oldTeam = isOnRed ? '🟥 Red' : '🟦 Blue';
    return ctx.interaction.reply({
        content: `<@${userId}> has left the **${oldTeam} Operatives**.`
    });
}