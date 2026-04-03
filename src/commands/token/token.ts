import type { LocalCommandCall } from '../../types/command.js'
import {
  getHistoricalTokenUsage,
  getTodayTokenSummary,
  formatTodayTokenUsage,
} from '../../utils/dailyTokenTracker.js'
import { formatNumber } from '../../utils/format.js'

export const call: LocalCommandCall = async ({ args }) => {
  const daysArg = args?.trim()
  const days = daysArg ? parseInt(daysArg, 10) : 7

  if (daysArg === 'today') {
    // Show today's usage
    const summary = await getTodayTokenSummary()
    if (!summary) {
      return {
        type: 'text',
        value: 'No token usage data available for today yet.',
      }
    }
    return {
      type: 'text',
      value: formatTodayTokenUsage(summary),
    }
  }

  // Show historical usage
  const logs = await getHistoricalTokenUsage(isNaN(days) ? 7 : days)

  if (logs.length === 0) {
    return {
      type: 'text',
      value:
        'No historical token usage data found.\n\nData is collected at the end of each session.',
    }
  }

  // Calculate totals
  const totalTokens = logs.reduce((sum, log) => sum + log.totalTokens, 0)
  const totalCost = logs.reduce((sum, log) => sum + log.costUSD, 0)
  const totalSessions = logs.reduce((sum, log) => sum + log.sessions, 0)

  // Build table
  const tableHeader =
    '| Date | Tokens | Cost | Sessions | Avg/Session |\n' +
    '|------|--------|------|----------|-------------|'

  const tableRows = logs
    .map(
      log =>
        `| ${log.date} | ${formatNumber(log.totalTokens)} | $${log.costUSD.toFixed(4)} | ${log.sessions} | ${formatNumber(Math.round(log.totalTokens / log.sessions))} |`,
    )
    .join('\n')

  const summary = `\n**Token 消耗统计 (最近 ${logs.length} 天)**

| 指标 | 总计 | 日均 |
|------|------|------|
| Total Tokens | ${formatNumber(totalTokens)} | ${formatNumber(Math.round(totalTokens / logs.length))} |
| Total Cost | $${totalCost.toFixed(4)} | $${(totalCost / logs.length).toFixed(4)} |
| Sessions | ${totalSessions} | ${(totalSessions / logs.length).toFixed(1)} |

## 每日明细

${tableHeader}
${tableRows}
`

  return { type: 'text', value: summary }
}
