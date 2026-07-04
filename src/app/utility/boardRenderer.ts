import { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js'; 
import { createCanvas } from '@napi-rs/canvas'

interface Card {
    word: string;
    team: 'RED' | 'BLUE' | 'NEUTRAL' | 'ASSASSIN';
    isFlipped: boolean
}

export function generatePublicBoard(cards: Card[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    cards.forEach((card, index) => {
        const button = new ButtonBuilder()
                    .setLabel(card.word)
                    .setCustomId(`tile_${index}`)
        if (card.isFlipped) {
            button.setDisabled(true); 

        switch (card.team) {
                case 'RED': 
                    button.setStyle(ButtonStyle.Danger);
                    break; 
                case 'BLUE':
                    button.setStyle(ButtonStyle.Primary); 
                    break; 
                case 'NEUTRAL':
                    button.setStyle(ButtonStyle.Secondary); 
                    break;
                case 'ASSASSIN': 
                    button.setStyle(ButtonStyle.Success); 
                    break; 
            }
        }
        else {
            button.setStyle(ButtonStyle.Secondary);
        }

        currentRow.addComponents(button);

        if((index + 1) % 5 === 0) {
            rows.push(currentRow); 
            currentRow = new ActionRowBuilder<ButtonBuilder>();
        }
    });

    return rows;
} 

export async function generateSpymasterImage(cards: Card[]): Promise<AttachmentBuilder> {
    const cardWidth = 180; 
    const cardHeight = 100; 
    const padding = 15; 
    const columns = 5; 
    const rows = 5; 

    const canvasWidth = (cardWidth * columns) + (padding * (columns + 1));  
    const canvasHeight = (cardHeight * rows) + (padding * (rows + 1)); 

    const canvas = createCanvas(canvasWidth, canvasHeight); 
    const ctx = canvas.getContext('2d'); 

    ctx.fillStyle = '#202225';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight); 

    cards.forEach((card, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);

        const x = padding + col * (cardWidth + padding);
        const y = padding + row * (cardHeight + padding);

        let rectColor = '#b9bbbe';
        let textColor = '#ffffff';

        switch (card.team) {
        case 'RED':
            rectColor = '#ed4245';
            break;
        case 'BLUE':
            rectColor = '#5865f2';
            break;
        case 'NEUTRAL':
            rectColor = '#e3e5e8';
            textColor = '#4f545c';
            break;
        case 'ASSASSIN':
            rectColor = '#2f3136';
            textColor = '#faa61a';
            break;
        }

        ctx.fillStyle = rectColor;
        ctx.beginPath();
        ctx.roundRect?.(x, y, cardWidth, cardHeight, 8); 
        ctx.fill();

        if (card.isFlipped) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 4;
        ctx.stroke();
        }

        ctx.fillStyle = textColor;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let displayWord = card.word.toUpperCase();
        if (card.team === 'ASSASSIN') {
        displayWord = `💀 ${displayWord}`;
        }

        ctx.fillText(displayWord, x + cardWidth / 2, y + cardHeight / 2);
  });

  const buffer = await canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'spymaster-key.png' });
}

export function generateControlPanel() {
    const passButton = new ButtonBuilder()
        .setCustomId('pass_turn_button')
        .setLabel('Pass Remaining Guesses')
        .setStyle(ButtonStyle.Secondary);

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(passButton)];
}