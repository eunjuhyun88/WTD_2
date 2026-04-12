/**
 * Factor Event Emitter — P2.A1 seed module.
 *
 * Provides the base interface + synchronous emit helper that every
 * factor layer (F4..F17) will use to fire typed events into the
 * harness event bus.
 *
 * Design constraints:
 *   - Synchronous, zero-I/O: emit() must complete < 1μs.
 *   - Typed via contracts/events.ts: every emitted payload passes
 *     `EventPayloadSchema.parse()` at development time; production
 *     callers use the pre-validated path.
 *   - No PII in payloads — enforced by contract schema (numeric data only).
 *   - Consumers are registered via `on()`, called in insertion order.
 *
 * Reference:
 *   docs/exec-plans/active/trunk-plan.dag.json  P2.A1-events-base
 *   src/lib/contracts/events.ts                  E1 event registry
 */

import type { EventId, EventPayload } from '$lib/contracts/events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback signature for event consumers. */
export type FactorEventHandler = (payload: EventPayload) => void;

/**
 * The interface every factor layer emitter must satisfy.
 *
 * Intentionally minimal — factors call `emit()`, the harness
 * pipeline registers consumers via `on()` / `off()`.
 */
export interface FactorEventEmitter {
	/** Register a handler for a specific event ID. */
	on(eventId: EventId, handler: FactorEventHandler): void;

	/** Remove a previously registered handler. */
	off(eventId: EventId, handler: FactorEventHandler): void;

	/** Fire an event synchronously to all registered handlers. */
	emit(payload: EventPayload): void;

	/** Remove all handlers. Useful for test teardown. */
	clear(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a concrete `FactorEventEmitter`.
 *
 * Handlers are called synchronously in registration order.
 * If a handler throws, the error propagates — callers decide
 * whether to catch at the pipeline level.
 */
export function createFactorEventEmitter(): FactorEventEmitter {
	const listeners = new Map<EventId, FactorEventHandler[]>();

	return {
		on(eventId, handler) {
			let list = listeners.get(eventId);
			if (!list) {
				list = [];
				listeners.set(eventId, list);
			}
			list.push(handler);
		},

		off(eventId, handler) {
			const list = listeners.get(eventId);
			if (!list) return;
			const idx = list.indexOf(handler);
			if (idx !== -1) list.splice(idx, 1);
			if (list.length === 0) listeners.delete(eventId);
		},

		emit(payload) {
			const list = listeners.get(payload.id);
			if (!list || list.length === 0) return;
			for (let i = 0; i < list.length; i++) {
				list[i](payload);
			}
		},

		clear() {
			listeners.clear();
		}
	};
}
