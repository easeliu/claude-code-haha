/**
 * Daily Token Consumption Tracker
 *
 * Tracks and displays daily token usage across sessions.
 * Data is stored in ~/.claude/projects/<project>/token-logs/YYYY-MM-DD.md
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { findCanonicalGitRoot } from './git.js'
import { getProjectRoot } from '../bootstrap/state.js'
import {
  getTotalInputTokens,
  getTotalOutputTokens,
  getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens,
  getTotalCostUSD,
} from '../bootstrap/state.js'
import { formatNumber } from './format.js'

interface DailyTokenLog {
  date: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalTokens: number
  costUSD: number
  sessions: number
  lastUpdated: string
}

interface TokenLogEntry {
  timestamp: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUSD: number
}

const TOKEN_LOG_DIR = 'token-logs'

/**
 * Get the token logs directory for the current project
 */
function getTokenLogDir(): string {
  const projectRoot = findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot()
  const projectsDir = join(getClaudeConfigHomeDir(), 'projects')

  // Sanitize project path for use as directory name
  const sanitizedProject = projectRoot
    .replace(/[:\\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 100)

  return join(projectsDir, sanitizedProject, TOKEN_LOG_DIR)
}

/**
 * Get today's log file path
 */
function getTodayLogPath(): string {
  const today = new Date().toISOString().split('T')[0]
  return join(getTokenLogDir(), `${today}.md`)
}

/**
 * Parse existing log file content
 */
function parseLogFile(content: string): {
  summary: DailyTokenLog | null
  entries: TokenLogEntry[]
} {
  const lines = content.split('\n')
  const entries: TokenLogEntry[] = []
  let summary: DailyTokenLog | null = null

  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const data: Record<string, string | number> = {}
    for (const line of frontmatter.split('\n')) {
      const [key, value] = line.split(':').map(s => s.trim())
      if (key && value) {
        data[key] = isNaN(Number(value)) ? value : Number(value)
      }
    }

    if (data.date) {
      summary = {
        date: data.date as string,
        inputTokens: Number(data.inputTokens) || 0,
        outputTokens: Number(data.outputTokens) || 0,
        cacheReadTokens: Number(data.cacheReadTokens) || 0,
        cacheCreationTokens: Number(data.cacheCreationTokens) || 0,
        totalTokens: Number(data.totalTokens) || 0,
        costUSD: Number(data.costUSD) || 0,
        sessions: Number(data.sessions) || 0,
        lastUpdated: data.lastUpdated as string || '',
      }
    }
  }

  // Parse entries from table
  const tableRegex = /\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g
  let match
  while ((match = tableRegex.exec(content)) !== null) {
    const [, timestamp, input, output, cacheRead, cacheCreate, cost] = match
    entries.push({
      timestamp: timestamp.trim(),
      inputTokens: Number(input.trim()) || 0,
      outputTokens: Number(output.trim()) || 0,
      cacheReadTokens: Number(cacheRead.trim()) || 0,
      cacheCreationTokens: Number(cacheCreate.trim()) || 0,
      costUSD: Number(cost.trim()) || 0,
    })
  }

  return { summary, entries }
}

/**
 * Generate log file content
 */
function generateLogFileContent(log: DailyTokenLog, entries: TokenLogEntry[]): string {
  const tableRows = entries
    .slice(-20) // Keep last 20 entries in file
    .map(e =>
      `| ${e.timestamp} | ${formatNumber(e.inputTokens)} | ${formatNumber(e.outputTokens)} | ${formatNumber(e.cacheReadTokens)} | ${formatNumber(e.cacheCreationTokens)} | $${e.costUSD.toFixed(4)} |`
    )
    .join('\n')

  return `---
date: ${log.date}
inputTokens: ${log.inputTokens}
outputTokens: ${log.outputTokens}
cacheReadTokens: ${log.cacheReadTokens}
cacheCreationTokens: ${log.cacheCreationTokens}
totalTokens: ${log.totalTokens}
costUSD: ${log.costUSD.toFixed(4)}
sessions: ${log.sessions}
lastUpdated: ${log.lastUpdated}
---

# Daily Token Usage - ${log.date}

## Summary

| Metric | Value |
|--------|-------|
| Total Input Tokens | ${formatNumber(log.inputTokens)} |
| Total Output Tokens | ${formatNumber(log.outputTokens)} |
| Cache Read Tokens | ${formatNumber(log.cacheReadTokens)} |
| Cache Creation Tokens | ${formatNumber(log.cacheCreationTokens)} |
| **Total Tokens** | **${formatNumber(log.totalTokens)}** |
| **Total Cost** | **$${log.costUSD.toFixed(4)}** |
| Sessions | ${log.sessions} |

## Session History (Last 20)

| Timestamp | Input | Output | Cache Read | Cache Create | Cost |
|-----------|-------|--------|------------|--------------|------|
${tableRows}
`
}

