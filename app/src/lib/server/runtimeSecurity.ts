const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];
const PRIVILEGED_DB_USERS = ['postgres', 'supabase_admin', 'supabase_auth_admin'];

type EnvLike = Record<string, string | undefined>;
type LoggerLike = Pick<Console, 'warn'>;

let runtimeValidated = false;

export function resetRuntimeSecurityForTests(): void {
  runtimeValidated = false;
}

export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return PLACEHOLDER_HINTS.some((hint) => normalized.includes(hint));
}

export function detectDatabaseUser(connectionString: string): string | null {
  try {
    return new URL(connectionString).username || null;
  } catch {
    return null;
  }
}

export function isProductionRuntime(envLike: EnvLike): boolean {
  const nodeEnv = envLike.NODE_ENV?.trim().toLowerCase();
  const vercelEnv = envLike.VERCEL_ENV?.trim().toLowerCase();
  return nodeEnv === 'production' || vercelEnv === 'production';
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function usesHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function getRuntimeSecurityErrors(envLike: EnvLike): string[] {
  const errors: string[] = [];
  const production = isProductionRuntime(envLike);

  const serviceRoleKey = envLike.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (serviceRoleKey) {
    errors.push(
      'SUPABASE_SERVICE_ROLE_KEY must not be present in app-web runtime. Move privileged Supabase access to worker-control only.',
    );
  }
  const secretKey = envLike.SUPABASE_SECRET_KEY?.trim() || '';
  if (secretKey) {
    errors.push(
      'SUPABASE_SECRET_KEY must not be present in app-web runtime. Move privileged Supabase access to worker-control only.',
    );
  }

  const databaseUrl = envLike.DATABASE_URL?.trim() || '';
  if (databaseUrl && isPlaceholderSecret(databaseUrl)) {
    errors.push('DATABASE_URL still looks like a placeholder value.');
  }

  if (!production) return errors;

  if (isTruthy(envLike.TURNSTILE_ALLOW_BYPASS)) {
    errors.push('TURNSTILE_ALLOW_BYPASS must be false in production.');
  }
  if (isTruthy(envLike.TURNSTILE_FAIL_OPEN)) {
    errors.push('TURNSTILE_FAIL_OPEN must be false in production.');
  }
  if (isTruthy(envLike.PGSSL_INSECURE_SKIP_VERIFY)) {
    errors.push('PGSSL_INSECURE_SKIP_VERIFY must be false in production.');
  }

  const engineUrl = envLike.ENGINE_URL?.trim() || '';
  if (engineUrl && !isPlaceholderSecret(engineUrl) && !usesHttps(engineUrl) && !engineUrl.includes('localhost')) {
    errors.push('ENGINE_URL must use https in production unless it targets localhost.');
  }

  if (!(envLike.SECURITY_ALLOWED_HOSTS?.trim() || '')) {
    errors.push('SECURITY_ALLOWED_HOSTS is required in production.');
  }

  return errors;
}

export function validateAppServerSecretBoundaries(envLike: EnvLike): void {
  const errors = getRuntimeSecurityErrors(envLike);
  if (errors.length === 0) return;
  throw new Error(errors[0]);
}

export function getRuntimeSecurityWarnings(envLike: EnvLike): string[] {
  const warnings: string[] = [];
  const production = isProductionRuntime(envLike);
  const databaseUrl = envLike.DATABASE_URL?.trim() || '';
  if (databaseUrl && !isPlaceholderSecret(databaseUrl)) {
    const username = detectDatabaseUser(databaseUrl)?.toLowerCase() || '';
    if (username && PRIVILEGED_DB_USERS.some((candidate) => username === candidate || username.startsWith(`${candidate}.`))) {
      warnings.push(
        `DATABASE_URL uses privileged database role "${username}". Create a least-privilege app role before production hardening completes.`,
      );
    }
  }

  if (production) {
    if (!(envLike.TURNSTILE_SECRET_KEY?.trim() || '')) {
      warnings.push('TURNSTILE_SECRET_KEY is not configured. Public auth routes rely on bot protection bypass policy.');
    }
  }

  return warnings;
}

export function assertAppServerRuntimeSecurity(
  envLike: EnvLike,
  logger: LoggerLike = console,
): void {
  if (runtimeValidated) return;
  runtimeValidated = true;

  validateAppServerSecretBoundaries(envLike);
  for (const warning of getRuntimeSecurityWarnings(envLike)) {
    logger.warn(`[runtime-security] ${warning}`);
  }
}
