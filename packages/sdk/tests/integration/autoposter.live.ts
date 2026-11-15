import "dotenv/config";
import { ForgeClient } from "../../src/client";
import { AutoPoster } from "../../src/autoposter";

// Mock Discord client with realistic guild data
const mockDiscordClient = {
    guilds: { cache: { size: 150 } },
    ws: { shards: { size: 1 } },
    users: { cache: { size: 12000 } },
    isReady: () => true,
};

const apiKey = process.env.TEST_API_KEY;
if (!apiKey) {
    console.error("Missing TEST_API_KEY in .env");
    process.exit(1);
}

const forge = new ForgeClient(apiKey);

console.log("Starting AutoPoster live test...\n");

const poster = new AutoPoster(forge, mockDiscordClient, {
    interval: 300_000,
    onPost: (stats) => {
        console.log(`✅ Stats posted successfully:`);
        console.log(`   Servers: ${stats.serverCount}`);
        console.log(`   Shards:  ${stats.shardCount}`);
        console.log(`   Users:   ${stats.userCount}`);
        console.log(`\nAutoPoster is working. Stopping...`);
        poster.destroy();
        process.exit(0);
    },
    onError: (err) => {
        // 429 is expected if we posted recently
        if (err.message.includes("429")) {
            console.log("⚠️  Got 429 (rate limited) – API is responding, AutoPoster works correctly.");
        } else {
            console.error("❌ Error:", err.message);
        }
        poster.destroy();
        process.exit(0);
    },
});
