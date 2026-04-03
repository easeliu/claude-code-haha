/**
 * Token command - Show daily token consumption statistics.
 */
import type { Command } from '../../commands.js'

const token = {
  type: 'local',
  name: 'token',
  description: 'Show daily token consumption statistics. Usage: /token [days|today]',
  supportsNonInteractive: true,
  load: () => import('./token.js'),
} satisfies Command

export default token
