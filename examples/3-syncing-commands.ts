import { ForgeClient, SyncCommand } from "discordforge-sdk";

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

async function syncBotCommands() {
  const commands: SyncCommand[] = [
    { name: "ping", description: "Check bot latency" },
    { name: "play", description: "Play a song from URL", category: "Music", usage: "/play <url>" },
  ];

  try {
    const result = await client.syncCommands(commands);
    console.log(`Synced ${result.synced} commands.`);
  } catch (error: any) {
    console.error("Failed to sync commands:", error.message);
  }
}

syncBotCommands();
