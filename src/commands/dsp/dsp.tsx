import type { LocalJSXCommandCall, LocalJSXCommandOnDone, LocalJSXCommandContext } from '../../types/command.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { isBypassPermissionsModeDisabled } from '../../utils/permissions/permissionSetup.js'
import * as React from 'react'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Text } from '../../ink.js'

function DspDialog({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: string }) => void
}) {
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)
  const setAppState = useSetAppState()

  const currentMode = toolPermissionContext.mode
  const isActive = currentMode === 'bypassPermissions'
  const isAvailable = toolPermissionContext.isBypassPermissionsModeAvailable

  if (!isAvailable) {
    return (
      <Box>
        <Text color="error">
          Not available — session was not launched with --dangerously-skip-permissions
        </Text>
      </Box>
    )
  }

  const handleConfirm = () => {
    if (isBypassPermissionsModeDisabled()) {
      onDone('Bypass permissions mode is disabled by settings', { display: 'system' })
      return
    }

    if (!isActive) {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: {
          ...prev.toolPermissionContext,
          mode: 'bypassPermissions',
        },
      }))
      onDone('Dangerously skip permissions: ON — all tool calls will execute without permission checks')
    } else {
      setAppState(prev => ({
        ...prev,
        toolPermissionContext: {
          ...prev.toolPermissionContext,
          mode: 'default',
        },
      }))
      onDone('Dangerously skip permissions: OFF')
    }
  }

  const handleCancel = () => {
    onDone(`Kept dangerously skip permissions: ${isActive ? 'ON' : 'OFF'}`, { display: 'system' })
  }

  return (
    <Dialog
      title={<Text>⚠️  Dangerously Skip Permissions</Text>}
      subtitle="When ON, all tool calls execute without permission checks. Use with caution."
      onCancel={handleCancel}
      color="error"
      inputGuide={<Text>Enter to {isActive ? 'turn OFF' : 'turn ON'} · Esc to cancel</Text>}
    >
      <Box flexDirection="column" gap={0} marginLeft={2}>
        <Box flexDirection="row" gap={2}>
          <Text bold={true}>Mode</Text>
          <Text bold={true} color={isActive ? 'error' : undefined}>
            {isActive ? 'ON' : 'OFF'}
          </Text>
        </Box>
      </Box>
    </Dialog>
  )
}

export const call: LocalJSXCommandCall = async (
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args?: string,
) => {
  const arg = args?.trim().toLowerCase()

  if (arg === 'on' || arg === 'off') {
    // Handle shortcut directly using context
    const appState = _context.getAppState()
    const isAvailable = appState.toolPermissionContext.isBypassPermissionsModeAvailable

    if (!isAvailable) {
      onDone('Not available — session was not launched with --dangerously-skip-permissions', { display: 'system' })
      return null
    }

    if (isBypassPermissionsModeDisabled()) {
      onDone('Bypass permissions mode is disabled by settings', { display: 'system' })
      return null
    }

    const shouldEnable = arg === 'on'
    const currentMode = appState.toolPermissionContext.mode

    if (shouldEnable && currentMode !== 'bypassPermissions') {
      _context.setAppState(prev => ({
        ...prev,
        toolPermissionContext: {
          ...prev.toolPermissionContext,
          mode: 'bypassPermissions',
        },
      }))
      onDone('Dangerously skip permissions: ON — all tool calls will execute without permission checks')
    } else if (!shouldEnable && currentMode === 'bypassPermissions') {
      _context.setAppState(prev => ({
        ...prev,
        toolPermissionContext: {
          ...prev.toolPermissionContext,
          mode: 'default',
        },
      }))
      onDone('Dangerously skip permissions: OFF')
    } else {
      onDone(`Already ${shouldEnable ? 'ON' : 'OFF'}`, { display: 'system' })
    }
    return null
  }

  return <DspDialog onDone={onDone} />
}
