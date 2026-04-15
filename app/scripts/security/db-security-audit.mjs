import pg from 'pg';

const { Client } = pg;

function parseArgs(argv) {
  const strict = argv.includes('--strict');
  const json = argv.includes('--json');
  return { strict, json };
}

function parseTableSet(value) {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.toLowerCase()),
  );
}

function printLines(lines) {
  for (const line of lines) {
    console.log(line);
  }
}

async function run() {
  const { strict, json } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const exemptFromRls = parseTableSet(process.env.DB_SECURITY_RLS_EXEMPT_TABLES);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const runtimeRoleResult = await client.query(`
      select
        current_user as current_user,
        r.rolsuper as is_superuser,
        r.rolcreaterole as can_create_role,
        r.rolcreatedb as can_create_db,
        r.rolreplication as can_replicate
      from pg_roles r
      where r.rolname = current_user
    `);

    const tablesResult = await client.query(`
      select
        n.nspname as schema_name,
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname
    `);

    const policiesResult = await client.query(`
      select
        schemaname as schema_name,
        tablename as table_name,
        policyname as policy_name,
        cmd as command,
        roles,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `);

    const grantsResult = await client.query(`
      select
        table_schema as schema_name,
        table_name,
        grantee,
        privilege_type
      from information_schema.table_privileges
      where table_schema = 'public'
      order by table_name, grantee, privilege_type
    `);

    const runtimeRole = runtimeRoleResult.rows[0] ?? null;
    const tables = tablesResult.rows.map((row) => ({
      schema: row.schema_name,
      table: row.table_name,
      rlsEnabled: Boolean(row.rls_enabled),
      rlsForced: Boolean(row.rls_forced),
      exempt: exemptFromRls.has(`${row.schema_name}.${row.table_name}`) || exemptFromRls.has(row.table_name),
    }));
    const policiesByTable = new Map();
    for (const row of policiesResult.rows) {
      const key = `${row.schema_name}.${row.table_name}`;
      const list = policiesByTable.get(key) ?? [];
      list.push({
        name: row.policy_name,
        command: row.command,
        roles: row.roles,
      });
      policiesByTable.set(key, list);
    }

    const grantsByTable = new Map();
    for (const row of grantsResult.rows) {
      const key = `${row.schema_name}.${row.table_name}`;
      const list = grantsByTable.get(key) ?? [];
      list.push({
        grantee: row.grantee,
        privilege: row.privilege_type,
      });
      grantsByTable.set(key, list);
    }

    const findings = [];
    if (runtimeRole?.is_superuser) {
      findings.push({
        severity: 'critical',
        code: 'db.superuser_runtime',
        message: `DATABASE_URL is using superuser role "${runtimeRole.current_user}".`,
      });
    }
    if (runtimeRole?.can_create_role || runtimeRole?.can_create_db || runtimeRole?.can_replicate) {
      findings.push({
        severity: 'high',
        code: 'db.elevated_runtime_role',
        message: `DATABASE_URL role "${runtimeRole.current_user}" has elevated global privileges.`,
      });
    }

    for (const table of tables) {
      const key = `${table.schema}.${table.table}`;
      const policies = policiesByTable.get(key) ?? [];
      const grants = grantsByTable.get(key) ?? [];
      const runtimeRoleGrants = grants
        .filter((grant) => grant.grantee === runtimeRole?.current_user)
        .map((grant) => grant.privilege);
      const publicOrPeerGrants = grants.filter((grant) => grant.grantee !== runtimeRole?.current_user);

      if (!table.rlsEnabled && !table.exempt) {
        findings.push({
          severity: 'high',
          code: 'db.rls_missing',
          table: key,
          message: `RLS is not enabled on ${key}.`,
        });
      }

      if (table.rlsEnabled && policies.length === 0) {
        findings.push({
          severity: 'medium',
          code: 'db.rls_no_policies',
          table: key,
          message: `RLS is enabled on ${key} but no policies are defined.`,
        });
      }

      if (runtimeRoleGrants.length > 0) {
        findings.push({
          severity: 'info',
          code: 'db.table_grants',
          table: key,
          message: `${key} grants for current role: ${runtimeRoleGrants.join(', ')}`,
        });
      }

      if (publicOrPeerGrants.length > 0) {
        const grouped = new Map();
        for (const grant of publicOrPeerGrants) {
          const privileges = grouped.get(grant.grantee) ?? [];
          privileges.push(grant.privilege);
          grouped.set(grant.grantee, privileges);
        }
        const details = Array.from(grouped.entries())
          .map(([grantee, privileges]) => `${grantee}: ${Array.from(new Set(privileges)).join(', ')}`)
          .join('; ');
        findings.push({
          severity: 'high',
          code: 'db.shared_table_grants',
          table: key,
          message: `${key} has grants beyond the runtime role (${details}).`,
        });
      }
    }

    const report = {
      runtimeRole,
      tables,
      policies: Object.fromEntries(policiesByTable),
      findings,
    };

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const lines = [
        `Runtime role: ${runtimeRole?.current_user ?? 'unknown'}`,
        `Superuser: ${runtimeRole?.is_superuser ? 'yes' : 'no'}`,
        `Elevated global privileges: ${
          runtimeRole && (runtimeRole.can_create_role || runtimeRole.can_create_db || runtimeRole.can_replicate) ? 'yes' : 'no'
        }`,
        `Public tables: ${tables.length}`,
        `Findings: ${findings.length}`,
      ];
      printLines(lines);
      if (findings.length > 0) {
        console.log('');
        for (const finding of findings) {
          const location = finding.table ? ` [${finding.table}]` : '';
          console.log(`- ${finding.severity.toUpperCase()} ${finding.code}${location}: ${finding.message}`);
        }
      }
    }

    const failingFindings = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high');
    if (strict && failingFindings.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(`[db-security-audit] ${error.message}`);
  process.exitCode = 1;
});
