const { ForgeClient } = require("@discordforgejs/sdk");

const forge = new ForgeClient("YOUR_API_KEY");

// Live votes and reviews without hosting a webhook endpoint.
// The stream reconnects on its own and replays anything missed in between.
const stream = forge.events({ types: ["vote.created", "review.created"] });

stream.on("connect", () => console.log("Listening for events…"));
stream.on("vote.created", (event) => {
    console.log(`Vote from ${event.data.voter_id} (streak ${event.data.streak})`);
});
stream.on("review.created", (event) => {
    console.log(`${event.data.rating}-star review: ${event.data.snippet}`);
});
stream.on("error", (err) => console.error("Stream error:", err.message));

process.on("SIGINT", () => {
    stream.close();
    process.exit(0);
});
