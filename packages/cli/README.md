# @discordforgejs/cli

Command-line tool for the [DiscordForge](https://discordforge.org) Developer API. Built on [`@discordforgejs/sdk`](https://www.npmjs.com/package/@discordforgejs/sdk).

## Install

```bash
npm install -g @discordforgejs/cli
```

Or run it without installing:

```bash
npx @discordforgejs/cli --help
```

Requires Node.js 18.3 or higher.

## Setup

Get your bot's API key from **Dashboard → My Bots → your bot → API Access**, then:

```bash
export DISCORDFORGE_API_KEY="your-api-key"
export DISCORDFORGE_BOT_ID="your-bot-id"   # only needed for `bot` and `vote check`
```

You can also pass `--key` and `--bot` on each command.

## Commands

| Command | What it does |
|---------|--------------|
| `discordforge bot` | Show your bot's public profile |
| `discordforge stats post --servers 1500 [--shards 2] [--users 80000] [--voice 12]` | Post stats |
| `discordforge heartbeat [--status online\|idle\|dnd]` | Send an uptime heartbeat |
| `discordforge vote check <userId>` | Did this user vote in the last 8 hours? |
| `discordforge votes [--limit 100] [--before <iso>] [--all]` | Vote history, newest first |
| `discordforge reviews [--limit 10] [--sort recent\|rating]` | Reviews and average rating |
| `discordforge uptime [--days 30]` | Uptime over 1–90 days |
| `discordforge analytics [--days 30]` | Views, invite clicks and votes over 1–90 days |
| `discordforge status get` | Show the status banner |
| `discordforge status set degraded --message "EU shards are slow" [--hidden]` | Set the banner |
| `discordforge status clear` | Hide the banner |
| `discordforge cooldown <userId> <serverId>` | Bump cooldown |
| `discordforge commands sync commands.json` | Replace your commands with a JSON array (up to 200) |
| `discordforge listing update listing.json` | Update listing fields from a JSON object |
| `discordforge announce --content "v2 is out" [--title "v2"] [--type UPDATE]` | Publish an announcement |
| `discordforge events [--types vote.created,review.created]` | Print live events until Ctrl+C |
| `discordforge webhook verify body.json --secret <s> --signature sha256=…` | Check a saved Webhooks v2 body (offline) |

Add `--json` to any command to print the raw API response, for scripts and `jq`:

```bash
discordforge analytics --days 7 --json | jq '.totals'
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | API or network error (or an invalid webhook signature) |
| `2` | Usage error: missing option, bad value, unknown command |

## License

[MIT](./LICENSE) © DiscordForge
