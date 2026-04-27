import type { ClientOptions } from '@anthropic-ai/sdk'
import {
  getActiveProviderConfig,
  resolveApiKey,
  hasCustomProviders,
} from '../../multiModel/modelConfig.js'

/**
 * Returns a fetch wrapper that redirects requests to the active custom provider.
 * Returns null if using default Anthropic (no interception needed).
 */
export function createProviderFetchInterceptor(): ((fetch: ClientOptions['fetch']) => ClientOptions['fetch']) | null {
  if (!hasCustomProviders()) return null

  return (inner: ClientOptions['fetch']) => {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return async (input, init) => {
      // Re-read active provider on each request to support switching
      const config = getActiveProviderConfig()
      if (!config?.provider) {
        return inner(input, init)
      }
      const { provider, model } = config
      const apiKey = resolveApiKey(provider.api_key)

      // For OpenAI-compatible providers, translate protocol
      if (!provider.anthropic_compatible) {
        return fetchOpenAI(inner, provider, apiKey, model, input, init)
      }
      // For Anthropic-compatible providers, rewrite URL + auth + model
      return fetchAnthropicCompatible(inner, provider, apiKey, model, input, init)
    }
  }
}

function fetchAnthropicCompatible(
  _inner: ClientOptions['fetch'],
  provider: NonNullable<ReturnType<typeof getActiveProviderConfig>>['provider'],
  apiKey: string,
  model: string,
  input: any,
  init: any,
): Promise<Response> {
  const innerFetch: (input: any, init: any) => Promise<Response> =
    (_inner ?? globalThis.fetch.bind(globalThis)) as any

  const baseUrl = provider.base_url.replace(/\/+$/, '')
  const newUrl = `${baseUrl}/v1/messages`

  let newBody = init?.body
  if (init?.body) {
    try {
      const bodyObj = JSON.parse(init.body as string)
      bodyObj.model = model
      newBody = JSON.stringify(bodyObj)
    } catch { /* ignore */ }
  }

  const headers = new Headers(init?.headers)
  headers.set('anthropic-version', '2023-06-01')
  headers.delete('host')

  const authType = provider.auth_type ?? 'x-api-key'
  if (authType === 'bearer') {
    headers.set('Authorization', `Bearer ${apiKey}`)
    headers.delete('x-api-key')
  } else {
    headers.set('x-api-key', apiKey)
  }

  return innerFetch(newUrl, { ...init, body: newBody, headers })
}

async function fetchOpenAI(
  _inner: ClientOptions['fetch'],
  provider: NonNullable<ReturnType<typeof getActiveProviderConfig>>['provider'],
  apiKey: string,
  model: string,
  input: any,
  init: any,
): Promise<Response> {
  const innerFetch: (input: any, init: any) => Promise<Response> =
    (_inner ?? globalThis.fetch.bind(globalThis)) as any

  let anthropicBody: any = {}
  if (init?.body) {
    try {
      anthropicBody = JSON.parse(init.body as string)
    } catch {
      return innerFetch(input, init)
    }
  }

  const messages = convertToOpenaiMessages(anthropicBody.messages ?? [])

  const openaiBody: Record<string, unknown> = {
    model,
    messages,
    enable_thinking: true,
  }

  if (anthropicBody.max_tokens) openaiBody.max_tokens = anthropicBody.max_tokens
  if (anthropicBody.temperature) openaiBody.temperature = anthropicBody.temperature
  if (anthropicBody.top_p) openaiBody.top_p = anthropicBody.top_p
  if (anthropicBody.system) {
    const systemText = Array.isArray(anthropicBody.system)
      ? anthropicBody.system.map((b: any) => b.text ?? '').join('')
      : String(anthropicBody.system)
    if (systemText) {
      (openaiBody.messages as any[]).unshift({ role: 'system', content: systemText })
    }
  }
  if (anthropicBody.tools?.length > 0) {
    openaiBody.tools = convertTools(anthropicBody.tools)
    openaiBody.tool_choice = anthropicBody.tool_choice ?? 'auto'
  }

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  headers.set('Content-Type', 'application/json')
  headers.delete('x-api-key')
  headers.delete('anthropic-version')
  headers.delete('host')

  const newUrl = `${provider.base_url}/chat/completions`

  const response = await innerFetch(newUrl, {
    ...init,
    method: 'POST',
    body: JSON.stringify(openaiBody),
    headers,
  })

  return convertOpenAIResponseToAnthropic(response)
}

