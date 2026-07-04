import { ApplicationCommandOptionType, ChannelType, TextChannel } from "discord.js"
import type { ChatInputCommand, CommandData } from 'commandkit';
import { Game } from "../schemas/game";

export const command: CommandData = {
    name: "give-clue", 
    description: "Give a clue to the operatives as a Spymaster",
    options: [
        {
            name: "string", 
            description: "The clue string",
            type: ApplicationCommandOptionType.String, 
            required: true
        }, 
        {
            name: "guesses", 
            description: "The number of guesses + 1 the operatives get", 
            type: ApplicationCommandOptionType.Number, 
            required: true, 

        }
    ]
}

function verifyClue(str: string): boolean {
    if(!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(str)) return false;

    const words = str.split(/\s+/).filter(word => word.length > 0); 

    if (words.length <= 2) return true; 
    else return false;
}


export const chatInput: ChatInputCommand = async (ctx) => {
    const userId = ctx.interaction.user.id; 
    const channelId = ctx.interaction.channelId;
    let clue = ctx.interaction.options.getString("string")!.toUpperCase(); 
    const guessInput = ctx.interaction.options.getNumber("guesses")!;

    if (!verifyClue(clue)) {
        return ctx.interaction.reply({
            content: "❌ Invalid clue! Your hint must be at most **two words** containing only letters.",
            ephemeral: true
        });
    }

    const game = await Game.findOne({ channelId, status: 'PLAYING' });

    if(!game) return ctx.interaction.reply({content: "There is no active game to perform this action.", ephemeral: true});


    const isRedTurn = game.currentTurn === 'RED_SPY' && userId === game.redSpymaster;
    const isBlueTurn = game.currentTurn === 'BLUE_SPY' && userId === game.blueSpymaster;

    if (!isRedTurn && !isBlueTurn) {
        return ctx.interaction.reply({ 
            content: "❌ It is not your turn to give a clue, or you are not a Spymaster!", 
            ephemeral: true 
        });
    }

    const allowedGuesses = guessInput + 1; 
    game.remainingGuesses = allowedGuesses;
    await game.save();
    
    game.currentTurn = game.currentTurn === 'RED_SPY' ? 'RED_OPS' : 'BLUE_OPS';
    
    await game.save();

    const guild = ctx.interaction.guild; 
    if (!guild) return; 

    const gameChannel = guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildText && channel.name.startsWith('🕵️‍♂️-codenames-')
    ) as TextChannel;

    if (!gameChannel) {
        return ctx.interaction.reply({
            content: "❌ Could not find the active text game channel starting with '🕵️‍♂️-codenames-'.",
            ephemeral: true
        });
    }

    const teamPrefix = userId === game.redSpymaster ? "🟥 **RED SPYMASTER**" : "🟦 **BLUE SPYMASTER**";
    const teamOps = userId === game.redSpymaster ? "🟥 Red Operatives" : "🟦 Blue Operatives";

    await gameChannel.send({
        content: `📢 ${teamPrefix} has given a clue!\n\n` +
                 `🔑 Clue: **${clue}**\n` +
                 `🔢 Max Guesses: **${allowedGuesses}** (Base ${guessInput} + 1 bonus)\n\n` +
                 `👉 It is now time for the ${teamOps} to select tiles on the interactive board above!`
    });

    return ctx.interaction.reply({ content: "✅ Clue successfully delivered!", ephemeral: true });
}