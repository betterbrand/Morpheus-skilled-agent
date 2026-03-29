# Inference Backends

Any OpenAI-compatible endpoint works with `--api-type openai`. These providers are ready to use:

| Provider | Base URL | Notes |
|----------|----------|-------|
| Venice AI | `https://api.venice.ai/api/v1` | DIEM credits; free tier available |
| AkashChat | `https://chatapi.akash.network/api/v1` | Always free |
| AkashML | `https://api.akashml.com/v1` | $100 signup credit |
| NEAR AI | `https://cloud-api.near.ai/v1` | Beta; free |
| OpenRouter | `https://openrouter.ai/api/v1` | 300+ models; USDC accepted |
| Together AI | `https://api.together.xyz/v1` | $25 credit |
| Hyperbolic | `https://api.hyperbolic.xyz/v1` | Free tier; use `openai` type for LLM, `hyperbolic-sd` for image gen |
| Local Ollama | `http://localhost:11434/v1` | Self-hosted; always free |

## API types

For most providers, use `--api-type openai`. Special cases:

- **Anthropic Claude:** use `--api-type claudeai`
- **Image generation:** use `prodia-v2`, `prodia-sd`, `prodia-sdxl`, or `hyperbolic-sd`
