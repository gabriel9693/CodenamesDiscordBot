import { Schema, model }  from 'mongoose';

const gameSchema = new Schema({
    channelId: { type: String, required: true, unique: true }, 
    status: { type: String, enum: ['LOBBY', 'PLAYING', 'ENDED'], default: 'LOBBY' },
    currentTurn: { type: String, enum: ['RED_SPY', 'RED_OPS', 'BLUE_SPY', 'BLUE_OPS'] },
    redSpymaster: String, // Discord User ID
    blueSpymaster: String, // Discord User ID 
    redOperatives: Array, 
    blueOperatives: Array,
    cards: [{
        word: String,
        team: { type: String, enum: ['RED', 'BLUE', 'NEUTRAL', 'ASSASSIN'] },
        isFlipped: { type: Boolean, default: false }
    }],
    createdAt: { type: Date, default: Date.now, expires: '24h' },
    remainingGuesses: { type: Number, default: 0 },
    boardMessageId: { type: String },
    controlMessageId: { type: String },
});

export const Game = model("Game", gameSchema);