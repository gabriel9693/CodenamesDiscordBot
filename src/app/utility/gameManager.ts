import { generateControlPanel, generatePublicBoard, generateSpymasterImage } from '../utility/boardRenderer.ts';
import { Game } from '../schemas/game.ts'; 
import { Client, TextChannel, User } from 'discord.js';

export async function startAndSendBoard(client: Client, channelId: string, triggerInteraction?: any) {
    const game = await Game.findOne({ channelId, status: 'LOBBY' });
    if (!game) return { success: false, error: "No active lobby found" }; 

    game.status = 'PLAYING'; 
    await game.save(); 

    const plainCards = game.cards.toObject() as any[]; 

    const publicComponents = generatePublicBoard(plainCards); 
    const spymasterKeyImage = await generateSpymasterImage(plainCards); 

    // 1. Spymaster DMs (Safe Blocks)
    try {
        const redUser = await client.users.fetch(game.redSpymaster!); 
        await redUser.send({
            content: "🟥 **CODENAMES: RED SPYMASTER KEY MAP** 🟥\nHere is your secret operative key grid. Do not share this!",
            files: [spymasterKeyImage]
        });
    } catch (err) {
        console.error(`Failed to DM Red Spymaster:`, err);
    }

    try {
        const blueUser = await client.users.fetch(game.blueSpymaster!);
        await blueUser.send({
            content: "🟦 **CODENAMES: BLUE SPYMASTER KEY MAP** 🟦\nHere is your secret operative key grid. Do not share this!",
            files: [spymasterKeyImage]
        });
    } catch (err) {
        console.error(`Failed to DM Blue Spymaster:`, err);
    }

    // 2. Public Channel Rendering (Wrapped in try/catch to catch crashes)
    try {
        const outputContent = "🕵️‍♂️ **The Game Has Begun!** 🕵️‍♂️\n\n" +
                              "• The Spymasters have been DM'd their Master Keys.\n" +
                              "• 🟥 **Red Team** goes first!\n\n" +
                              "**Current Turn:** 🟥 Red Spymaster giving a hint...";

        let mainMessage; 
        if (triggerInteraction) {
            await triggerInteraction.editReply({ content: outputContent, components: publicComponents }); 
            mainMessage = await triggerInteraction.fetchReply();
        } else {
            const channel = await client.channels.fetch(channelId) as TextChannel; 
            mainMessage = await channel.send({ content: outputContent, components: publicComponents });
        }

        const gameChannel = await client.channels.fetch(channelId) as TextChannel;
        
        // 🚨 CRITICAL: Ensure 'generateControlPanel' is imported at the top of this file!
        const controlComponents = generateControlPanel(); 

        const controlMessage = await gameChannel.send({
            content: "🛠️ **Operative Control Panel:** If your team wishes to stop guessing early, click below.",
            components: controlComponents
        });

        // Commit tracking references to database
        game.boardMessageId = mainMessage.id;
        game.controlMessageId = controlMessage.id;
        game.currentTurn = 'RED_SPY'; 
        await game.save();

        return { success: true, message: mainMessage };

    } catch (channelError) {
        console.error("❌ CRITICAL ERROR inside startAndSendBoard channel delivery phase:", channelError);
        return { success: false, error: "Failed to post game board rows to the text channel." };
    }
}

interface DMCheckResult {
  allowed: boolean;
  failedUser?: User;
  failedRoleName?: string;
}

export async function verifySpymasterDMs(
    redSpymaster: User | null | undefined, 
    blueSpymaster: User | null | undefined
): Promise<DMCheckResult> {
    const spymasters = [
    { roleName: 'Red Spymaster', user: redSpymaster },
    { roleName: 'Blue Spymaster', user: blueSpymaster }
  ];

  for (const spy of spymasters) {
    if (!spy.user) continue;
    
    try {
      const dmChannel = await spy.user.createDM();
      await dmChannel.send({
        content: `🕵️‍♂️ **Codenames Verification:** Checking your DM permissions for the upcoming match... Secure connection established!`
      });
    } catch (error: any) {
      if (error.code === 50007) {
        return {
          allowed: false,
          failedUser: spy.user,
          failedRoleName: spy.roleName
        };
      }
      
      console.error(`Unexpected error verifying DMs for ${spy.roleName}:`, error);
      return {
        allowed: false,
        failedUser: spy.user,
        failedRoleName: spy.roleName
      };
    }
  }

  return { allowed: true };
}