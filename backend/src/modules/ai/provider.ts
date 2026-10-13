import { env } from '../../config/env.js';

// BE-AI-01: LLM 공급자 어댑터. 엔진/서술 코드는 이 인터페이스만 사용한다.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens: number;
  temperature: number;
  /** 지정하면 이 JSON Schema 에 맞는 출력만 생성 (구조화 출력) */
  jsonSchema?: Record<string, unknown>;
}

export interface LlmHealth {
  available: boolean;
  message: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
  stream(messages: ChatMessage[], opts: ChatOptions): AsyncGenerator<string>;
  health(): Promise<LlmHealth>;
}

type LlmConfig = typeof env.llm;

/** 줄 단위 스트림 읽기 (NDJSON, SSE 공통) */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

async function post(url: string, body: unknown, cfg: LlmConfig, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM 요청 실패 (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

/** Ollama 네이티브 API: format(JSON Schema), think, num_ctx 를 직접 제어 */
class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  constructor(private readonly cfg: LlmConfig) {}

  get model() {
    return this.cfg.model;
  }

  private body(messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
    return {
      model: this.cfg.model,
      messages,
      stream,
      ...(opts.jsonSchema ? { format: opts.jsonSchema } : {}),
      ...(this.cfg.think !== undefined ? { think: this.cfg.think } : {}),
      keep_alive: '30m',
      options: { temperature: opts.temperature, num_predict: opts.maxTokens, num_ctx: this.cfg.numCtx },
    };
  }

  async complete(messages: ChatMessage[], opts: ChatOptions) {
    const res = await post(`${this.cfg.baseUrl}/api/chat`, this.body(messages, opts, false), this.cfg);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions) {
    const res = await post(`${this.cfg.baseUrl}/api/chat`, this.body(messages, opts, true), this.cfg);
    for await (const line of readLines(res.body!)) {
      const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.message?.content) yield chunk.message.content;
    }
  }

  async health(): Promise<LlmHealth> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = data.models?.map((m) => m.name) ?? [];
      const wanted = this.cfg.model.includes(':') ? this.cfg.model : `${this.cfg.model}:latest`;
      if (!names.includes(wanted)) {
        return { available: false, message: `모델 ${this.cfg.model} 이 없습니다. 'ollama pull ${this.cfg.model}' 을 실행하세요.` };
      }
      return { available: true, message: `Ollama · ${this.cfg.model}` };
    } catch {
      return { available: false, message: `Ollama(${this.cfg.baseUrl})에 연결할 수 없습니다.` };
    }
  }
}

/** OpenAI 호환 API (vLLM, llama.cpp server, 무료 API 등) */
class OpenAiCompatProvider implements LlmProvider {
  readonly name = 'openai';
  constructor(private readonly cfg: LlmConfig) {}

  get model() {
    return this.cfg.model;
  }

  private headers(): Record<string, string> {
    return this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {};
  }

  private body(messages: ChatMessage[], opts: ChatOptions, stream: boolean) {
    return {
      model: this.cfg.model,
      messages,
      stream,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.jsonSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'output', schema: opts.jsonSchema, strict: true } } }
        : {}),
    };
  }

  async complete(messages: ChatMessage[], opts: ChatOptions) {
    const res = await post(`${this.cfg.baseUrl}/chat/completions`, this.body(messages, opts, false), this.cfg, this.headers());
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async *stream(messages: ChatMessage[], opts: ChatOptions) {
    const res = await post(`${this.cfg.baseUrl}/chat/completions`, this.body(messages, opts, true), this.cfg, this.headers());
    for await (const line of readLines(res.body!)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async health(): Promise<LlmHealth> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(3000) });
      return res.ok
        ? { available: true, message: `OpenAI 호환 · ${this.cfg.model}` }
        : { available: false, message: `모델 목록 조회 실패 (${res.status})` };
    } catch {
      return { available: false, message: `${this.cfg.baseUrl} 에 연결할 수 없습니다.` };
    }
  }
}

export function createProvider(cfg: LlmConfig = env.llm): LlmProvider | null {
  if (cfg.provider === 'none') return null;
  return cfg.provider === 'openai' ? new OpenAiCompatProvider(cfg) : new OllamaProvider(cfg);
}
