import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertAppServerRuntimeSecurity,
  detectDatabaseUser,
  getRuntimeSecurityErrors,
  getRuntimeSecurityWarnings,
  isProductionRuntime,
  isPlaceholderSecret,
  resetRuntimeSecurityForTests,
  validateAppServerSecretBoundaries,
} from './runtimeSecurity';

describe('runtimeSecurity', () => {
  afterEach(() => {
    resetRuntimeSecurityForTests();
  });

  it('detects placeholder-like secrets', () => {
    expect(isPlaceholderSecret('your_service_role_key')).toBe(true);
    expect(isPlaceholderSecret('postgresql://postgres:password@example:5432/postgres')).toBe(true);
    expect(isPlaceholderSecret('sb_secret_live_realvalue')).toBe(false);
  });

  it('extracts database usernames from connection strings', () => {
    expect(detectDatabaseUser('postgresql://postgres.abcd:secret@db.internal:5432/postgres')).toBe('postgres.abcd');
    expect(detectDatabaseUser('not-a-url')).toBeNull();
  });

  it('detects production runtimes from env', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false);
  });

  it('rejects service-role key in app runtime', () => {
    expect(() =>
      validateAppServerSecretBoundaries({
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_real_value',
      }),
    ).toThrow(/must not be present in app-web runtime/i);
  });

  it('rejects insecure production env toggles', () => {
    expect(
      getRuntimeSecurityErrors({
        NODE_ENV: 'production',
        TURNSTILE_ALLOW_BYPASS: 'true',
        TURNSTILE_FAIL_OPEN: 'true',
        PGSSL_INSECURE_SKIP_VERIFY: 'true',
        ENGINE_URL: 'http://engine-api.internal',
        SECURITY_ALLOWED_HOSTS: '',
      }),
    ).toEqual([
      'TURNSTILE_ALLOW_BYPASS must be false in production.',
      'TURNSTILE_FAIL_OPEN must be false in production.',
      'PGSSL_INSECURE_SKIP_VERIFY must be false in production.',
      'ENGINE_URL must use https in production unless it targets localhost.',
      'SECURITY_ALLOWED_HOSTS is required in production.',
    ]);
  });

  it('warns when DATABASE_URL uses a privileged role outside production', () => {
    expect(
      getRuntimeSecurityWarnings({
        DATABASE_URL: 'postgresql://postgres.abcd:secret@db.internal:5432/postgres',
      }),
    ).toEqual([
      expect.stringMatching(/privileged database role "postgres\.abcd"/i),
    ]);
  });

  it('fails when privileged database role is used in production', () => {
    expect(
      getRuntimeSecurityErrors({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres.abcd:secret@db.internal:5432/postgres',
        SECURITY_ALLOWED_HOSTS: 'app.cogotchi.dev',
      }),
    ).toEqual([
      'DATABASE_URL uses privileged database role "postgres.abcd". Production app-web must use a least-privilege role.',
    ]);
  });

  it('warns when turnstile secret is missing in production', () => {
    expect(
      getRuntimeSecurityWarnings({
        NODE_ENV: 'production',
        SECURITY_ALLOWED_HOSTS: 'app.cogotchi.dev',
      }),
    ).toEqual([
      'TURNSTILE_SECRET_KEY is not configured. Public auth routes rely on bot protection bypass policy.',
    ]);
  });

  it('logs warnings once runtime boundaries pass', () => {
    const warn = vi.fn();
    assertAppServerRuntimeSecurity(
      {
        DATABASE_URL: 'postgresql://postgres.abcd:secret@db.internal:5432/postgres',
      },
      { warn },
    );

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/\[runtime-security\].*privileged database role/i));
  });
});
