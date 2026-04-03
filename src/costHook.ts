import { useEffect } from 'react'
import { formatTotalCost, saveCurrentSessionCosts } from './cost-tracker.js'
import {
  formatTodayTokenUsage,
  getTodayTokenSummary,
  recordDailyTokenUsage,
} from './utils/dailyTokenTracker.js'
import { hasConsoleBillingAccess } from './utils/billing.js'
import type { FpsMetrics } from './utils/fpsTracker.js'

export function useCostSummary(
  getFpsMetrics?: () => FpsMetrics | undefined,
): void {
  useEffect(() => {
    const f = async () => {
      try {
        // 记录并显示当日 token 消耗
        await recordDailyTokenUsage()
        const summary = await getTodayTokenSummary()
        if (summary) {
          const formatted = formatTodayTokenUsage(summary)
          if (formatted) {
            process.stdout.write(formatted + '\n')
          }
        }
      } catch {
        // Silent fail for token tracking
      }

      // 显示当前会话成本
      if (hasConsoleBillingAccess()) {
        process.stdout.write('\n' + formatTotalCost() + '\n')
      }

      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      process.off('exit', f)
    }
  }, [])
}
