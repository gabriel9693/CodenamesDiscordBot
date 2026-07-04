import type { ChatInputCommand, CommandData } from 'commandkit';
import { ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ButtonStyle, ButtonInteraction } from 'discord.js';
import fs from 'fs'; 
import path from 'path';
import { Game } from '../schemas/game.ts';
import { TextChannel } from 'discord.js';
import { startAndSendBoard, verifySpymasterDMs } from '../utility/gameManager.ts';
import { generatePublicBoard } from '../utility/boardRenderer.ts';

export const command: CommandData = {
  name: 'cd-start',
  description: "Start a game of Codenames", 
  options: [
    {
      name: "red-spymaster", 
      description: "The red spymaster, input a Discord user ID", 
      type: ApplicationCommandOptionType.User, 
      required: true,
    },
    {
      name: "blue-spymaster", 
      description: "The blue spymaster, input a Discord user ID", 
      type: ApplicationCommandOptionType.User, 
      required: true,
    },
  ]
};

function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
}

function loadWordPool() {
    try {
      const filePath = path.join(__dirname, '..', '..', '..', "Codenames.txt");
      const rawData = fs.readFileSync(filePath, 'utf-8'); 

      const words = rawData
        .split(/\r?\n/)
        .map(word => word.trim())
        .filter(word => word.length > 0); 

      return words;
    } catch (error) {
      console.error("Error reading Codenames.txt:", error); 
      return [];
    }
}

