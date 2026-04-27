import type { LocalJSXCommandCall, LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js'
import { loadProviders } from '../../multiModel/modelConfig.js'

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args?: string,
) => {
  const question = args?.trim()
  if (!question) {
    onDone('Usage: /deepseek <question>', { display: 'system' })
    return null
  }

  const providers = loadProviders()
  const deepseek = providers.find(p => p.name === 'deepseek')
  if (!deepseek) {
    onDone('Deepseek provider not found in models.json', { display: 'system' })
    return null
  }

  try {
    const apiKey = deepseek.api_key.startsWith('${')
      ? process.env[deepseek.api_key.match(/^\$\{(.+)\}$/)?.[1] ?? ''] ?? deepseek.api_key
      : deepseek.api_key

    const baseUrl = deepseek.base_url.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: deepseek.default_model,
        messages: [{ role: 'user', content: question }],
        enable_thinking: false,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      onDone(`Deepseek API error (${response.status}): ${errorBody}`, { display: 'system' })
      return null
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      onDone('No response from deepseek', { display: 'system' })
      return null
    }

    onDone(content)
    return null
  } catch (err) {
    onDone(`Deepseek request failed: ${err instanceof Error ? err.message : String(err)}`, { display: 'system' })
    return null
  }
}
