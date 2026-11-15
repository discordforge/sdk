<p align="center">
  <img src="https://discordforge.org/images/logo.png" alt="DiscordForge" width="200" />
</p>

<h1 align="center">DiscordForge JS</h1>

<p align="center">
  Official JavaScript and TypeScript packages for <a href="https://discordforge.org">DiscordForge</a>.
</p>

<p align="center">
  <a href="https://github.com/discordforge/sdk/actions"><img src="https://img.shields.io/github/actions/workflow/status/discordforge/sdk/test.yml?style=flat-square&cacheSeconds=300" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/discordforge/sdk?style=flat-square&cacheSeconds=300" alt="license" /></a>
</p>

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@discordforgejs/sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@discordforgejs/sdk.svg?style=flat-square&color=5865F2&cacheSeconds=300)](https://www.npmjs.com/package/@discordforgejs/sdk) | Node.js client for every API endpoint: stats, heartbeats, votes, reviews, uptime, analytics, status banner, live events, webhook verification, and auto-posting from discord.js |
| [`@discordforgejs/types`](./packages/types) | [![npm](https://img.shields.io/npm/v/@discordforgejs/types.svg?style=flat-square&color=5865F2&cacheSeconds=300)](https://www.npmjs.com/package/@discordforgejs/types) | TypeScript types for the Developer API, with no runtime code |
| [`@discordforgejs/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@discordforgejs/cli.svg?style=flat-square&color=5865F2&cacheSeconds=300)](https://www.npmjs.com/package/@discordforgejs/cli) | `discordforge` command for the terminal: check analytics, set the status banner, tail live events |

Most people want the SDK:

```bash
npm install @discordforgejs/sdk
```

```js
const { ForgeClient } = require("@discordforgejs/sdk");

const client = new ForgeClient("YOUR_API_KEY", "YOUR_BOT_ID");
await client.postStats({ serverCount: 1500 });
```

See the [SDK README](./packages/sdk/README.md) for the full API.

> The SDK used to be published as `discordforge-sdk`. That package no longer gets updates; switch to `@discordforgejs/sdk`.

## Development

This repository is an npm workspaces monorepo. Node.js 18 or higher.

```bash
npm install
npm run build      # builds types, then sdk, then cli
npm test           # unit tests
npm run typecheck
```

## Releasing

1. Run the **Release** workflow in GitHub Actions, pick the package and the version bump. It commits the bump, tags it as `<package>-v<version>` (for example `sdk-v2.0.1`) and creates a GitHub Release.
2. Publishing the release triggers **Publish to npm**, which publishes every package whose current version is not on npm yet, in the order `types`, `sdk`, `cli`.

The publish job needs an `NPM_TOKEN` secret with write access to the `@discordforgejs` org.

## Links

- [DiscordForge Dashboard](https://discordforge.org/dashboard)
- [API Documentation](https://discordforge.org/support/developers)
- [npm org](https://www.npmjs.com/org/discordforgejs)

## License

[MIT](./LICENSE) © DiscordForge
