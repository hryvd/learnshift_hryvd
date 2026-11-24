// Deletes an account and, through cascades, all of its data:
// profile, links, classes, answers, usage, nudges and tokens.
// Linked students require an approved guardian request (or guardian approval directly).
import { admin, HttpError, json, requireUser, serve } from '../_shared/server.ts';

serve(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';

  if (requestId) {
    const { data: reqRow } = await admin
      .from('account_requests')
      .select('id, student_id, kind, status')
      .eq('id', requestId)
      .maybeSingle();
    if (!reqRow || reqRow.kind !== 'delete_account' || (reqRow.status !== 'pending' && reqRow.status !== 'approved')) {
      throw new HttpError(404, 'Remove-account request not found');
    }
    const { data: link } = await admin
      .from('guardian_links')
      .select('student_id')
      .eq('guardian_id', user.id)
      .eq('student_id', reqRow.student_id)
      .maybeSingle();
    if (!link) throw new HttpError(403, 'Not authorized to remove this student account');

    await admin
      .from('account_requests')
      .update({ status: 'completed', decided_at: new Date().toISOString(), decided_by: user.id })
      .eq('id', requestId);

    const { error } = await admin.auth.admin.deleteUser(reqRow.student_id);
    if (error) throw error;
    return json({ deleted: true, studentId: reqRow.student_id });
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'student') {
    const { data: links } = await admin.from('guardian_links').select('guardian_id').eq('student_id', user.id).limit(1);
    if ((links?.length ?? 0) > 0) {
      const { data: approved } = await admin
        .from('account_requests')
        .select('id')
        .eq('student_id', user.id)
        .eq('kind', 'delete_account')
        .eq('status', 'approved')
        .limit(1);
      if (!approved?.length) {
        throw new HttpError(403, 'Ask your guardian to approve removing your account first.');
      }
    }
  }

  // End every session first: deleting a user does not revoke live tokens.
  await admin.auth.admin.signOut(req.headers.get('authorization')!.replace(/^Bearer\s+/i, ''), 'global').catch(() => {});
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
});
