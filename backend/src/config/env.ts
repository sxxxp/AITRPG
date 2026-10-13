import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const num = (v: string | undefined, fallback: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : fallback);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  scenarioDir: process.env.SCENARIO_DIR ?? fileURLToPath(new URL('../../../scenarios', import.meta.url)),
  llm: {
    /** ollama | openai | none */
    provider: (process.env.LLM_PROVIDER ?? 'ollama') as 'ollama' | 'openai' | 'none',
    baseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:11434',
    model: process.env.LLM_MODEL ?? 'gemma3:4b',
    apiKey: process.env.LLM_API_KEY ?? '',
    /** Qwen3 같은 추론 모델에서 생각 과정을 끌 때 false. 비우면 전송하지 않음 */
    think: process.env.LLM_THINK === undefined || process.env.LLM_THINK === '' ? undefined : process.env.LLM_THINK === 'true',
    numCtx: num(process.env.LLM_NUM_CTX, 4096),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 90_000),
  },
};
