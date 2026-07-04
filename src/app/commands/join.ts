import type { ChatInputCommand, CommandData } from 'commandkit';
import { ApplicationCommandOptionType } from 'discord.js';
import { Game } from '../schemas/game.ts';

export const command: CommandData = {
    name: "join", 
    description: "Join the game as an operative", 
    options: [
        {
            name: "team", 
            description: "Either red or blue",
            type: ApplicationCommandOptionType.String,
            required: true, 
            choices: [
                {
                    name: "red", 
                    value: "red",
                }, 
                {
                    name: "blue", 
                    value: "blue"
                }
            ]
        }
    ]
}

export const chatInput: ChatInputCommand = async (ctx) => {
    const userId = ctx.interaction.user.id; 
    const teamChoice = ctx.interaction.options.getString("team"); 
    const channelId = ctx.interaction.channelId;

    const game = await Game.findOne({channelId, status: 'LOBBY'}); 

    if (!game) {
        return ctx.interaction.reply({
            content: "There is no active game in this channel. Start one with `/cd-start`.", 
            ephemeral: true
        });
    }

    if (userId === game.redSpymaster || userId === game.blueSpymaster) {
        return ctx.interaction.reply({
            content: "You are already a Spymaster, you may not join as an Operative", 
            ephemeral: true
        });
    }

    if (teamChoice === "red") {
        await Game.updateOne(
            {_id: game._id}, 
            {
                $addToSet: { redOperatives: userId }, 
                $pull: { blueOperatives: userId }
            }
        );
    }
    if (teamChoice === "blue") {
        await Game.updateOne(
            { _id: game._id },
            {
                $addToSet: { blueOperatives: userId },
                $pull: { redOperatives: userId }
            }
        );
    }

    await ctx.interaction.reply(`<@${userId}> has joined the **${teamChoice === 'red' ? '🟥 Red' : '🟦 Blue'} Operatives.**`);
}