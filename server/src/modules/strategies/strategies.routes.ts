import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

function formatStrategy(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    name: row.name || 'Untitled Strategy',
    scope: row.scope || 'global',
    targetSymbol: row.target_symbol || 'ALL',
    action: row.action || 'BUY',
    sizingType: row.sizing_type || 'QTY',
    sizingValue: row.sizing_value !== null && row.sizing_value !== undefined ? Number(row.sizing_value) : '',
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    enabled: row.enabled ?? true,
    frequency: row.frequency || 'daily',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/strategies
router.get('/', authMiddleware, async (req: any, res: any) => {
  try {
    const { portfolio_id } = req.query;
    let query = req.supabase
      .from('portfolio_strategies')
      .select('*')
      .order('created_at', { ascending: false });

    if (portfolio_id) {
      query = query.or(`portfolio_id.eq.${portfolio_id},portfolio_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01') {
        return res.status(200).json([]);
      }
      return res.status(500).json({ error: error.message });
    }
    res.json((data || []).map(formatStrategy));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/strategies
router.post('/', authMiddleware, async (req: any, res: any) => {
  try {
    const { name, scope, targetSymbol, action, sizingType, sizingValue, conditions, enabled, frequency, portfolioId } = req.body;
    const { data, error } = await req.supabase
      .from('portfolio_strategies')
      .insert([{
        user_id: req.user.id,
        portfolio_id: portfolioId || null,
        name: (name || '').trim() || 'Untitled Strategy',
        scope: scope || 'global',
        target_symbol: targetSymbol || 'ALL',
        action: action || 'BUY',
        sizing_type: sizingType || 'QTY',
        sizing_value: sizingValue !== '' && sizingValue !== null && sizingValue !== undefined ? Number(sizingValue) : null,
        conditions: Array.isArray(conditions) ? conditions : [],
        enabled: enabled ?? true,
        frequency: frequency || 'daily'
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(formatStrategy(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/strategies/:id
router.put('/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updatePayload: Record<string, any> = {};

    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.scope !== undefined) updatePayload.scope = body.scope;
    if (body.targetSymbol !== undefined) updatePayload.target_symbol = body.targetSymbol;
    if (body.action !== undefined) updatePayload.action = body.action;
    if (body.sizingType !== undefined) updatePayload.sizing_type = body.sizingType;
    if (body.sizingValue !== undefined) {
      updatePayload.sizing_value = body.sizingValue !== '' && body.sizingValue !== null && body.sizingValue !== undefined ? Number(body.sizingValue) : null;
    }
    if (body.conditions !== undefined) updatePayload.conditions = body.conditions;
    if (body.enabled !== undefined) updatePayload.enabled = body.enabled;
    if (body.frequency !== undefined) updatePayload.frequency = body.frequency;

    const { data, error } = await req.supabase
      .from('portfolio_strategies')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(formatStrategy(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/strategies/:id
router.delete('/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { error } = await req.supabase.from('portfolio_strategies').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
