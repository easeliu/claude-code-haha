import { useEffect } from 'react'
import { formatTotalCost, saveCurrentSessionCosts } from './cost-tracker.js'
import {
  formatTodayTokenUsage,
  getTodayTokenSummary,
  recordDailyTokenUsage,
  getUnrecordedTokens,
  resetLastRecordedTokens,
} from './utils/dailyTokenTracker.js'
import { registerCleanup } from './utils/cleanupRegistry.js'
import type { FpsMetrics } from './utils/fpsTracker.js'
import { writeSync } from 'fs'

export function useCostSummary(
  getFpsMetrics?: () => FpsMetrics | undefined,
): void {
  useEffect(() => {
    // 重置上次的 token 记录（新会话开始）
    resetLastRecordedTokens()

    // 创建当前会话的清理函数
    const cleanupFunction = async () => {
      try {
        // 记录未记录的 token 消耗（增量记录后可能还有剩余）
        const unrecorded = getUnrecordedTokens()
        if (unrecorded.inputTokens > 0 ||
            unrecorded.outputTokens > 0 ||
            unrecorded.cacheReadTokens > 0 ||
            unrecorded.cacheCreationTokens > 0 ||
            unrecorded.costUSD > 0) {
          await recordDailyTokenUsage()
        }

        // 获取并显示今日 token 消耗和会话成本
        const summary = await getTodayTokenSummary()
        const lines: string[] = []

        if (summary) {
          lines.push(formatTodayTokenUsage(summary))
          lines.push('')
        }

        // 添加会话成本统计
        lines.push(formatTotalCost())

        if (lines.length > 0) {
          // 使用 writeSync 确保输出不会被 TUI 覆盖
          writeSync(process.stderr.fd, lines.join('\n') + '\n')
        }

        saveCurrentSessionCosts(getFpsMetrics?.())
      } catch {
        // Silent fail for token tracking
      }
    }

    // 注册清理函数
    const unregister = registerCleanup(cleanupFunction)

    return () => {
      // 组件卸载时移除清理函数
      unregister()
    }
  }, [getFpsMetrics])
}
