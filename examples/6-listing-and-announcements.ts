import { ForgeClient } from "discordforge-sdk";
import type { BotAnnouncementCreateRequest, BotListingUpdateRequest } from "discordforge-sdk";

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");

async function updateListingAndPublishAnnouncement() {
  const listing: BotListingUpdateRequest = {
    prefix: "!",
    shortDescription: "Moderation and utility bot",
    description: "Longer Markdown-capable listing description.",
    tags: "moderation, utility",
    supportServer: "https://discord.gg/dfo",
    website: "https://discordforge.org",
    socials: '[{"type":"github","url":"https://github.com/discordforge/"}]',
    languages: "en",
    hasPaidFeatures: false,
    paidFeaturesAvailable: false,
    webInterface: true,
    installableAsUserApp: false,
  };

  const announcement: BotAnnouncementCreateRequest = {
    title: "Version 2.0 is live",
    content: "New moderation tools and dashboard improvements are now available.",
    type: "UPDATE",
  };

  try {
    await client.updateListing(listing);
    await client.publishAnnouncement(announcement);
    console.log("Listing updated and announcement published.");
  } catch (error: any) {
    console.error("Failed to update listing or publish announcement:", error.message);
  }
}

updateListingAndPublishAnnouncement();
