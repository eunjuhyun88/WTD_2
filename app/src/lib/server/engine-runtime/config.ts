import { env } from '$env/dynamic/private';

export type EngineRuntimeMode = 'local' | 'remote';

const DEFAULT_ENGINE_RUNTIME_MODE: EngineRuntimeMode = 'local';

export function getEngineRuntimeMode(): EngineRuntimeMode {
  const raw = String(env.ENGINE_RUNTIME_MODE ?? DEFAULT_ENGINE_RUNTIME_MODE).trim().toLowerCase();
  if (raw === 'local' || raw === 'remote') return raw;
  return DEFAULT_ENGINE_RUNTIME_MODE;
}

export function assertRemoteImplemented(domain: string): never {
  throw new Error(
    `[engine-runtime] remote mode requested for ${domain}, but no engine-api transport is implemented yet`
  );
}
