const { ForgeClient } = require("@discordforgejs/sdk");

const forge = new ForgeClient("YOUR_API_KEY");

async function main() {
    // Uptime tracking: send a heartbeat every 5 minutes.
    await forge.heartbeat();
    setInterval(() => forge.heartbeat().catch(console.error), 5 * 60_000);

    // Report a problem on your bot page...
    await forge.setStatus({ status: "degraded", message: "Music playback is slow on EU shards" });

    // ...and hide the banner once it's fixed.
    await forge.clearStatus();

    const uptime = await forge.getUptime({ days: 7 });
    console.log(`Uptime over 7 days: ${uptime.uptime_percentage}%`);
}

main().catch(console.error);