/**
 * Convert Anthropic messages to OpenAI format.
 * Key: thinking blocks become `reasoning_content` field on the assistant message
 * (not a content array entry — deepseek doesn't accept {type: "thinking"} in content arrays).
 */
function convertToOpenaiMessages(anthropicMessages: any[]): any[] {
  const result: any[] = []
  for (const msg of anthropicMessages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content })
        continue
      }

      let textContent = ''
      let reasoningContent: string | null = null
      const toolCalls: any[] = []

      for (const block of msg.content) {
        if (block.type === 'text') {
          textContent += block.text
        } else if (block.type === 'thinking') {
          reasoningContent = (reasoningContent ?? '') + block.thinking
        } else if (block.type === 'redacted_thinking') {
          // Redacted thinking is opaque — append placeholder so deepseek sees something
          reasoningContent = (reasoningContent ?? '') + '[redacted]'
        } else if (block.type === 'image') {
          // For images, we need to use array content
          // This case is more complex; for now, skip image handling
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          })
        } else if (block.type === 'tool_result') {
          // tool_result becomes a separate message
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          })
        }
      }

      const openaiMsg: any = { role: msg.role }

      if (toolCalls.length > 0) {
        openaiMsg.tool_calls = toolCalls
      }

      if (textContent) {
        openaiMsg.content = textContent
      } else if (toolCalls.length > 0) {
        openaiMsg.content = null
      } else {
        openaiMsg.content = ''
      }

      if (reasoningContent && msg.role === 'assistant') {
        openaiMsg.reasoning_content = reasoningContent
      }

      result.push(openaiMsg)
    } else {
      result.push(msg)
    }
  }
  return result
}

function convertTools(anthropicTools: any[]): any[] {
  return anthropicTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema ?? {},
    },
  }))
}

/**
 * Convert OpenAI response to Anthropic format.
 * Extracts reasoning_content from the response and converts to thinking blocks.
 */
async function convertOpenAIResponseToAnthropic(response: Response): Promise<Response> {
  const status = response.status
  if (status < 200 || status >= 300) {
    let errorData: any
    try {
      errorData = await response.json()
    } catch {
      errorData = null
    }

    const errorMsg = errorData
      ? (errorData.error?.message || JSON.stringify(errorData))
      : `HTTP ${status}`

    return new Response(
      JSON.stringify({
        type: 'error',
        error: { type: 'api_error', message: errorMsg },
      }),
      { status, statusText: response.statusText, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const data = await response.json()
  const content: any[] = []
  const message = data.choices?.[0]?.message

  if (message?.reasoning_content) {
    content.push({ type: 'thinking', thinking: message.reasoning_content })
  }
  if (message?.content) {
    content.push({ type: 'text', text: message.content })
  }

  const toolCalls = message?.tool_calls
  if (toolCalls?.length > 0) {
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.id ?? `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: tc.function?.name ?? 'unknown',
        input: JSON.parse(tc.function?.arguments ?? '{}'),
      })
    }
  }

  const finishReason = data.choices?.[0]?.finish_reason
  const stopReason = finishReason === 'stop' ? 'end_turn' : finishReason === 'tool_calls' ? 'tool_use' : 'stop_sequence'

  const anthropicResponse = {
    id: data.id ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: data.model ?? 'unknown',
    stop_reason: stopReason,
    stop_sequence: data.choices?.[0]?.stop_reason ?? null,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  }

  return new Response(JSON.stringify(anthropicResponse), {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}
