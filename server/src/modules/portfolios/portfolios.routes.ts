import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// GET /api/portfolios
router.get('/', authMiddleware, async (req: any, res: any) => {
  const isDeleted = req.query.deleted === 'true';
  let query = req.supabase
    .from('portfolios')
    .select('*')
    .order('created_at', { ascending: false });

  if (isDeleted) {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/portfolios
router.post('/', authMiddleware, async (req: any, res: any) => {
  const { name } = req.body;
  const { data, error } = await req.supabase
    .from('portfolios')
    .insert([{ name, user_id: req.user.id }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/portfolios/:id
router.put('/:id', authMiddleware, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, deleted_at, auto_sync_corporate_actions } = req.body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (deleted_at !== undefined) updateData.deleted_at = deleted_at;
  if (auto_sync_corporate_actions !== undefined) updateData.auto_sync_corporate_actions = auto_sync_corporate_actions;

  const { data, error } = await req.supabase
    .from('portfolios')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/portfolios/:id
router.delete('/:id', authMiddleware, async (req: any, res: any) => {
  const { id } = req.params;
  const isPermanent = req.query.permanent === 'true';

  if (isPermanent) {
    const { error } = await req.supabase
      .from('portfolios')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await req.supabase
      .from('portfolios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

// POST /api/portfolios/:id/restore
router.post('/:id/restore', authMiddleware, async (req: any, res: any) => {
  const { id } = req.params;
  const { error } = await req.supabase
    .from('portfolios')
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
