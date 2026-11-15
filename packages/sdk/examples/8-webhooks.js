// Requires: npm install express
const express = require("express");
const { constructWebhookEvent, parseLegacyVoteWebhook } = require("@discordforgejs/sdk");

const app = express();
const handled = new Set(); // use a database in production

// Webhooks v2: signed with X-Forge-Signature. Needs the raw body.
app.post("/forge/events", express.raw({ type: "application/json" }), (req, res) => {
    let event;
    try {
        event = constructWebhookEvent(req.body, req.get("x-forge-signature"), process.env.FORGE_EVENTS_SECRET);
    } catch {
        return res.sendStatus(401);
    }

    // Failed deliveries are retried, so the same event can arrive twice.
    if (handled.has(event.id)) return res.sendStatus(204);
    handled.add(event.id);

    switch (event.type) {
        case "vote.created":
            if (!event.data.test) console.log(`Vote from ${event.data.voter_id} (streak ${event.data.streak})`);
            break;
        case "review.created":
            console.log(`New ${event.data.rating}-star review: ${event.data.snippet}`);
            break;
        case "follower.new":
            console.log(`New follower, now ${event.data.follower_count}`);
            break;
    }
    res.sendStatus(204);
});

// Legacy vote webhook: your secret arrives as-is in Authorization.
app.post("/forge/vote", express.json(), (req, res) => {
    let vote;
    try {
        vote = parseLegacyVoteWebhook(req.body, req.get("authorization"), process.env.FORGE_WEBHOOK_SECRET);
    } catch {
        return res.sendStatus(401);
    }
    if (!vote.isTest) console.log(`Vote from ${vote.id}, ${vote.totalVotes} total`);
    res.sendStatus(204);
});

app.listen(3000, () => console.log("Listening on :3000"));
