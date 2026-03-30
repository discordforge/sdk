const { ForgeClient } = require("discordforge-sdk");

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

async function updateStats() {
  try {
    await client.postStats({
      serverCount: 1543,
      shardCount: 2,
      userCount: 75000,
      voiceConnections: 12,
    });

    console.log("Stats posted successfully.");
  } catch (error) {
    console.error("Failed to post stats:", error.message);
  }
}

updateStats();
