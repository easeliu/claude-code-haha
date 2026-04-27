import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface ProviderConfig {
  name: string
  base_url: string
  api_key: string
  api_key_env?: string
  default_model: string
  models: string[]
  type: 'anthropic' | 'openai'
  anthropic_compatible: boolean
  /** Auth header style: 'bearer' → Authorization: Bearer, 'x-api-key' → x-api-key (default: x-api-key) */
  auth_type?: 'bearer' | 'x-api-key'
  /** When true, interceptor sets enable_thinking=false and strips thinking blocks (for providers that don't support Claude-style thinking) */
  disable_thinking?: boolean
}

export interface ActiveProviderConfig {
  provider: string
  model: string
}

const CONFIG_DIR = join(homedir(), '.claude')
const MODELS_FILE = join(CONFIG_DIR, 'models.json')
const ACTIVE_PROVIDER_FILE = join(CONFIG_DIR, 'activeProvider.json')

let providers: ProviderConfig[] | null = null
let activeProvider: ActiveProviderConfig | null = null

export function loadProviders(): ProviderConfig[] {
  if (providers) return providers
  if (!existsSync(MODELS_FILE)) {
    providers = []
    return providers
  }
  try {
    const raw = readFileSync(MODELS_FILE, 'utf-8')
    providers = JSON.parse(raw) as ProviderConfig[]
    return providers
  } catch {
    providers = []
    return providers
  }
}

export function loadActiveProvider(): ActiveProviderConfig | null {
  if (activeProvider) return activeProvider
  if (!existsSync(ACTIVE_PROVIDER_FILE)) {
    return null
  }
  try {
    const raw = readFileSync(ACTIVE_PROVIDER_FILE, 'utf-8')
    activeProvider = JSON.parse(raw) as ActiveProviderConfig
    return activeProvider
  } catch {
    return null
  }
}

export function saveActiveProvider(config: ActiveProviderConfig): void {
  activeProvider = config
  writeFileSync(ACTIVE_PROVIDER_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

export function getActiveProviderConfig(): {
  provider: ProviderConfig | null
  model: string
} | null {
  const active = loadActiveProvider()
  if (!active) return null
  const allProviders = loadProviders()
  const provider = allProviders.find(p => p.name === active.provider) ?? null
  return { provider, model: active.model }
}

export function hasCustomProviders(): boolean {
  return existsSync(MODELS_FILE) && loadProviders().length > 0
}

export function invalidateCache(): void {
  providers = null
  activeProvider = null
}

/**
 * Resolve the actual API key value.
 * Supports ${ENV_VAR} syntax — the value is expanded to the env variable.
 * If no ${...} pattern, the value is used as-is (literal key).
 */
export function resolveApiKey(raw: string): string {
  const match = raw.match(/^\$\{(.+)\}$/)
  if (match) {
    return process.env[match[1]] ?? raw
  }
  return raw
}
