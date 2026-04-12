export interface ProposedAction {
  action: string
  entityId: string
  description: string
  /** For runSkill actions: the full prompt the agent will receive. */
  prompt?: string
}

const ALLOWED_ACTIONS: Record<string, string> = {
  startTask: "Start task",
  retryTask: "Retry task",
  skipTask: "Skip task",
  approvePhase: "Approve phase",
  rejectPhase: "Reject phase",
  approveMilestone: "Approve milestone",
  startPhase: "Start phase",
  runSkill: "Run skill",
}

const ACTION_RE = /^ACTION:\s+(\S+)\s+(\S+.*)$/

export function extractActions(assistantMessage: string): ProposedAction[] {
  const actions: ProposedAction[] = []

  for (const line of assistantMessage.split("\n")) {
    const match = line.trim().match(ACTION_RE)
    if (!match) continue

    const actionName = match[1]
    const entityId = match[2].trim()

    if (!(actionName in ALLOWED_ACTIONS)) continue
    if (!entityId) continue

    actions.push({
      action: actionName,
      entityId,
      description: `${ALLOWED_ACTIONS[actionName]}: ${entityId}`,
    })
  }

  return actions
}