export const chatInput: ChatInputCommand = async (ctx) => {
  if(ctx.interaction.user.bot) return;

  const redSpymaster = ctx.interaction.options.getUser("red-spymaster");
  const blueSpymaster = ctx.interaction.options.getUser("blue-spymaster"); 
  const host = ctx.interaction.user;
  const channelId = ctx.interaction.channel?.id;

  const wordPool = loadWordPool();
  const shuffled = shuffle(wordPool);
  const words = shuffled.slice(0, 25);

  const existingGame = await Game.findOne({ channelId, status: { $ne: 'ENDED' } });
  if (existingGame) {
      return ctx.interaction.reply({ 
          content: "❌ A game is already active in this channel! Finish it or delete it first.", 
          ephemeral: true 
      });
  }

  await ctx.interaction.deferReply();

  const cardRoles = [
    ...Array(9).fill('RED'), 
    ...Array(8).fill('BLUE'),
    ...Array(7).fill('NEUTRAL'), 
    'ASSASSIN'
  ];
  const shuffledRoles = shuffle(cardRoles);

  const initialCards = words.map((word, index) => ({
        word: word,
        team: shuffledRoles[index],
        isFlipped: false
  }));


  const gameChannel = await ctx.guild?.channels.create({
    name: `🕵️‍♂️-codenames-${host.username.toLowerCase()}`,
    type: ChannelType.GuildText, 
    permissionOverwrites: [
      {
        id: ctx.guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.SendMessages
        ],
        allow: [
          PermissionFlagsBits.ViewChannel, 
          PermissionFlagsBits.ReadMessageHistory
        ],
      }, 
      {
        id: ctx.guild.members.me!.id, 
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks, 
        ]
      }
    ]
  }); 

  const Codenames = new Game({
    channelId: gameChannel?.id, 
    status: 'LOBBY', 
    currentTurn: 'RED_SPY', 
    redSpymaster: redSpymaster?.id,  
    blueSpymaster: blueSpymaster?.id, 
    redOperatives: [],
    blueOperatives: [], 
    cards: initialCards,
  })

  await Codenames.save();


  await ctx.interaction.followUp(`✅ Game room created! Head over to ${gameChannel} to setup teams.`); 
  const startEmbed = new EmbedBuilder()
                  .setTitle("Codenames")
                  .setDescription(`A new **Codenames game** was created by <@${host.id}>.\n- Red Spymaster: <@${redSpymaster?.id}>\n- Blue Spymaster: <@${blueSpymaster?.id}>\n\n- To join the game as an operative, run **/join** in this channel.\n- The gameboard will be posted in <#${gameChannel?.id}>, to guess, you must **click a tile** when it is your turn as an operative.\n- The Spymasters shall check their DMs for the completed board.`)
                  .setAuthor({name: host.username, iconURL: host.displayAvatarURL({size: 1024})})
                  .setTimestamp()
                  .setColor('Blurple');

  const startButton = new ButtonBuilder()
                  .setLabel("Start")
                  .setCustomId("start_button")
                  .setStyle(ButtonStyle.Success) 
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);
  const lobbyMessage = await ctx.interaction.followUp({ embeds: [startEmbed], components: [row]});

  const collector = lobbyMessage.createMessageComponentCollector({
    filter: (i) => i.customId === 'start_button' && i.isButton(), 
    time: 600_000
  });

  collector.on('collect', async (buttonInteraction) => {
    const userId = buttonInteraction.user.id; 
    const isHost = userId === host.id;
    
    if (!isHost) {
      return buttonInteraction.reply({
        content: "❌ Only the game host can officially start the match!",
        ephemeral: true 
      });
    }

    await buttonInteraction.deferUpdate();

    const dmStatus = await verifySpymasterDMs(redSpymaster, blueSpymaster); 

    if(!dmStatus.allowed && dmStatus.failedUser) {
        return buttonInteraction.followUp({
          content: `❌ **Initialization Failed:** <@${dmStatus.failedUser.id}> (${dmStatus.failedRoleName}) has their Direct Messages turned off! They must enable DMs from server members in their settings before the game can start.`,
      });
    }

    const result = await startAndSendBoard(
      ctx.client, 
      gameChannel?.id!
    ); 

    if(result.success) {
      startButton.setDisabled(true).setLabel("Match Started"); 
      const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton); 

      await lobbyMessage.edit({ components: [updatedRow] }).catch(() => null);

      collector.stop()

      if(result.message) {
        const gameBoardCollector = result.message.createMessageComponentCollector({
          filter: (i: ButtonInteraction) => i.isButton(), 
          time: 86_400_000,
        });

        gameBoardCollector.on('collect', async (tileInteraction: ButtonInteraction) => {
            const userId = tileInteraction.user.id;
            const customId = tileInteraction.customId;

            const game = await Game.findOne({ channelId, status: 'PLAYING' });
            if (!game) return tileInteraction.reply({ content: "Game not found.", ephemeral: true });

            if (customId === 'pass_turn_button') {
              if (game.currentTurn === 'RED_SPY' || game.currentTurn === 'BLUE_SPY') {
                return tileInteraction.reply({content: "❌ You can't pass during the Spymaster's clue phase!", ephemeral: true}); 
              }
              if (game.currentTurn === 'RED_OPS' && !game.redOperatives.includes(userId)) {
                return tileInteraction.reply({content: "❌ Only active Red Operatives can pass!", ephemeral: true}); 
              }
              if (game.currentTurn === 'BLUE_OPS' && !game.blueOperatives.includes(userId)) {
                return tileInteraction.reply({content: "❌ Only active Blue Operatives can pass!", ephemeral: true});    
              }
              
              await tileInteraction.deferUpdate(); 

              game.currentTurn = game.currentTurn === 'RED_OPS' ? 'BLUE_SPY' : 'RED_SPY'; 
              await game.save();

              const turnDisplay = game.currentTurn === 'RED_SPY' ? '🟥 Red Spymaster giving a hint...' : '🟦 Blue Spymaster giving a hint...';

              if (game.boardMessageId) {
                const boardChannel = await tileInteraction.client.channels.fetch(game.channelId) as TextChannel;
                const boardMsg = await boardChannel.messages.fetch(game.boardMessageId).catch(() => null);
                
                if (boardMsg) {
                  await boardMsg.edit({
                    content: `**Current Turn:** ${turnDisplay}`,
                    components: generatePublicBoard(game.cards.toObject() as any[])
                  });
                }
              }

              return tileInteraction.editReply({
                content: `🛠️ **Operative Control Panel:** Turn passed successfully. Next up: ${turnDisplay}`
              });
            }

            if (userId === game.redSpymaster || userId === game.blueSpymaster) {
              return tileInteraction.reply({ 
                content: "❌ Spymasters are strictly prohibited from guessing tiles! Look at your secret key map in DMs.", 
                ephemeral: true 
              });
            }

            if (game.currentTurn === 'RED_OPS' && !game.redOperatives.includes(userId)) {
              return tileInteraction.reply({ content: "❌ It's the Red Team's turn to guess!", ephemeral: true });
            }

            if (game.currentTurn === 'BLUE_OPS' && !game.blueOperatives.includes(userId)) {
              return tileInteraction.reply({ content: "❌ It's the Blue Team's turn to guess!", ephemeral: true });
            }

            const arrayIndex = parseInt(customId.split('_')[1]!);
            const clickedCard = game.cards[arrayIndex];

            if (!clickedCard || clickedCard.isFlipped) {
              return tileInteraction.reply({ content: "❌ That card has already been revealed!", ephemeral: true });
            }

            await tileInteraction.deferUpdate();

            clickedCard.isFlipped = true; 
            let turnOver = false; 
            let gameOver = false; 
            let winner = null; 
            game.remainingGuesses -= 1; 

            switch (clickedCard.team) {
              case 'ASSASSIN': 
                gameOver = true; 
                winner = game.currentTurn === 'RED_OPS' ? 'BLUE' : 'RED'; 
                game.status = 'ENDED'; 
                break; 
              case 'NEUTRAL': 
                turnOver = true; 
                break;
              case 'RED': 
                if (game.currentTurn === 'BLUE_OPS') turnOver = true;
                break; 
              case 'BLUE': 
                if (game.currentTurn === 'RED_OPS') turnOver = true; 
                break; 
            }

            if (!gameOver) {
              const remainingRed = game.cards.filter(c => c.team === 'RED' && !c.isFlipped).length;
              const remainingBlue = game.cards.filter(c => c.team === 'BLUE' && !c.isFlipped).length;

              if (remainingRed === 0) { gameOver = true; winner = 'RED'; game.status = 'ENDED'; }
              else if (remainingBlue === 0) { gameOver = true; winner = 'BLUE'; game.status = 'ENDED'; }
              
              if (game.remainingGuesses <= 0 && !turnOver) {
                turnOver = true; 
                await tileInteraction.followUp({ content: "🔊 You've used all your allotted guesses for this turn!", ephemeral: false });
              }
            }

            const flatCards = game.cards.toObject() as any[];

            if (gameOver) {
              gameBoardCollector.stop();
              await game.save();

              const controlChannel = await tileInteraction.client.channels.fetch(game.channelId) as TextChannel; 

              if (controlChannel && game.controlMessageId) {
                const controlMsg = await controlChannel.messages.fetch(game.controlMessageId).catch(() => null); 
                if (controlMsg) {
                  await controlMsg.delete().catch(() => null);
                }
              }
              
              return tileInteraction.editReply({
                content: `🏆 **GAME OVER!** The ${winner === 'RED' ? '🟥 Red' : '🟦 Blue'} Team has won the match!`,
                components: generatePublicBoard(flatCards)
              });
            }

            if (turnOver) {
              game.currentTurn = game.currentTurn === 'RED_OPS' ? 'BLUE_SPY' : 'RED_SPY';
            }
            
            await game.save(); 

            const turnDisplay = game.currentTurn === 'RED_SPY' ? '🟥 Red Spymaster giving a hint...' :
                                game.currentTurn === 'BLUE_SPY' ? '🟦 Blue Spymaster giving a hint...' :
                                game.currentTurn === 'RED_OPS' ? '🟥 Red Operatives guessing...' : '🟦 Blue Operatives guessing...';

            await tileInteraction.editReply({
              content: `**Current Turn:** ${turnDisplay}`,
              components: generatePublicBoard(flatCards)
            });
        });
      }   
      else {
        await buttonInteraction.followUp({content: `Error: ${result.error}`, ephemeral: true})
      }
    }
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      startButton.setDisabled(true).setLabel("Lobby Timed Out");
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);
      lobbyMessage.edit({ components: [disabledRow] }).catch(() => null);
    }
  });
};