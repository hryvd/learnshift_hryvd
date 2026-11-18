// Isolated PostgreSQL regression checks; never contacts the configured backend.
// Requires Docker. No ports are exposed; the test container is removed on exit.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const name = `learnshift-sql-test-${process.pid}`;
const image = 'postgres:17-alpine@sha256:a77aa70e641402a21411b92b721c58d10f23b50ae5fdd2333efd22d166e1e5f7';
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Docker failed');
  return result.stdout.trim();
}
const sql = (input) => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input);
// Separate connections exercise the advisory lock with genuinely overlapping RPCs.
function sqlAsync(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']);
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(input);
  });
}


try {
  docker(['run', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', image]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { sql('select 1;'); ready = true; break; } catch { await setTimeout(500); }
  }
  assert(ready, 'PostgreSQL must be ready');
  // Minimal Supabase auth/publication scaffolding for executing the real schema.
  sql(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create publication supabase_realtime;
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    sql(readFileSync(new URL(file, migrations), 'utf8'));
  }
  sql(`
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000001','student@example.test','{"role":"student","display_name":"Student","grade":1}'),
      ('00000000-0000-0000-0000-000000000002','guardian@example.test','{"role":"guardian","display_name":"Guardian"}'),
      ('00000000-0000-0000-0000-000000000003','teacher@example.test','{"role":"teacher","display_name":"Teacher"}'),
      ('00000000-0000-0000-0000-000000000004','stranger@example.test','{"role":"guardian","display_name":"Stranger"}'),
      ('00000000-0000-0000-0000-000000000005','grade10@example.test','{"role":"student","display_name":"Grade Ten","grade":10}');
    do $$ begin
      assert (select grade = 1 from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'grade 1 signup';
      assert (select grade = 10 from public.profiles where id = '00000000-0000-0000-0000-000000000005'), 'grade 10 signup';
    end $$;
    insert into public.link_codes (student_id, code) values ('00000000-0000-0000-0000-000000000001','123456');
    insert into public.classes (id, teacher_id, name, grade, join_code) values
      ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Grade One',1,'ABCDEF');
  `);
  // Each call is its own committed transaction, as through PostgREST.
  for (let i = 0; i < 10; i++) {
    const result = sql(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; set role authenticated;
      select public.link_student('invalid')->>'code';`);
    assert(result.endsWith('invalid_code'), `attempt ${i + 1} must be counted`);
  }
  assert(sql(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; set role authenticated;
    select public.link_student('123456')->>'code';`).endsWith('rate_limited'), '11th attempt must be refused even with a valid code');
  assert.equal(sql(`select count(*) from private.link_attempts where user_id = '00000000-0000-0000-0000-000000000004';`), '10');
  sql(`
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set role authenticated;
    do $$ begin
      assert public.link_student('123456')->>'student_id' = '00000000-0000-0000-0000-000000000001', 'valid guardian link';
    end $$;
    reset role;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set role authenticated;
    do $$ begin
      assert public.join_class('abcdef')->>'grade' = '1', 'grade 1 class join';
      assert public.join_class('invalid')->>'code' = 'invalid_code', 'wrong class code';
    end $$;
    reset role;
    insert into public.mastery (student_id, skill_id, p) values ('00000000-0000-0000-0000-000000000001','fractions',0.5);
    insert into public.usage_daily (student_id,day,total_min) values ('00000000-0000-0000-0000-000000000001',current_date,10);
    insert into public.app_usage (student_id,day,package,label,category,minutes)
      values ('00000000-0000-0000-0000-000000000001',current_date,'test.app','Test','video',10);
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; set role authenticated;
    do $$ begin
      assert (select count(*) = 1 from public.usage_daily), 'guardian sees linked usage';
      assert (select count(*) = 1 from public.app_usage), 'guardian sees linked per-app usage';
      assert (select count(*) = 0 from public.mastery), 'guardian cannot see grades';
    end $$;
    reset role;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; set role authenticated;
    do $$ begin
      assert (select count(*) = 1 from public.mastery), 'teacher sees linked mastery';
      assert (select count(*) = 0 from public.usage_daily), 'teacher cannot see usage';
      assert (select count(*) = 0 from public.app_usage), 'teacher cannot see per-app usage';
    end $$;
    reset role;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; set role authenticated;
    do $$ begin
      assert (select count(*) = 0 from public.usage_daily), 'stranger cannot see usage';
      assert (select count(*) = 0 from public.mastery), 'stranger cannot see mastery';
    end $$;
  `);

  sql(`
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000006','parallel@example.test','{"role":"student","display_name":"Parallel","grade":"oops"}'),
      ('00000000-0000-0000-0000-000000000007','senior@example.test','{"role":"student","display_name":"Senior","grade":12}');
    do $$ begin
      assert (select grade is null from public.profiles where id = '00000000-0000-0000-0000-000000000006'), 'malformed grade is handled without aborting signup';
      assert (select grade = 12 from public.profiles where id = '00000000-0000-0000-0000-000000000007'), 'legacy grade 12 remains supported';
      assert not has_function_privilege('authenticated','private.take_link_attempt(uuid)','execute'), 'attempt accounting cannot be called directly';
      assert not has_function_privilege('anon','public.link_student(text)','execute'), 'anonymous callers cannot link';
    end $$;
  `);
  const concurrent = await Promise.all(Array.from({ length: 15 }, () => sqlAsync(`
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; set role authenticated;
    select public.join_class('wrong')->>'code';
  `)));
  assert.equal(concurrent.filter((r) => r.endsWith('invalid_code')).length, 10, 'exactly ten concurrent guesses are accepted');
  assert.equal(concurrent.filter((r) => r.endsWith('rate_limited')).length, 5, 'remaining concurrent guesses are limited');
  assert.equal(sql(`select count(*) from private.link_attempts where user_id = '00000000-0000-0000-0000-000000000006';`), '10');
  sql(`update private.link_attempts set at = now() - interval '61 minutes' where user_id = '00000000-0000-0000-0000-000000000006';`);
  assert(sql(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; set role authenticated;
    select public.join_class('ABCDEF')->>'class_id';`).endsWith('10000000-0000-0000-0000-000000000001'), 'expired attempts allow a valid join');
  assert.equal(sql(`select count(*) from private.link_attempts where user_id = '00000000-0000-0000-0000-000000000006';`), '1', 'expired records are pruned');
  console.log('PASS: all migrations; grade 1/10/12 and invalid input; committed and concurrent code limits; expiry; valid links/class join; guardian/teacher/stranger RLS; RPC privileges.');
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
}
