const { ForgeClient } = require("discordforge-sdk");

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

async function checkUserVote(userId) {
  try {
    const vote = await client.checkVote(userId);

    if (vote.hasVoted) {
      console.log(`User voted at ${vote.votedAt}`);
    } else {
      console.log(`User has not voted. Next vote available: ${vote.nextVoteAt || "N/A"}`);
    }
  } catch (error) {
    console.error("Failed to check vote:", error.message);
  }
}

checkUserVote("USER_DISCORD_ID");
