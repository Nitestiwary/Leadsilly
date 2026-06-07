import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import pool from '../config/db';

// Help helper to check extraction limit based on plan
const PLAN_LIMITS = {
  Free: 50,
  Individual: 500,
  Team: 2500,
  Agency: 10000
};

export const createLead = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const planType = (req.user?.planType || 'Free') as keyof typeof PLAN_LIMITS;
  const workspaceId = req.user?.workspaceId;
  const {
    name, businessName, email, phone, website, address,
    linkedinUrl, facebookUrl, instagramUrl, twitterUrl,
    sourceUrl, sourceDomain, sourceType, screenshotUrl,
    status, tags, notes, sessionId, duplicateOption
  } = req.body;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace context missing from request' });
  }

  try {
    // 1. Enforce usage limits
    const today = new Date().toISOString().split('T')[0];
    let usageResult = await pool.query('SELECT count FROM usage WHERE user_id = $1 AND date = $2', [userId, today]);
    let currentUsageCount = usageResult.rows[0]?.count || 0;
    const allowedLimit = PLAN_LIMITS[planType] || 50;

    if (currentUsageCount >= allowedLimit) {
      return res.status(429).json({ error: `Daily lead extraction limit of ${allowedLimit} reached for your ${planType} plan.` });
    }

    // 2. Duplicate Check Strategy: Skip, Update, Merge
    // We check matches on Email, Phone, Website or Source URL in the same workspace
    let duplicateQuery = `
      SELECT * FROM leads 
      WHERE workspace_id = $1 AND (
        (email IS NOT NULL AND email = $2) OR 
        (phone IS NOT NULL AND phone = $3) OR 
        (website IS NOT NULL AND website = $4) OR 
        (source_url IS NOT NULL AND source_url = $5)
      ) LIMIT 1
    `;
    const checkResult = await pool.query(duplicateQuery, [workspaceId, email || null, phone || null, website || null, sourceUrl || null]);
    const existingLead = checkResult.rows[0];

    let finalLead;

    if (existingLead) {
      const option = duplicateOption || 'Skip'; // Skip, Update, Merge

      if (option === 'Skip') {
        return res.json({ lead: existingLead, status: 'skipped', message: 'Lead already exists. Skipped insertion.' });
      }

      if (option === 'Update') {
        // Overwrite fields
        const updateQuery = `
          UPDATE leads SET
            name = COALESCE($1, name),
            business_name = COALESCE($2, business_name),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            website = COALESCE($5, website),
            address = COALESCE($6, address),
            linkedin_url = COALESCE($7, linkedin_url),
            facebook_url = COALESCE($8, facebook_url),
            instagram_url = COALESCE($9, instagram_url),
            twitter_url = COALESCE($10, twitter_url),
            status = COALESCE($11, status),
            tags = $12,
            notes = COALESCE($13, notes),
            screenshot_url = COALESCE($14, screenshot_url),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $15 RETURNING *
        `;
        const updateRes = await pool.query(updateQuery, [
          name, businessName, email, phone, website, address,
          linkedinUrl, facebookUrl, instagramUrl, twitterUrl,
          status || existingLead.status, tags || existingLead.tags, notes, screenshotUrl,
          existingLead.id
        ]);
        finalLead = updateRes.rows[0];

        // Logging activity
        await pool.query(
          'INSERT INTO lead_activity_logs (lead_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
          [finalLead.id, userId, 'Lead Updated', 'Lead updated due to duplicate overwrite policy.']
        );
      } else if (option === 'Merge') {
        // Only merge empty fields
        const mergeQuery = `
          UPDATE leads SET
            name = COALESCE(name, $1),
            business_name = COALESCE(business_name, $2),
            email = COALESCE(email, $3),
            phone = COALESCE(phone, $4),
            website = COALESCE(website, $5),
            address = COALESCE(address, $6),
            linkedin_url = COALESCE(linkedin_url, $7),
            facebook_url = COALESCE(facebook_url, $8),
            instagram_url = COALESCE(instagram_url, $9),
            twitter_url = COALESCE(twitter_url, $10),
            tags = ARRAY(SELECT DISTINCT unnest(array_cat(tags, $11))),
            notes = CASE 
              WHEN notes IS NULL THEN $12 
              WHEN $12 IS NULL THEN notes 
              ELSE notes || '\nMerged notes: ' || $12 
            END,
            screenshot_url = COALESCE(screenshot_url, $13),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $14 RETURNING *
        `;
        const mergeRes = await pool.query(mergeQuery, [
          name, businessName, email, phone, website, address,
          linkedinUrl, facebookUrl, instagramUrl, twitterUrl,
          tags || [], notes || null, screenshotUrl,
          existingLead.id
        ]);
        finalLead = mergeRes.rows[0];

        // Logging activity
        await pool.query(
          'INSERT INTO lead_activity_logs (lead_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
          [finalLead.id, userId, 'Lead Merged', 'Lead merged values due to duplicate merge policy.']
        );
      }
    } else {
      // 3. Insert new Lead
      const insertQuery = `
        INSERT INTO leads (
          workspace_id, name, business_name, email, phone, website, address,
          linkedin_url, facebook_url, instagram_url, twitter_url,
          source_url, source_domain, source_type, extracted_by_id,
          plan_type, session_id, status, tags, notes, screenshot_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *
      `;
      const insertRes = await pool.query(insertQuery, [
        workspaceId, name, businessName, email, phone, website, address,
        linkedinUrl, facebookUrl, instagramUrl, twitterUrl,
        sourceUrl, sourceDomain, sourceType, userId,
        planType, sessionId, status || 'New', tags || [], notes || '', screenshotUrl
      ]);
      finalLead = insertRes.rows[0];

      // Logging activity
      await pool.query(
        'INSERT INTO lead_activity_logs (lead_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [finalLead.id, userId, 'Lead Created', 'Lead extracted and saved successfully.']
      );

      // Increment Usage Counter
      if (usageResult.rows.length > 0) {
        await pool.query('UPDATE usage SET count = count + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND date = $2', [userId, today]);
      } else {
        await pool.query('INSERT INTO usage (user_id, workspace_id, date, count) VALUES ($1, $2, $3, 1)', [userId, workspaceId, today]);
      }
    }

    return res.status(201).json({ lead: finalLead, status: 'created' });
  } catch (error) {
    console.error('Create lead error:', error);
    return res.status(500).json({ error: 'Internal server error during lead creation' });
  }
};

