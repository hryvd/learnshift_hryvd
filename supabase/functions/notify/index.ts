// Sends push notifications for family events. The caller says what happened;
// this function checks the caller is allowed to announce it, then notifies.
//   { type: 'time_request', id }      student → their guardians
//   { type: 'request_decided', id }   guardian → the student
//   { type: 'lock_changed', studentId } guardian → the student
//   { type: 'late_night', clock, minutes } student → guardians (throttled)
import { admin, guardiansOf, HttpError, json, lateNightAlert, nameOf, pushTo, rateTake, requireUser, serve } from '../_shared/server.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  if (!(await rateTake(user.id, 'notify', 60, 3600))) throw new HttpError(429, 'Too many notifications');

  switch (body.type) {
    case 'time_request': {
      const { data: r } = await admin.from('time_requests').select('*').eq('id', body.id).maybeSingle();
      if (!r || r.student_id !== user.id) throw new HttpError(404, 'Request not found');
      const { name } = await nameOf(user.id);
      const sent = await pushTo(await guardiansOf(user.id), {
        title: `${name} asked for ${r.minutes} more minutes`,
        body: 'Open LearnShift to approve or decline.',
        data: { url: '/guardian', requestId: r.id },
      });
      return json({ sent });
    }
    case 'request_decided': {
      const { data: r } = await admin.from('time_requests').select('*').eq('id', body.id).maybeSingle();
      if (!r || r.decided_by !== user.id) throw new HttpError(404, 'Request not found');
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(r.student_id);
      const approved = r.status === 'approved';
      const sent = await pushTo([r.student_id], {
        title: approved
          ? lang === 'fil'
            ? `Pumayag si ${name}: ${r.minutes} minuto pa`
            : `${name} said yes: ${r.minutes} more minutes`
          : lang === 'fil'
            ? `Hindi muna ngayon, sabi ni ${name}`
            : `${name} said not tonight`,
        body: approved
          ? lang === 'fil'
            ? 'Bukas na ang phone mo.'
            : 'Your phone is unlocked.'
          : lang === 'fil'
            ? 'Pahinga muna. Bukas ulit.'
            : 'Time to rest. See you tomorrow.',
        data: { url: '/lock' },
      });
      return json({ sent });
    }
    case 'lock_changed': {
      const studentId = String(body.studentId ?? '');
      const { data: link } = await admin
        .from('guardian_links')
        .select('student_id')
        .eq('guardian_id', user.id)
        .eq('student_id', studentId)
        .maybeSingle();
      if (!link) throw new HttpError(404, 'Student not found');
      const { data: c } = await admin.from('guardian_controls').select('lock_enabled, lock_now').eq('student_id', studentId).maybeSingle();
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(studentId);
      const lockedNow = !!c?.lock_now;
      const on = !!c?.lock_enabled || lockedNow;
      const sent = await pushTo([studentId], {
        title: lockedNow
          ? lang === 'fil'
            ? `Naka-total lockdown mula kay ${name}`
            : `${name} turned on total lockdown`
          : on
            ? lang === 'fil'
              ? `Binuksan ni ${name} ang night lock`
              : `${name} turned on the night lock`
            : lang === 'fil'
              ? `Pinatay ni ${name} ang lock`
              : `${name} turned off the lock`,
        body: lockedNow
          ? lang === 'fil'
            ? 'Naka-lock ang phone hanggang i-unlock ito ng guardian mo. Emergency call lang ang puwede.'
            : 'Apps and navigation are locked offline until your guardian turns it off. Emergency calls always work.'
          : on
            ? lang === 'fil'
              ? 'Matutulog ang mga app sa oras ng tulog. Laging bukas ang emergency call.'
              : 'Apps rest during bedtime. Emergency calls always work.'
            : lang === 'fil'
              ? 'Naka-off ang lock.'
              : 'No lock right now.',
        data: { url: lockedNow ? '/lock' : '/home' },
      });
      return json({ sent });
    }
    case 'account_request': {
      const { data: r } = await admin.from('account_requests').select('*').eq('id', body.id).maybeSingle();
      if (!r || r.student_id !== user.id) throw new HttpError(404, 'Request not found');
      const { name } = await nameOf(user.id);
      const isDelete = r.kind === 'delete_account';
      const sent = await pushTo(await guardiansOf(user.id), {
        title: isDelete ? `${name} requested to remove their account` : `${name} requested to sign out`,
        body: 'Open LearnShift to approve or decline.',
        data: { url: '/guardian', accountRequestId: r.id },
      });
      return json({ sent });
    }
    case 'account_request_decided': {
      const { data: r } = await admin.from('account_requests').select('*').eq('id', body.id).maybeSingle();
      if (!r || r.decided_by !== user.id) throw new HttpError(404, 'Request not found');
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(r.student_id);
      const approved = r.status === 'approved';
      const isDelete = r.kind === 'delete_account';
      const sent = await pushTo([r.student_id], {
        title: approved
          ? lang === 'fil'
            ? isDelete
              ? `Pinayagan ni ${name} ang pagbura ng account`
              : `Pinayagan ni ${name} ang pag-sign out`
            : isDelete
              ? `${name} approved removing your account`
              : `${name} approved signing out`
          : lang === 'fil'
            ? isDelete
              ? `Hindi pinayagan ni ${name} ang pagbura ng account`
              : `Hindi pinayagan ni ${name} ang pag-sign out`
            : isDelete
              ? `${name} declined the remove-account request`
              : `${name} declined the sign-out request`,
        body: approved
          ? lang === 'fil'
            ? 'Buksan ang LearnShift para magpatuloy.'
            : 'Open LearnShift to continue.'
          : lang === 'fil'
            ? 'Mananatiling naka-sign in ang account mo.'
            : 'Your account remains signed in.',
        data: { url: '/account' },
      });
      return json({ sent });
    }
    case 'late_night': {
      const clock = Math.max(0, Math.min(1439, Number(body.clock) || 0));
      const minutes = Math.max(0, Math.min(600, Number(body.minutes) || 0));
      return json({ sent: await lateNightAlert(user.id, clock, minutes) });
    }
    default:
      throw new HttpError(400, 'Unknown notification');
  }
});
