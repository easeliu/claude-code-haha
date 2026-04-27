import type { Command } from '../../commands.js'

const switchCmd = {
  type: 'local-jsx',
  name: 'switch',
  description: 'Switch API provider or model',
  argumentHint: '[provider [model]]',
  load: () => import('./switch.js'),
} satisfies Command

export default switchCmd
