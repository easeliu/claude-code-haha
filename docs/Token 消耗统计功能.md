# Token 消耗统计功能

## 概述

Token 消耗统计功能会自动记录每日的 token 使用情况，并在每次会话结束时显示当日的累计消耗。

## 功能特性

### 1. 会话结束时自动显示

每次会话结束时，系统会自动显示：
- 当日总 Token 消耗量
- 当日总费用（USD）
- 当日会话数量
- 当前会话的详细成本和用量

示例输出：
```
📊 今日 Token 消耗 (2026-04-03):
   Total Tokens: 125,847
   Total Cost: $0.3421
   Sessions: 3

Total cost:            $0.0847
Total duration (API):  2m 34s
Total duration (wall): 5m 12s
Total code changes:    234 lines added, 45 lines removed
Usage by model:
  qwen3.5-plus:        42,382 input, 8,234 output, 12,456 cache read, 5,678 cache write ($0.0847)
```

### 2. `/token` 命令

查看历史 token 消耗统计。

```bash
# 查看最近 7 天的统计（默认）
/token

# 查看最近 N 天的统计
/token 14

# 仅查看今日统计
/token today
```

示例输出：
```
**Token 消耗统计 (最近 7 天)**

| 指标           | 总计       | 日均      |
|----------------|-----------|----------|
| Total Tokens   | 892,456   | 127,494  |
| Total Cost     | $2.4521   | $0.3503  |
| Sessions       | 28        | 4.0      |

## 每日明细

| Date       | Tokens   | Cost     | Sessions | Avg/Session |
|------------|----------|----------|----------|-------------|
| 2026-04-03 | 125,847  | $0.3421  | 3        | 41,949      |
| 2026-04-02 | 148,923  | $0.4123  | 5        | 29,785      |
| 2026-04-01 | 98,234   | $0.2789  | 2        | 49,117      |
...
```

## 数据存储

Token 消耗数据存储在以下位置：

```
~/.claude/projects/<project-name>/token-logs/
├── 2026-04-01.md
├── 2026-04-02.md
├── 2026-04-03.md
└── ...
```

每个日志文件包含：
- Frontmatter 元数据（日期、总计、会话数等）
- 当日摘要表格
- 最近 20 次会话的详细记录

### 日志文件示例

```markdown
---
date: 2026-04-03
inputTokens: 85234
outputTokens: 23456
cacheReadTokens: 12345
cacheCreationTokens: 5678
totalTokens: 126713
costUSD: 0.3421
sessions: 3
lastUpdated: 2026-04-03T15:30:00.000Z
---

# Daily Token Usage - 2026-04-03

## Summary
...
```

## 统计指标说明

| 指标 | 说明 |
|------|------|
| Input Tokens | 输入给模型的 token 数量 |
| Output Tokens | 模型生成的 token 数量 |
| Cache Read Tokens | 从缓存读取的 token 数量 |
| Cache Creation Tokens | 创建缓存的 token 数量 |
| Total Tokens | 所有 token 的总和 |
| Cost USD | 以美元计费的总成本 |
| Sessions | 当日会话数量 |

## 注意事项

1. **数据记录时机**: Token 数据在会话结束时记录，确保数据完整性
2. **项目隔离**: 每个项目的 token 消耗独立记录
3. **静默失败**: 如果记录失败（如权限问题），不会影响正常会话流程
4. **隐私**: 数据存储在本地，不会上传到外部服务

## 相关文件

- `src/utils/dailyTokenTracker.ts` - 核心实现
- `src/commands/token/` - /token 命令实现
- `src/costHook.ts` - 会话结束时的显示逻辑
