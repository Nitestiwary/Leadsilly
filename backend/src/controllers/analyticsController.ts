import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import pool from '../config/db';

export const getTeamDashboardAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.user?.workspaceId;

  try {
    // 1. Total leads count
    const totalLeadsRes = await pool.query('SELECT COUNT(*) FROM leads WHERE workspace_id = $1', [workspaceId]);
    const totalLeads = parseInt(totalLeadsRes.rows[0].count);

    // 2. Leads by Date (last 30 days)
    const leadsByDateRes = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM leads 
       WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [workspaceId]
    );

    // 3. Top Domains
    const topDomainsRes = await pool.query(
      `SELECT source_domain, COUNT(*) as count 
       FROM leads 
       WHERE workspace_id = $1 AND source_domain IS NOT NULL 
       GROUP BY source_domain 
       ORDER BY count DESC LIMIT 5`,
      [workspaceId]
    );

    // 4. Top team members (leads extracted by each member)
    const topMembersRes = await pool.query(
      `SELECT u.name, COUNT(l.id) as count
       FROM leads l
       JOIN users u ON l.extracted_by_id = u.id
       WHERE l.workspace_id = $1
       GROUP BY u.name
       ORDER BY count DESC LIMIT 5`,
      [workspaceId]
    );

    // 5. Total Exports
    const exportsRes = await pool.query(
      'SELECT COUNT(*) FROM exports WHERE workspace_id = $1',
      [workspaceId]
    );
    const totalExports = parseInt(exportsRes.rows[0].count);

    // 6. Current Day's Usage for Credits calculation
    const today = new Date().toISOString().split('T')[0];
    const dailyUsageRes = await pool.query(
      'SELECT count FROM usage WHERE user_id = $1 AND date = $2',
      [req.user?.id, today]
    );
    const dailyUsage = parseInt(dailyUsageRes.rows[0]?.count || 0);

    return res.json({
      totalLeads,
      leadsByDate: leadsByDateRes.rows,
      topDomains: topDomainsRes.rows,
      topMembers: topMembersRes.rows,
      totalExports,
      dailyUsage
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return res.status(500).json({ error: 'Failed to retrieve analytics data' });
  }
};
