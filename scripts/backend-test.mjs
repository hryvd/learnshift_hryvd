// End-to-end backend test against the live Supabase project.
// Creates a throwaway student, guardian, teacher and stranger, checks every
// privacy rule and the realtime path, then deletes the accounts.
//
//   node --env-file=.env scripts/backend-test.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const run = Date.now().toString(36);
let seq = 0;
let failed = 0;
let passed = 0;

function ok(cond, label, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`, extra ?? '');
  }
}

async function user(role, name) {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signUp({
    email: `ls-test-${role}-${run}-${++seq}@learnshift-test.com`,
    password: `Test-${run}-pw!`,
    options: { data: { role, display_name: name, grade: role === 'student' ? 8 : null, lang: 'en' } },
  });
  if (error || !data.session) throw new Error(`${role} sign-up failed: ${error?.message ?? 'no session'}`);
  return { c, id: data.user.id };
}

const rows = async (q) => {
  const { data, error } = await q;
  return error ? { error } : data;
};

const all = [];
try {
  console.log('Sign-up');
  const student = await user("student", "Test Student");
  all.push(student);
  const guardian = await user("guardian", "Test Guardian");
  all.push(guardian);
  const teacher = await user("teacher", "Test Teacher");
  all.push(teacher);
  const stranger = await user("guardian", "Stranger");
  all.push(stranger);

  const p = await rows(student.c.from('profiles').select('*').eq('id', student.id).single());
  ok(p.role === 'student' && p.grade === 8, 'profile created from sign-up', p);
  const s = await rows(student.c.from('student_settings').select('*').eq('student_id', student.id));
  ok(s.length === 1, 'student settings row created');
  const pr = await rows(student.c.from('progress').select('*').eq('student_id', student.id));
  ok(pr.length === 1 && pr[0].coins === 0, 'progress row created');

  console.log('Role is fixed');
  const { error: roleErr } = await student.c.from('profiles').update({ role: 'teacher' }).eq('id', student.id);
  ok(!!roleErr, 'student cannot change own role');

  console.log('Guardian linking');
  const { data: code } = await student.c.rpc('my_link_code');
  ok(/^\d{6}$/.test(code), 'student gets a 6-digit code', code);
  const { data: badLink, error: badLinkError } = await guardian.c.rpc('link_student', { p_code: 'not-a-code' });
  ok(!badLinkError && badLink?.code === 'invalid_code', 'wrong code is rejected and counted');
  const { data: linked, error: linkErr } = await guardian.c.rpc('link_student', { p_code: code });
  ok(!linkErr && linked.student_id === student.id, 'guardian links with the code', linkErr);
  const { error: teacherLink } = await teacher.c.rpc('link_student', { p_code: code });
  ok(!!teacherLink, 'teacher cannot use a guardian code');
  const gp = await rows(guardian.c.from('profiles').select('display_name').eq('id', student.id));
  ok(gp.length === 1, 'guardian sees student name');
  const sp = await rows(student.c.from('profiles').select('display_name').eq('id', guardian.id));
  ok(sp.length === 1, 'student sees guardian name');

  console.log('Class joining');
  const { data: cls, error: clsErr } = await teacher.c.from('classes').insert({ name: 'Sampaguita', grade: 8 }).select().single();
  ok(!clsErr && /^[A-Z0-9]{6}$/.test(cls.join_code), 'teacher creates class with join code', clsErr);
  // Grade-school classes (grades 1-6) must be allowed: this failed before migration 20261117090000.
  const { data: g1, error: g1Err } = await teacher.c.from('classes').insert({ name: 'Grade 1 test', grade: 1 }).select().single();
  ok(!g1Err && g1?.grade === 1, 'teacher can create a Grade 1 class', g1Err);
  if (g1) await teacher.c.from('classes').delete().eq('id', g1.id);
  const { error: badGrade } = await teacher.c.from('classes').insert({ name: 'Bad grade', grade: 13 });
  ok(!!badGrade, 'grade 13 class is rejected');
  const { error: guardClass } = await guardian.c.from('classes').insert({ name: 'Nope' });
  ok(!!guardClass, 'guardian cannot create a class');
  const { data: joined, error: joinErr } = await student.c.rpc('join_class', { p_code: cls.join_code.toLowerCase() });
  ok(!joinErr && joined.class_id === cls.id, 'student joins with code (any case)', joinErr);
  const roster = await rows(teacher.c.from('class_members').select('student_id, profiles(display_name)').eq('class_id', cls.id));
  ok(roster.length === 1 && roster[0].profiles.display_name === 'Test Student', 'teacher sees roster with names', roster);

  console.log('Student writes');
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const w = await Promise.all([
    student.c.from('attempts').insert({ client_id: 'a1', question_id: 'fra-1', skill_id: 'fractions', chosen: 0, correct: false, seconds: 9 }),
    student.c.from('mastery').upsert({ student_id: student.id, skill_id: 'fractions', p: 0.41 }),
    student.c.from('mastery_daily').upsert({ student_id: student.id, day, skill_id: 'fractions', p: 0.41 }),
    student.c.from('usage_daily').upsert({ student_id: student.id, day, total_min: 134, video_min: 80, late_min: 12 }),
    student.c.from('nudge_events').insert({ client_id: 'n1', level: 'break', reasons: [{ key: 'videos' }], response: 'took' }),
    student.c.from('progress').update({ coins: 20 }).eq('student_id', student.id),
  ]);
  ok(w.every((r) => !r.error), 'attempt, mastery, usage, nudge, progress saved', w.map((r) => r.error).filter(Boolean));

  console.log('Privacy: guardian sees habits, never grades');
  ok((await rows(guardian.c.from('usage_daily').select('*').eq('student_id', student.id))).length === 1, 'guardian sees usage');
  ok((await rows(guardian.c.from('nudge_events').select('*').eq('student_id', student.id))).length === 1, 'guardian sees nudges');
  ok((await rows(guardian.c.from('mastery').select('*').eq('student_id', student.id))).length === 0, 'guardian cannot see mastery');
  ok((await rows(guardian.c.from('attempts').select('*').eq('student_id', student.id))).length === 0, 'guardian cannot see answers');
  ok((await rows(guardian.c.from('progress').select('*').eq('student_id', student.id))).length === 0, 'guardian cannot see progress');

  console.log('Privacy: teacher sees learning, never screen time');
  ok((await rows(teacher.c.from('mastery').select('*').eq('student_id', student.id))).length === 1, 'teacher sees mastery');
  ok((await rows(teacher.c.from('attempts').select('*').eq('student_id', student.id))).length === 1, 'teacher sees answers');
  ok((await rows(teacher.c.from('usage_daily').select('*').eq('student_id', student.id))).length === 0, 'teacher cannot see usage');
  ok((await rows(teacher.c.from('nudge_events').select('*').eq('student_id', student.id))).length === 0, 'teacher cannot see nudges');
  ok((await rows(teacher.c.from('time_requests').select('*').eq('student_id', student.id))).length === 0, 'teacher cannot see requests');

  console.log('Privacy: strangers see nothing');
  for (const t of ['profiles', 'usage_daily', 'nudge_events', 'mastery', 'attempts', 'guardian_controls', 'link_codes']) {
    const col = t === 'profiles' ? 'id' : 'student_id';
    ok((await rows(stranger.c.from(t).select('*').eq(col, student.id))).length === 0, `stranger cannot read ${t}`);
  }
  const { error: strangerWrite } = await stranger.c.from('usage_daily').upsert({ student_id: student.id, day, total_min: 1 });
  ok(!!strangerWrite, 'stranger cannot write usage');

  console.log('Controls and time requests (realtime)');
  const { error: selfUnlock } = await student.c.from('guardian_controls').update({ lock_enabled: false }).eq('student_id', student.id);
  const ctl = await rows(guardian.c.from('guardian_controls').select('*').eq('student_id', student.id).single());
  ok(ctl.lock_enabled === false && (selfUnlock || true), 'controls row exists for guardian');
  await guardian.c.from('guardian_controls').update({ lock_enabled: true }).eq('student_id', student.id);
  const { data: afterStudent } = await student.c
    .from('guardian_controls')
    .update({ lock_enabled: false })
    .eq('student_id', student.id)
    .select();
  ok(!afterStudent || afterStudent.length === 0, 'student cannot switch the lock off');
  const { error: fakeApproved } = await student.c.from('time_requests').insert({ minutes: 15, status: 'approved' });
  ok(!!fakeApproved, 'student cannot self-approve a request');

  const events = [];
  const channel = guardian.c
    .channel(`test-${run}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'time_requests' }, (e) => events.push(e))
    .subscribe();
  await new Promise((r) => {
    const t = setInterval(() => {
      if (channel.state === 'joined') {
        clearInterval(t);
        r();
      }
    }, 100);
  });
  await new Promise((r) => setTimeout(r, 1500));
  const { data: req, error: reqErr } = await student.c.from('time_requests').insert({ minutes: 15 }).select().single();
  ok(!reqErr && req.status === 'pending', 'student asks for 15 min', reqErr);
  for (let i = 0; i < 50 && events.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
  ok(events.length === 1 && events[0].new.id === req.id, 'guardian receives the request live');
  await guardian.c.removeChannel(channel);
  const { error: strangerDecide } = await stranger.c.rpc('decide_request', { p_id: req.id, p_approve: true });
  ok(!!strangerDecide, 'stranger cannot approve');
  const { data: decided, error: decideErr } = await guardian.c.rpc('decide_request', { p_id: req.id, p_approve: true });
  ok(!decideErr && decided.status === 'approved', 'guardian approves', decideErr);
  const ctl2 = await rows(student.c.from('guardian_controls').select('unlock_until').eq('student_id', student.id).single());
  const mins = (new Date(ctl2.unlock_until).getTime() - Date.now()) / 60000;
  ok(mins > 14 && mins <= 15.1, 'student is unlocked for 15 minutes', ctl2);

  console.log('Devices');
  const { data: dt } = await student.c.rpc('create_device_token', { p_platform: 'android' });
  ok(/^[0-9a-f]{64}$/.test(dt ?? ''), 'student gets a monitor device token');
  const { error: guardDt } = await guardian.c.rpc('create_device_token', { p_platform: 'android' });
  ok(!!guardDt, 'guardian cannot create a monitor token');
  const { error: pushErr } = await guardian.c.rpc('register_push_token', { p_token: `ExponentPushToken[test-${run}]`, p_platform: 'ios' });
  ok(!pushErr, 'push token registered', pushErr);

  console.log('Monitor ingest');
  const ingest = (token, body) =>
    fetch(`${URL}/functions/v1/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-token': token, apikey: KEY },
      body: JSON.stringify(body),
    });
  const bad = await ingest('0'.repeat(64), { events: [] });
  ok(bad.status === 401, 'unknown device token rejected', bad.status);
  const good = await ingest(dt, {
    platform: 'android',
    events: [{ client_id: 'mon-1', at: new Date().toISOString(), level: 'checkin', reasons: [{ key: 'minutes', value: 45 }] }],
    usage: [{ day, total_min: 150, video_min: 95, sessions: 12 }],
  });
  const gb = await good.json();
  ok(good.ok && gb.events === 1 && gb.usage === 1, 'monitor reports nudge + usage', gb);
  const mon = await rows(guardian.c.from('nudge_events').select('source').eq('client_id', 'mon-1'));
  ok(mon.length === 1 && mon[0].source === 'android', 'guardian sees the monitor nudge');
  const u2 = await rows(guardian.c.from('usage_daily').select('total_min').eq('student_id', student.id).single());
  ok(u2.total_min === 150, 'monitor usage overwrites the day');
  const appsRes = await ingest(dt, {
    platform: 'android',
    apps: [{ day, package: 'com.zhiliaoapp.musically', label: 'TikTok', category: 'video', minutes: 42 }],
    live: { package: 'com.zhiliaoapp.musically', label: 'TikTok', category: 'video', session_min: 7, screen_on: true },
  });
  const ab = await appsRes.json();
  ok(appsRes.ok && ab.apps === 1 && ab.live, 'monitor reports per-app minutes and the app in use', ab);
  ok((await rows(guardian.c.from('app_usage').select('*').eq('student_id', student.id))).length === 1, 'guardian sees per-app minutes');
  ok((await rows(guardian.c.from('live_status').select('*').eq('student_id', student.id))).length === 1, 'guardian sees the app in use');
  ok((await rows(teacher.c.from('app_usage').select('*').eq('student_id', student.id))).length === 0, 'teacher cannot see per-app minutes');
  ok((await rows(teacher.c.from('live_status').select('*').eq('student_id', student.id))).length === 0, 'teacher cannot see the app in use');
  ok((await rows(stranger.c.from('app_usage').select('*').eq('student_id', student.id))).length === 0, 'stranger cannot see per-app minutes');
  const { error: selfApps } = await student.c.from('app_usage').insert({ student_id: student.id, day, package: 'x', label: 'x', category: 'other', minutes: 1 });
  ok(!!selfApps, 'apps can only be written by the phone monitor');

  console.log('Gemini tutor');
  const t0 = Date.now();
  const { data: tut, error: tutErr } = await student.c.functions.invoke('tutor', {
    body: { mode: 'explain', questionId: 'fra-1', wrongIndex: 2, lang: 'fil' },
  });
  ok(!tutErr && tut.steps?.length >= 2 && tut.source === 'generated', `explains an uncovered mistake (${Date.now() - t0} ms, ${tut?.model})`, tutErr?.message ?? tut);
  if (tut) console.log(`    "${tut.what}" · confidence ${tut.confidence}`);
  const saved = await rows(teacher.c.from('tutor_answers').select('id, status').eq('student_id', student.id));
  ok(saved.length === 1, 'teacher sees the tutor answer');
  const { data: rev, error: revErr } = await teacher.c
    .from('tutor_answers')
    .update({ status: 'approved', reviewed_by: teacher.id, reviewed_at: new Date().toISOString() })
    .eq('id', saved[0]?.id)
    .select();
  ok(!revErr && rev?.length === 1, 'teacher approves it', revErr);
  const { data: gRev } = await guardian.c.from('tutor_answers').select('id').eq('student_id', student.id);
  ok((gRev ?? []).length === 0, 'guardian cannot see tutor answers');
  const { data: chat, error: chatErr } = await student.c.functions.invoke('tutor', {
    body: { mode: 'chat', questionId: 'fra-1', lang: 'en', message: 'why do the bottoms need to match?' },
  });
  ok(!chatErr && typeof chat.reply === 'string' && chat.reply.length > 10, 'tutor chat replies', chatErr?.message ?? chat);
  if (chat?.reply) console.log(`    "${chat.reply.slice(0, 140)}"`);
  const { error: badQ } = await student.c.functions.invoke('tutor', { body: { mode: 'explain', questionId: 'nope', wrongIndex: 1 } });
  ok(!!badQ, 'unknown question rejected');

  console.log('Notifications');
  const { data: req2 } = await student.c.from('time_requests').insert({ minutes: 10 }).select().single();
  const { data: n1, error: n1e } = await student.c.functions.invoke('notify', { body: { type: 'time_request', id: req2.id } });
  ok(!n1e && typeof n1.sent === 'number', 'student notifies guardians of a request', n1e?.message);
  const { error: n2e } = await stranger.c.functions.invoke('notify', { body: { type: 'time_request', id: req2.id } });
  ok(!!n2e, "stranger cannot announce someone else's request");
  await guardian.c.rpc('decide_request', { p_id: req2.id, p_approve: false });
  const { error: n3e } = await guardian.c.functions.invoke('notify', { body: { type: 'request_decided', id: req2.id } });
  ok(!n3e, 'guardian notifies the student of the decision', n3e?.message);
  const { error: n4e } = await guardian.c.functions.invoke('notify', { body: { type: 'lock_changed', studentId: student.id } });
  ok(!n4e, 'guardian notifies a lock change', n4e?.message);
  const { error: n5e } = await stranger.c.functions.invoke('notify', { body: { type: 'lock_changed', studentId: student.id } });
  ok(!!n5e, 'stranger cannot notify a lock change');

  console.log('Kapuluan social, chat, privacy & tide engine');
  const friendB = await user('student', 'Friend B');
  all.push(friendB);
  const friendC = await user('student', 'Friend C');
  all.push(friendC);

  // Enroll Friend C in the same class to test classmate discovery
  const { error: cJoinErr } = await friendC.c.rpc('join_class', { p_code: cls.join_code });
  ok(!cJoinErr, 'friend C joins class', cJoinErr);

  const { data: fCodeA, error: codeErrA } = await student.c.rpc('my_friend_code', { regenerate: false });
  ok(!codeErrA && /^[A-Z2-9]{6}$/.test(fCodeA ?? ''), 'student gets a 6-char friend code', fCodeA);
  const { error: guardCodeErr } = await guardian.c.rpc('my_friend_code', { regenerate: false });
  ok(!!guardCodeErr, 'guardian cannot create a friend code');

  const { data: reqCodeRes, error: reqCodeErr } = await friendB.c.rpc('send_friend_request_by_code', { p_code: fCodeA.toLowerCase() });
  ok(!reqCodeErr && reqCodeRes?.status === 'pending', 'friend B sends request via friend code', reqCodeErr);
  const { error: strangerAddErr } = await student.c.rpc('send_friend_request', { p_target_id: friendB.id });
  // Already pending between student & friendB — check arbitrary non-classmate rejection instead:
  const outsider = await user('student', 'Outsider Student');
  all.push(outsider);
  const { error: nonClassErr } = await student.c.rpc('send_friend_request', { p_target_id: outsider.id });
  ok(!!nonClassErr, 'cannot friend-request non-classmate by UUID without friend code');

  const { data: accRes, error: accErr } = await student.c.rpc('respond_friend_request', {
    p_friendship_id: reqCodeRes.id,
    p_accept: true,
  });
  ok(!accErr && accRes?.status === 'accepted' && !!accRes?.conversation_id, 'student accepts friend request and opens DM', accErr);

  // Classmate request (student -> friendC)
  const { data: reqClassRes, error: reqClassErr } = await student.c.rpc('send_friend_request', { p_target_id: friendC.id });
  ok(!reqClassErr && reqClassRes?.status === 'pending', 'student sends classmate friend request', reqClassErr);
  await friendC.c.rpc('respond_friend_request', { p_friendship_id: reqClassRes.id, p_accept: true });

  // Messaging + profanity + stranger + guardian privacy checks
  const dmId = accRes.conversation_id;
  const { data: msgOk, error: msgErr } = await student.c.rpc('send_message', {
    p_conversation_id: dmId,
    p_body: "Kaya natin 'to!",
    p_kind: 'text',
  });
  ok(!msgErr && msgOk?.id, 'accepted friends can message each other', msgErr);
  const { error: msgBErr } = await friendB.c.rpc('send_message', {
    p_conversation_id: dmId,
    p_body: 'Game, aral tayo!',
    p_kind: 'text',
  });
  ok(!msgBErr, 'friend B replies in DM', msgBErr);

  const { error: profErr } = await student.c.rpc('send_message', {
    p_conversation_id: dmId,
    p_body: 'ang bobo mo naman gago',
    p_kind: 'text',
  });
  ok(!!profErr, 'server profanity filter blocks EN/FIL slurs');

  const strangerMsgs = await rows(stranger.c.from('messages').select('*').eq('conversation_id', dmId));
  ok(Array.isArray(strangerMsgs) && strangerMsgs.length === 0, 'stranger cannot read DM messages');
  const guardianMsgs = await rows(guardian.c.from('messages').select('*').eq('conversation_id', dmId));
  ok(Array.isArray(guardianMsgs) && guardianMsgs.length === 0, 'guardian cannot read DM messages');
  const teacherMsgs = await rows(teacher.c.from('messages').select('*').eq('conversation_id', dmId));
  ok(Array.isArray(teacherMsgs) && teacherMsgs.length === 0, 'teacher cannot read DM messages');

  const { data: gFriends, error: gfErr } = await guardian.c.rpc('guardian_child_friends', { p_student_id: student.id });
  ok(!gfErr && Array.isArray(gFriends) && gFriends.length === 2, 'guardian sees child friend list', gfErr);
  const { error: outsiderGfErr } = await stranger.c.rpc('guardian_child_friends', { p_student_id: student.id });
  ok(!!outsiderGfErr, 'stranger cannot read child friend list');

  // Guardian disables chat -> student cannot send messages
  await guardian.c.from('guardian_controls').update({ chat_enabled: false }).eq('student_id', student.id);
  const { error: chatOffErr } = await student.c.rpc('send_message', {
    p_conversation_id: dmId,
    p_body: 'hello again',
    p_kind: 'text',
  });
  ok(!!chatOffErr, 'guardian chat_enabled=false blocks sending messages');
  await guardian.c.from('guardian_controls').update({ chat_enabled: true }).eq('student_id', student.id);

  // Archipelago pact creation, invite, tide/drift calculation, and Sagwan
  const { data: archRes, error: archErr } = await student.c.rpc('create_archipelago', {
    p_name: 'Barkada Test',
    p_friend_ids: [friendB.id, friendC.id],
  });
  ok(!archErr && archRes?.id && archRes?.invited_count === 2, 'student creates barkada pact and invites 2 friends', archErr);

  const { data: kapB1 } = await friendB.c.rpc('get_my_archipelagos');
  const invB = kapB1?.incoming_invites?.find((i) => i.archipelago_id === archRes.id);
  ok(!!invB, 'friend B receives pact invite');
  await friendB.c.rpc('respond_archipelago_invite', { p_invite_id: invB.id, p_accept: true });

  const { data: kapC1 } = await friendC.c.rpc('get_my_archipelagos');
  const invC = kapC1?.incoming_invites?.find((i) => i.archipelago_id === archRes.id);
  await friendC.c.rpc('respond_archipelago_invite', { p_invite_id: invC.id, p_accept: true });

  // Student A aces attempts today; Friend B stays inactive -> Friend B drifts!
  await student.c.from('attempts').insert([
    { client_id: 'kap-1', question_id: 'fra-1', skill_id: 'fractions', chosen: 1, correct: true, seconds: 5 },
    { client_id: 'kap-2', question_id: 'fra-2', skill_id: 'fractions', chosen: 1, correct: true, seconds: 5 },
    { client_id: 'kap-3', question_id: 'fra-3', skill_id: 'fractions', chosen: 1, correct: true, seconds: 5 },
  ]);
  await student.c.from('usage_daily').upsert({ student_id: student.id, day, breaks: 2, learning_min: 5 });

  const { data: kapNow, error: kapNowErr } = await student.c.rpc('get_my_archipelagos');
  const testArch = kapNow?.archipelagos?.find((a) => a.id === archRes.id);
  const meMem = testArch?.members?.find((m) => m.student_id === student.id);
  const bMem = testArch?.members?.find((m) => m.student_id === friendB.id);
  ok(
    !kapNowErr && testArch?.members?.length === 3 && meMem?.agos_7d > 70 && meMem?.is_lighthouse_leader === true && bMem?.drift_level > 0,
    'tide engine ranks ace scholar as lighthouse leader and drifts inactive friend',
    { meMem, bMem, kapNowErr },
  );

  // Friends still cannot read raw attempts or usage_daily
  ok((await rows(friendB.c.from('attempts').select('*').eq('student_id', student.id))).length === 0, 'friend cannot see raw quiz attempts');
  ok((await rows(friendB.c.from('usage_daily').select('*').eq('student_id', student.id))).length === 0, 'friend cannot see raw usage_daily');

  const { data: sagRes, error: sagErr } = await student.c.rpc('send_sagwan', {
    p_archipelago_id: archRes.id,
    p_recipient_id: friendB.id,
    p_message: "Kaya mo 'yan!",
  });
  ok(!sagErr && sagRes?.id, 'student throws Sagwan paddle to drifting friend', sagErr);

  // Report & Block enforcement
  const { data: repId, error: repErr } = await student.c.rpc('report_user', {
    p_target_id: friendB.id,
    p_reason: 'spam',
    p_details: 'test report',
    p_message_id: msgOk.id,
  });
  ok(!repErr && !!repId, 'student submits moderation report', repErr);

  await student.c.rpc('block_user', { p_target_id: friendB.id });
  const { error: blockedMsgErr } = await friendB.c.rpc('send_message', {
    p_conversation_id: dmId,
    p_body: 'blocked attempt',
    p_kind: 'text',
  });
  ok(!!blockedMsgErr, 'blocked user cannot send DM messages');
  const blockedSee = await rows(student.c.from('messages').select('*').eq('conversation_id', dmId));
  ok(Array.isArray(blockedSee) && blockedSee.length === 0, 'blocked user messages are hidden from blocker');

  console.log('Teacher app: claim_teacher_role');
  {
    // Email sign-ups chose their role already; only fresh OAuth accounts may claim it.
    const st = await user('student', 'Claim Student');
    all.push(st);
    const { data: sd } = await st.c.rpc('claim_teacher_role');
    const { data: sp } = await st.c.from('profiles').select('role').eq('id', st.id).single();
    ok(!!sd?.error && sp?.role === 'student', 'email student cannot claim the teacher role', sd);
    const te = await user('teacher', 'Claim Teacher');
    all.push(te);
    const { data: td } = await te.c.rpc('claim_teacher_role');
    ok(td?.role === 'teacher', 'teacher calling claim stays a teacher', td);
    const gu = await user('guardian', 'Claim Guardian');
    all.push(gu);
    const { data: gd } = await gu.c.rpc('claim_teacher_role');
    const { data: gp } = await gu.c.from('profiles').select('role').eq('id', gu.id).single();
    ok(gd?.code === 'role_taken' && gp?.role === 'guardian', 'guardian cannot claim the teacher role', gd);
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    const { error: ae } = await anon.rpc('claim_teacher_role');
    ok(!!ae, 'signed-out caller cannot claim a role');
  }
} catch (e) {
  failed++;
  console.log('  ✗ crashed:', e.message);
} finally {
  console.log('Cleanup');
  for (const u of all) {
    const { error } = await u.c.functions.invoke('delete-account', { body: {} });
    if (error) console.log('  ! could not delete a test account:', error.message);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