/**
 * Record token usage at the end of a session
 */
export async function recordDailyTokenUsage(): Promise<void> {
  try {
    const logDir = getTokenLogDir()
    const logPath = getTodayLogPath()

    // Ensure directory exists
    await mkdir(logDir, { recursive: true })

    // Read existing log or create new one
    let content = ''
    try {
      content = await readFile(logPath, 'utf-8')
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw e
      }
    }

    const { summary, entries } = parseLogFile(content)

    // Get current session totals
    const inputTokens = getTotalInputTokens()
    const outputTokens = getTotalOutputTokens()
    const cacheReadTokens = getTotalCacheReadInputTokens()
    const cacheCreationTokens = getTotalCacheCreationInputTokens()
    const costUSD = getTotalCostUSD()

    // Update or create summary
    const now = new Date().toISOString()
    const today = now.split('T')[0]

    let newSummary: DailyTokenLog
    if (summary && summary.date === today) {
      // Update existing summary
      newSummary = {
        ...summary,
        inputTokens: summary.inputTokens + inputTokens,
        outputTokens: summary.outputTokens + outputTokens,
        cacheReadTokens: summary.cacheReadTokens + cacheReadTokens,
        cacheCreationTokens: summary.cacheCreationTokens + cacheCreationTokens,
        totalTokens: summary.totalTokens + inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
        costUSD: summary.costUSD + costUSD,
        sessions: summary.sessions + 1,
        lastUpdated: now,
      }
    } else {
      // Create new summary
      newSummary = {
        date: today,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
        costUSD,
        sessions: 1,
        lastUpdated: now,
      }
    }

    // Add entry
    entries.push({
      timestamp: now,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUSD,
    })

    // Write updated log
    const newContent = generateLogFileContent(newSummary, entries)
    await writeFile(logPath, newContent, 'utf-8')

  } catch (error) {
    // Silently fail - token logging is non-critical
    console.error('[DailyTokenTracker] Failed to record token usage:', error)
  }
}

/**
 * Get today's token usage summary for display
 */
export async function getTodayTokenSummary(): Promise<{
  date: string
  totalTokens: number
  totalCost: number
  sessions: number
} | null> {
  try {
    const logPath = getTodayLogPath()
    const content = await readFile(logPath, 'utf-8')
    const { summary } = parseLogFile(content)

    if (!summary) return null

    return {
      date: summary.date,
      totalTokens: summary.totalTokens,
      totalCost: summary.costUSD,
      sessions: summary.sessions,
    }
  } catch {
    return null
  }
}

/**
 * Format and display today's token usage
 */
export function formatTodayTokenUsage(summary: {
  date: string
  totalTokens: number
  totalCost: number
  sessions: number
}): string {
  const { date, totalTokens, totalCost, sessions } = summary

  return `\n📊 今日 Token 消耗 (${date}):
   Total Tokens: ${formatNumber(totalTokens)}
   Total Cost: $${totalCost.toFixed(4)}
   Sessions: ${sessions}`
}

/**
 * Get historical token usage for the last N days
 */
export async function getHistoricalTokenUsage(days: number = 7): Promise<DailyTokenLog[]> {
  const logDir = getTokenLogDir()
  const logs: DailyTokenLog[] = []

  try {
    const entries = await readdir(logDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue

      const dateStr = entry.name.replace('.md', '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

      const filePath = join(logDir, entry.name)
      const content = await readFile(filePath, 'utf-8')
      const { summary } = parseLogFile(content)

      if (summary) {
        logs.push(summary)
      }
    }

    // Sort by date descending and take last N days
    return logs
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days)
  } catch {
    return []
  }
}
