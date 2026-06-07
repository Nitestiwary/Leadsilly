import { Request, Response } from 'express';
import pool from '../config/db';

export const getAdminMetrics = async (req: Request, res: Response) => {
  try {
    // 1. Total users & Active users (logged activity in last 30 days)
    const usersCountRes = await pool.query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(usersCountRes.rows[0].count);

    const activeUsersRes = await pool.query(
      `SELECT COUNT(DISTINCT user_id) FROM usage WHERE date >= CURRENT_DATE - INTERVAL '30 days'`
    );
    const activeUsers = parseInt(activeUsersRes.rows[0].count);

    // 2. MRR / ARR Calculations
    // Subscriptions have plan_type ('Free', 'Individual', 'Team', 'Agency')
    // Free = 0, Individual = 4, Team = 15, Agency = 49 (USD values)
    const subPlanPricesRes = await pool.query(
      `SELECT plan_type, COUNT(*) as count 
       FROM subscriptions 
       WHERE status = 'active'
       GROUP BY plan_type`
    );

    let mrr = 0;
    subPlanPricesRes.rows.forEach(row => {
      const count = parseInt(row.count);
      if (row.plan_type === 'Individual') mrr += count * 4;
      if (row.plan_type === 'Team') mrr += count * 15;
      if (row.plan_type === 'Agency') mrr += count * 49;
    });

    const arr = mrr * 12;

    // 3. Lead stats
    const leadsRes = await pool.query('SELECT COUNT(*) FROM leads');
    const totalLeads = parseInt(leadsRes.rows[0].count);

    // 4. Top Customers by lead count
    const topCustomersRes = await pool.query(
      `SELECT u.name, u.email, COUNT(l.id) as lead_count, s.plan_type
       FROM users u
       JOIN leads l ON l.extracted_by_id = u.id
       LEFT JOIN subscriptions s ON s.user_id = u.id
       GROUP BY u.name, u.email, s.plan_type
       ORDER BY lead_count DESC LIMIT 10`
    );

    return res.json({
      totalUsers,
      activeUsers,
      mrr,
      arr,
      totalLeads,
      topCustomers: topCustomersRes.rows
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return res.status(500).json({ error: 'Failed to retrieve admin dashboard metrics' });
  }
};
