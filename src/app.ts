import { Client } from 'discord.js';
import mongoose  from 'mongoose';
import "dotenv/config";

const client = new Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'],
});

(async () => {
  await mongoose.connect(process.env.MONGODB_URI!); 
  console.log("Connected to the database.")
})();

export default client; 
