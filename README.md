# Airport Investment Intelligence Agent

A chat (and push-to-talk voice) agent for analysts who fund US airport modernization. Ask where renovation is likely to pay off and get a ranked, explained, sourced answer. Every number comes from deterministic TypeScript code over public BTS and FAA data; the language model only chooses tools and writes the explanation. Design and methodology: [docs/DESIGN.md](docs/DESIGN.md).

## Run it

Prerequisites: Node 24 or newer (Node 26 prints an engines warning from eve and works) and npm.

```bash
npm install
cp .env.example .env.local     # then choose a model route, below
npm run dev:web                # http://localhost:3000
```

### Choosing the model

Pick **one** route. No key is needed for the first.

1. **Local ChatGPT subscription (no key):** set `AGENT_MODEL=chatgpt`, run `npm run dev`, type `/login` and choose ChatGPT Subscription. Local development only; it cannot run in a deployment, and it gives no voice through the Gateway.
2. **Vercel AI Gateway key:** set `AI_GATEWAY_API_KEY`. Any model in the Gateway catalog, and ElevenLabs voice. The Gateway needs a card on file to unlock credits.
3. **Anthropic or OpenAI key directly:** set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Voice falls back to the browser's built-in speech.

`AGENT_MODEL` (optional) names the model, for example `anthropic/claude-sonnet-5.5`. The default is Haiku 5.5. See `.env.example`.

## Try these questions

1. Which airports in New England are strong candidates for terminal expansion? Then: *Now weight growth more heavily.*
2. Compare LA and Santa Ana airport congestion levels. Then: *Which one has more unmet demand?*
3. What is the percentage of long haul flights out of Anchorage airport? Then: *What if long haul means 3,000 miles?*
4. What is the unmet flight demand in SFO airport and why? Then: *Use an 85% threshold.*

Each tool row in the chat expands to its input and output, and every answer ends with its assumptions, data window and confidence.

## How to read the answers

- **Unmet demand is a demand-pressure proxy,** passengers carried above a load-factor threshold (default 80%). It is not observed lost demand: public data does not show who was turned away.
- **Scores are percentiles within a peer set** of US airports with at least 100,000 scheduled passengers. They rank airports against each other; they are not returns.
- **Congestion confidence drops when FAA data is incomplete.** If the FAA runway service is down, congestion uses the peak-month factor alone for every airport and the answer says so.
- **Data lags:** T-100 covers air carriers only and runs about four months behind. There is no gate, terminal-area or delay data.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest), including hand-verified fixtures |
| `npm run typecheck` | TypeScript for the library, agent and web app |
| `npm run eval` | Multi-turn evals against the live agent (needs a working model route). Judge checks run only with `AI_GATEWAY_API_KEY` |
| `npm run data:refresh` | Re-download BTS T-100 and rebuild `data/t100-snapshot.json` (several minutes; `--force` ignores the cache) |
| `npm run dev` | The agent in eve's terminal UI, where `/login` lives |
| `npm run build:web` | Production build of the web app |

## Good to know

- Restarting the dev server leaves earlier chats read-only; start a new chat.
- The T-100 snapshot is read from `data/` under the project root. A deployment must include that folder.
- Chats are stored by eve, with no app database: refreshing `/s/<id>` replays the conversation.
