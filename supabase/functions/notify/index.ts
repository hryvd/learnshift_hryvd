// Sends push notifications for family events. The caller says what happened;
// this function checks the caller is allowed to announce it, then notifies.
//   { type: 'time_request', id }      student → their guardians
//   { type: 'request_decided', id }   guardian → the student
//   { type: 'lock_changed', studentId } guardian → the student
//   { type: 'late_night', clock, minutes } student → guardians (throttled)
//   { type: 'friend_request', id }     student → addressee (respects quiet hours)
//   { type: 'friend_accepted', id }    student → requester (respects quiet hours)
//   { type: 'archipelago_invite', id } student → invitee (respects quiet hours)
//   { type: 'archipelago_accepted', archipelagoId } student → pact mates (respects quiet hours)
//   { type: 'sagwan', id }             student → recipient (respects quiet hours)
//   { type: 'chat_message', id }       student → conversation peers (throttled, respects quiet hours & chat switch)
//   { type: 'streak_at_risk', archipelagoId } student → evening reminder for mates not yet done today
import {
  admin,
  filterSocialRecipients,
  guardiansOf,
  HttpError,
  json,
  lateNightAlert,
  manilaClockMinutes,
  nameOf,
  pushTo,
  rateTake,
  requireUser,
  serve,
} from '../_shared/server.ts';

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
    case 'friend_request': {
      const { data: f } = await admin.from('friendships').select('*').eq('id', body.id).maybeSingle();
      if (!f || f.requester_id !== user.id || f.status !== 'pending') throw new HttpError(404, 'Friend request not found');
      const recipients = await filterSocialRecipients([f.addressee_id]);
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(f.addressee_id);
      const sent = await pushTo(recipients, {
        title: lang === 'fil' ? `Gusto makipagkaibigan ni ${name}` : `${name} sent a friend request`,
        body: lang === 'fil' ? 'Buksan ang Friends para tanggapin o bumuo ng Kapuluan.' : 'Open Friends to accept and start a Tulay streak.',
        data: { url: '/friends' },
      });
      return json({ sent });
    }
    case 'friend_accepted': {
      const { data: f } = await admin.from('friendships').select('*').eq('id', body.id).maybeSingle();
      if (!f || f.addressee_id !== user.id || f.status !== 'accepted') throw new HttpError(404, 'Friend not found');
      const recipients = await filterSocialRecipients([f.requester_id]);
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(f.requester_id);
      const sent = await pushTo(recipients, {
        title: lang === 'fil' ? `Magkaibigan na kayo ni ${name}!` : `You and ${name} are now friends!`,
        body: lang === 'fil' ? 'Imbitahan siya sa iyong Kapuluan.' : 'Invite them to your Kapuluan island pact.',
        data: { url: '/isla' },
      });
      return json({ sent });
    }
    case 'archipelago_invite': {
      const { data: inv } = await admin
        .from('archipelago_invites')
        .select('id, archipelago_id, inviter_id, invitee_id, status, archipelagos(name)')
        .eq('id', body.id)
        .maybeSingle();
      if (!inv || inv.inviter_id !== user.id || inv.status !== 'pending') throw new HttpError(404, 'Invite not found');
      const recipients = await filterSocialRecipients([inv.invitee_id]);
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(inv.invitee_id);
      const pactName = (inv.archipelagos as unknown as { name?: string } | null)?.name ?? 'Kapuluan';
      const sent = await pushTo(recipients, {
        title: lang === 'fil' ? `Inimbitahan ka ni ${name} sa ${pactName}` : `${name} invited you to ${pactName}`,
        body: lang === 'fil' ? 'Sumali para itayo ang inyong Tulay streak.' : 'Join to build a shared Tulay streak bridge.',
        data: { url: '/isla' },
      });
      return json({ sent });
    }
    case 'archipelago_accepted': {
      const archId = String(body.archipelagoId ?? '');
      const { data: mem } = await admin
        .from('archipelago_members')
        .select('student_id')
        .eq('archipelago_id', archId);
      const ids = (mem ?? []).map((m) => m.student_id as string);
      if (!ids.includes(user.id)) throw new HttpError(403, 'Not a member');
      const recipients = await filterSocialRecipients(ids.filter((id) => id !== user.id));
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const sent = await pushTo(recipients, {
        title: `${name} joined the Kapuluan!`,
        body: 'A new Tulay bridge just appeared across the lagoon.',
        data: { url: '/isla' },
      });
      return json({ sent });
    }
    case 'sagwan': {
      const { data: sn } = await admin.from('sagwan_nudges').select('*').eq('id', body.id).maybeSingle();
      if (!sn || sn.sender_id !== user.id) throw new HttpError(404, 'Sagwan not found');
      const recipients = await filterSocialRecipients([sn.recipient_id]);
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const { lang } = await nameOf(sn.recipient_id);
      const sent = await pushTo(recipients, {
        title: lang === 'fil' ? `Nagpadala si ${name} ng Sagwan!` : `${name} threw you a Sagwan paddle!`,
        body: `"${sn.message}"`,
        data: { url: '/isla' },
      });
      return json({ sent });
    }
    case 'chat_message': {
      const { data: msg } = await admin.from('messages').select('*').eq('id', body.id).maybeSingle();
      if (!msg || msg.sender_id !== user.id) throw new HttpError(404, 'Message not found');
      if (!(await rateTake(user.id, `chat_push_${msg.conversation_id}`, 8, 300))) return json({ sent: 0 });
      const { data: peers } = await admin
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', msg.conversation_id)
        .neq('user_id', user.id);
      const peerIds = (peers ?? []).map((p) => p.user_id as string);
      const { data: blocks } = await admin
        .from('blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
      const blockedSet = new Set(
        (blocks ?? []).map((b) => (b.blocker_id === user.id ? (b.blocked_id as string) : (b.blocker_id as string))),
      );
      const unblocked = peerIds.filter((id) => !blockedSet.has(id));
      const recipients = await filterSocialRecipients(unblocked, { requireChat: true });
      if (!recipients.length) return json({ sent: 0 });
      const { name } = await nameOf(user.id);
      const preview =
        msg.kind === 'sticker'
          ? 'Sent a Paty sticker'
          : msg.kind === 'study_invite'
            ? 'Invited you to a study break!'
            : String(msg.body).slice(0, 80);
      const sent = await pushTo(recipients, {
        title: name,
        body: preview,
        data: { url: `/chat/${msg.conversation_id}` },
      });
      return json({ sent });
    }
    case 'streak_at_risk': {
      const archId = String(body.archipelagoId ?? '');
      const clock = manilaClockMinutes();
      // Only send evening streak reminders (5 PM – 10 PM Manila time; quiet-hour check handles individual bedtimes).
      if (clock < 17 * 60) return json({ sent: 0 });
      const { data: mem } = await admin
        .from('archipelago_members')
        .select('student_id')
        .eq('archipelago_id', archId);
      const ids = (mem ?? []).map((m) => m.student_id as string);
      if (!ids.includes(user.id)) throw new HttpError(403, 'Not a member');
      if (!(await rateTake(user.id, `risk_${archId}`, 1, 12 * 3600))) return json({ sent: 0 });
      const manilaDay = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const { data: tides } = await admin
        .from('tide_daily')
        .select('student_id, goal_met')
        .in('student_id', ids)
        .eq('day', manilaDay);
      const metSet = new Set((tides ?? []).filter((t) => t.goal_met).map((t) => t.student_id as string));
      const pendingIds = ids.filter((id) => id !== user.id && !metSet.has(id));
      const recipients = await filterSocialRecipients(pendingIds);
      if (!recipients.length) return json({ sent: 0 });
      const { data: arch } = await admin.from('archipelagos').select('name, streak_days').eq('id', archId).maybeSingle();
      const pactName = arch?.name ?? 'Kapuluan';
      const sent = await pushTo(recipients, {
        title: `${pactName} · Tulay needs 1 break today`,
        body:
          (arch?.streak_days ?? 0) > 0
            ? `Finish one 45s break before midnight to keep your ${arch?.streak_days}-day bridge alive.`
            : 'Take a quick 45s break to add today’s plank to the bridge.',
        data: { url: '/isla' },
      });
      return json({ sent });
    }
    default:
      throw new HttpError(400, 'Unknown notification');
  }
});
