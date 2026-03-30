const { Client, GatewayIntentBits } = require("discord.js");
const { ForgeClient } = require("discordforge-sdk");

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const forge = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

bot.once("ready", async () => {
    await forge.postStats({ serverCount: bot.guilds.cache.size });

    setInterval(async () => {
        try {
            await forge.postStats({
                serverCount: bot.guilds.cache.size,
                shardCount: bot.shard?.count ?? 1
            });
        } catch (err) {
            console.error("[DiscordForge] Failed to post stats:", err.message);
        }
    }, 30 * 60 * 1000);

    console.log(`${bot.user.tag} is online — stats synced to DiscordForge`);
});

bot.login("YOUR_BOT_TOKEN");
