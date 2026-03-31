/**
 * Example: AutoPoster with discord.js
 *
 * Automatically posts server count, shard count, and user count
 * to DiscordForge every 5 minutes. No manual interval setup needed.
 *
 * @see https://discordforge.org/support/developers
 */

const { Client, GatewayIntentBits } = require("discord.js");
const { ForgeClient, AutoPoster } = require("discordforge-sdk");

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const forge = new ForgeClient(process.env.DISCORDFORGE_API_KEY);

const poster = new AutoPoster(forge, bot);

poster.on("post", (stats) => {
  console.log(`[AutoPoster] Posted: ${stats.serverCount} servers`);
});

poster.on("error", (err) => {
  console.error("[AutoPoster] Failed:", err.message);
});

bot.once("ready", () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.login(process.env.DISCORD_TOKEN);
