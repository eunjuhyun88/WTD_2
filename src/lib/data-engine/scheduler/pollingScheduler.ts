import { CADENCE_MS } from './cadenceRegistry'
import type { DataCadence } from '../types'

export interface PollTask {
  id: string
  cadence: DataCadence
  fetch: () => Promise<unknown>
  onResult: (data: unknown) => void
  onError?: (err: Error) => void
  maxRetries?: number
}

interface PollTaskState {
  task: PollTask
  timer: ReturnType<typeof setInterval> | null
  retryCount: number
  lastRunAt: number
  isRunning: boolean
}

/**
 * Polling scheduler that runs fetch tasks at their defined cadence.
 * Each task runs independently with error handling and retry logic.
 */
export class PollingScheduler {
  private tasks = new Map<string, PollTaskState>()
  private started = false

  register(task: PollTask): void {
    this.unregister(task.id)
    const state: PollTaskState = {
      task,
      timer: null,
      retryCount: 0,
      lastRunAt: 0,
      isRunning: false,
    }
    this.tasks.set(task.id, state)
    if (this.started) this.startTask(state)
  }

  unregister(id: string): void {
    const state = this.tasks.get(id)
    if (state?.timer) clearInterval(state.timer)
    this.tasks.delete(id)
  }

  start(): void {
    this.started = true
    for (const state of this.tasks.values()) {
      this.startTask(state)
    }
  }

  stop(): void {
    this.started = false
    for (const state of this.tasks.values()) {
      if (state.timer) clearInterval(state.timer)
      state.timer = null
    }
  }

  stopAll(): void {
    this.stop()
    this.tasks.clear()
  }

  getStatus(): Map<string, { id: string; cadence: DataCadence; lastRunAt: number; isRunning: boolean; retryCount: number }> {
    const status = new Map<string, { id: string; cadence: DataCadence; lastRunAt: number; isRunning: boolean; retryCount: number }>()
    for (const [id, state] of this.tasks) {
      status.set(id, {
        id,
        cadence: state.task.cadence,
        lastRunAt: state.lastRunAt,
        isRunning: state.isRunning,
        retryCount: state.retryCount,
      })
    }
    return status
  }

  get taskCount(): number {
    return this.tasks.size
  }

  private startTask(state: PollTaskState): void {
    const intervalMs = CADENCE_MS[state.task.cadence]
    if (intervalMs <= 0) return // tick cadence = not polled

    // Run immediately on first start
    void this.runTask(state)

    state.timer = setInterval(() => {
      void this.runTask(state)
    }, intervalMs)
  }

  private async runTask(state: PollTaskState): Promise<void> {
    if (state.isRunning) return
    state.isRunning = true
    state.lastRunAt = Date.now()

    try {
      const result = await state.task.fetch()
      state.retryCount = 0
      state.task.onResult(result)
    } catch (err) {
      state.retryCount++
      const maxRetries = state.task.maxRetries ?? 3
      if (state.task.onError && state.retryCount <= maxRetries) {
        state.task.onError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      state.isRunning = false
    }
  }
}
