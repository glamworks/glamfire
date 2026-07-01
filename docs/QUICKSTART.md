# Quickstart: glamfire → GLM 5.2 on Fireworks

A concrete, honest path from zero to a live `glam run` against GLM 5.2 on Fireworks.

## 1. Get a Fireworks key

Sign in at **https://fireworks.ai** and create an API key. It starts with `fw_`.

## 2. Export it

```bash
export FIREWORKS_API_KEY=fw_your_key_here
```

glamfire never stores secrets inline. The key is read from the environment (or your OS
keychain); config only ever holds a *reference* to it, never the value itself.

## 3. Point glamfire at GLM 5.2

Config is layered: built-in defaults → `~/.glam/config.toml` → `./glam.toml` → env → flags.
The default model is already `accounts/fireworks/models/glm-5p2`, so for the common case
you need no config file at all. To make it explicit, drop this in `~/.glam/config.toml`
(or `./glam.toml`):

```toml
model = "accounts/fireworks/models/glm-5p2"

[providers.fireworks]
# references only — never paste the key here
credential = { env = "FIREWORKS_API_KEY" }
```

`glam config` prints the fully resolved config with every secret redacted.

## 4. Verify the environment

```bash
glam doctor
```

Expect the `FIREWORKS_API_KEY` check to go **green** (alongside Node and install checks).
If it's red, the env var isn't visible to the shell you ran `glam` in — re-export and retry.

## 5. Make a first call

```bash
glam run "Compute (2 + 3) * 4 using the calculator tool."
```

You should see GLM 5.2 stream, the `calculator` tool dispatch, and the answer `20`
with `status: done`. Add `--explain` to see the router's center/edge decision live.

## Current reality (no vaporware)

Today the `glam` CLI **runs from source** — there is no published registry artifact yet:

```bash
git clone https://github.com/glamworks/glamfire.git
cd glamfire && pnpm install && pnpm -r build
node packages/cli/src/index.mjs doctor
node packages/cli/src/index.mjs run "Compute (2 + 3) * 4 using the calculator tool."
```

The `npm i -g glamfire` / `brew` / `scoop` / `winget` one-liners are **built and tested**
but their **publish is gated on maintainer secrets** (`NPM_TOKEN`, tap/bucket deploy keys,
`WINGET_TOKEN`). They go live the moment those secrets are added; until then, run from
source as above. The `glam run` → GLM 5.2 path is live-verified against a real key and a
real Fireworks call — nothing here is faked.
