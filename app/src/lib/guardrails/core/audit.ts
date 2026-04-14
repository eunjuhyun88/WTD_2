import type { GuardrailAuditEvent } from './types';

export function recordGuardrailAudit(event: GuardrailAuditEvent): void {
  try {
    const payload = {
      ...event,
      createdAtIso: new Date(event.createdAt).toISOString(),
    };
    console.info('[guardrail.audit]', JSON.stringify(payload));
  } catch (error) {
    console.warn('[guardrail.audit] failed to serialize event', error);
  }
}
