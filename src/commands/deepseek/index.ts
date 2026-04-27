import type { Command } from '../../types/command.js'

const deepseekCmd = {
  type: 'local-jsx',
  name: 'deepseek',
  description: 'Ask deepseek a question using OpenAI-compatible API (no thinking)',
  argumentHint: '<question>',
  load: () => import('./deepseek.js'),
} satisfies Command

export default deepseekCmd
