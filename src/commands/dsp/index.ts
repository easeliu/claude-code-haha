import type { Command } from '../../commands.js'

const dsp = {
  type: 'local-jsx',
  name: 'dsp',
  description: 'Toggle dangerously skip permissions mode',
  argumentHint: '[on|off]',
  load: () => import('./dsp.js'),
} satisfies Command

export default dsp
