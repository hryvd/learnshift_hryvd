// Generates a short-lived (10-minute) signed URL for an uploaded module source.
// Authorized for:
// - The owning teacher (via sourceId, draftId, or moduleId)
// - An enrolled student when reading via moduleId and the module is published with share_source=true.
import { admin, HttpError, json, requireUser, serve } from '../_shared/server.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const moduleId = typeof body.moduleId === 'string' && UUID_RE.test(body.moduleId) ? body.moduleId : null;
  const draftId = typeof body.draftId === 'string' && UUID_RE.test(body.draftId) ? body.draftId : null;
  const sourceId = typeof body.sourceId === 'string' && UUID_RE.test(body.sourceId) ? body.sourceId : null;

  let resolvedSourceId: string | null = null;

  if (moduleId) {
    const { data: mod, error } = await admin
      .from('class_modules')
      .select('id, class_id, teacher_id, published, share_source, source_id')
      .eq('id', moduleId)
      .maybeSingle();
    if (error || !mod) throw new HttpError(404, 'Module not found');
    if (!mod.source_id) throw new HttpError(404, 'No original file attached');

    if (mod.teacher_id === user.id) {
      resolvedSourceId = mod.source_id as string;
    } else if (mod.published && mod.share_source) {
      const { data: mem } = await admin
        .from('class_members')
        .select('student_id')
        .eq('class_id', mod.class_id)
        .eq('student_id', user.id)
        .maybeSingle();
      if (!mem) throw new HttpError(403, 'Not authorized');
      resolvedSourceId = mod.source_id as string;
    } else {
      throw new HttpError(403, 'Not authorized');
    }
  } else if (draftId) {
    const { data: draft, error } = await admin
      .from('quiz_drafts')
      .select('id, teacher_id, source_id')
      .eq('id', draftId)
      .maybeSingle();
    if (error || !draft) throw new HttpError(404, 'Draft not found');
    if (draft.teacher_id !== user.id) throw new HttpError(403, 'Not authorized');
    if (!draft.source_id) throw new HttpError(404, 'No original file attached');
    resolvedSourceId = draft.source_id as string;
  } else if (sourceId) {
    const { data: src, error } = await admin
      .from('module_sources')
      .select('id, teacher_id')
      .eq('id', sourceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !src) throw new HttpError(404, 'Source not found');
    if (src.teacher_id !== user.id) throw new HttpError(403, 'Not authorized');
    resolvedSourceId = src.id as string;
  } else {
    throw new HttpError(400, 'Provide moduleId, draftId, or sourceId');
  }

  const { data: src, error: srcErr } = await admin
    .from('module_sources')
    .select('storage_path, file_name, mime, size_bytes, sha256')
    .eq('id', resolvedSourceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (srcErr || !src) throw new HttpError(404, 'Original file not found');

  const { data: signed, error: signErr } = await admin.storage
    .from('module-sources')
    .createSignedUrl(src.storage_path, 600);
  if (signErr || !signed?.signedUrl) throw new HttpError(500, 'Could not sign file URL');

  return json({
    url: signed.signedUrl,
    expiresIn: 600,
    fileName: src.file_name,
    mime: src.mime,
    sizeBytes: src.size_bytes,
    sha256: src.sha256,
  });
});