export const getLeads = async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.user?.workspaceId;
  const { search, tag, status, limit = 100, offset = 0 } = req.query;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace context missing' });
  }

  try {
    let query = 'SELECT * FROM leads WHERE workspace_id = $1';
    const params: any[] = [workspaceId];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR business_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length} OR source_domain ILIKE $${params.length})`;
    }

    if (tag) {
      params.push(tag);
      query += ` AND $${params.length} = ANY(tags)`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);
    return res.json({ leads: result.rows });
  } catch (error) {
    console.error('Get leads error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLead = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { name, businessName, email, phone, website, address, tags, status, notes } = req.body;

  try {
    const query = `
      UPDATE leads SET 
        name = COALESCE($1, name),
        business_name = COALESCE($2, business_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        website = COALESCE($5, website),
        address = COALESCE($6, address),
        tags = COALESCE($7, tags),
        status = COALESCE($8, status),
        notes = COALESCE($9, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 RETURNING *
    `;
    const result = await pool.query(query, [name, businessName, email, phone, website, address, tags, status, notes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await pool.query(
      'INSERT INTO lead_activity_logs (lead_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [id, userId, 'Lead Updated', 'Manually updated lead details.']
    );

    return res.json({ lead: result.rows[0] });
  } catch (error) {
    console.error('Update lead error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteLead = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM leads WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    return res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
