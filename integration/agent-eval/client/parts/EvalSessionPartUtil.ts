import { EvalSessionPart } from '../../shared/schema/PromptPartDefinitions'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

/**
 * Custom prompt part: session/harness metadata for evaluation runs.
 * Provider mode defaults to unverified (no credentials assumed).
 */
export const EvalSessionPartUtil = registerPromptPartUtil(
	class EvalSessionPartUtil extends PromptPartUtil<EvalSessionPart> {
		static override type = 'evalSession' as const

		override getPart(): EvalSessionPart {
			return {
				type: 'evalSession',
				sessionId: 'agent-eval-local',
				harnessVersion: '1.0.0',
				providerMode: 'unverified',
				notes: 'Repository-owned agent-eval harness; provider execution not claimed.',
				generatedAt: new Date().toISOString(),
			}
		}
	}
)
