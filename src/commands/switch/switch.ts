import type { LocalJSXCommandCall, LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js'
import { hasCustomProviders, loadProviders, loadActiveProvider, saveActiveProvider, invalidateCache } from '../../multiModel/modelConfig.js'

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args?: string,
) => {
  if (!hasCustomProviders()) {
    onDone(
      'No custom providers configured.\n' +
      'Create ~/.claude/models.json to enable provider switching.\n' +
      'See docs for format: array of {name, base_url, api_key, default_model, models, type}.',
      { display: 'system' },
    )
    return null
  }

  const providers = loadProviders()
  const active = loadActiveProvider()

  const parts = args?.trim().split(/\s+/).filter(Boolean) ?? []

  if (parts.length === 0) {
    // Show current and available providers
    const currentInfo = active
      ? `Current: ${active.provider} (${active.model})`
      : 'Current: default (Anthropic)'
    const providerList = providers.map(p => {
      const isActive = p.name === active?.provider
      const marker = isActive ? ' →' : ''
      return `  ${p.name}${marker}`
    }).join('\n')
    onDone(`${currentInfo}\nProviders:\n${providerList}`)
    return null
  }

  const providerName = parts[0]
  const modelName = parts[1]

  const provider = providers.find(p => p.name === providerName)
  if (!provider) {
    const names = providers.map(p => p.name).join(', ')
    onDone(`Unknown provider: ${providerName}\nAvailable: ${names}`, { display: 'system' })
    return null
  }

  // Determine the model to use
  const targetModel = modelName ?? provider.default_model

  // Validate model is in the provider's model list
  if (!provider.models.includes(targetModel)) {
    const models = provider.models.join(', ')
    onDone(
      `Model '${targetModel}' not available for provider '${providerName}'.\n` +
      `Available models:\n  ${models}`,
      { display: 'system' },
    )
    return null
  }

  // Save the new active provider
  saveActiveProvider({
    provider: providerName,
    model: targetModel,
  })
  // Invalidate cache so client.ts picks up the new config
  invalidateCache()

  const prevProvider = active?.provider
  const prevModel = active?.model
  onDone(
    `Switched to ${providerName} (${targetModel})` +
    (prevProvider ? `\nPreviously: ${prevProvider} (${prevModel})` : '')
  )
  return null
}
