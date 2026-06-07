import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import pool from '../config/db';
import { v4 as uuidv4 } from 'uuid';

export const inviteMember = async (req: AuthenticatedRequest, res: Response) => {
  const { email, role = 'Member' } = req.body;
  const userId = req.user?.id;
  const workspaceId = req.user?.workspaceId;

  try {
    // 1. Get organization ID for current user
    const memberCheck = await pool.query(
      'SELECT organization_id, role FROM members WHERE user_id = $1 AND workspace_id = $2',
      [userId, workspaceId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    const { organization_id: orgId, role: userRole } = memberCheck.rows[0];

    if (userRole !== 'Owner' && userRole !== 'Admin') {
      return res.status(403).json({ error: 'Only Owners and Admins can invite users' });
    }

    // 2. Generate token and save invitation
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // Valid for 48 hours

    await pool.query(
      `INSERT INTO invitations (organization_id, email, role, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgId, email, role, token, expiresAt]
    );

    // In production, we'd send an email here. For now, return the token for testing.
    return res.json({
      message: 'Invitation generated successfully',
      invitationLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${token}`,
      token
    });
  } catch (error) {
    console.error('Invite member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvitation = async (req: AuthenticatedRequest, res: Response) => {
  const { token } = req.body;
  const userId = req.user?.id;

  try {
    // 1. Find and validate invitation
    const inviteRes = await pool.query(
      'SELECT * FROM invitations WHERE token = $1 AND status = $2',
      [token, 'Pending']
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or already accepted invitation' });
    }

    const invitation = inviteRes.rows[0];

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    // 2. Check default workspace of the organization
    const workspaceRes = await pool.query(
      'SELECT id FROM workspaces WHERE organization_id = $1 LIMIT 1',
      [invitation.organization_id]
    );

    const workspaceId = workspaceRes.rows[0]?.id;

    // 3. Add to members list
    await pool.query(
      `INSERT INTO members (user_id, organization_id, workspace_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, organization_id, workspace_id) 
       DO UPDATE SET role = EXCLUDED.role`,
      [userId, invitation.organization_id, workspaceId, invitation.role]
    );

    // Update invitation status
    await pool.query('UPDATE invitations SET status = $1 WHERE id = $2', ['Accepted', invitation.id]);

    return res.json({ message: 'Invitation accepted successfully, welcome to the organization!' });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkspaces = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const query = `
      SELECT w.id, w.name, o.name as org_name, m.role
      FROM members m
      JOIN workspaces w ON m.workspace_id = w.id
      JOIN organizations o ON w.organization_id = o.id
      WHERE m.user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    return res.json({ workspaces: result.rows });
  } catch (error) {
    console.error('Get workspaces error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createWorkspace = async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  const userId = req.user?.id;
  const currentWorkspaceId = req.user?.workspaceId;

  try {
    // Fetch org ID
    const memberCheck = await pool.query(
      'SELECT organization_id, role FROM members WHERE user_id = $1 AND workspace_id = $2',
      [userId, currentWorkspaceId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized workspace creation' });
    }

    const { organization_id: orgId, role } = memberCheck.rows[0];

    if (role !== 'Owner' && role !== 'Admin') {
      return res.status(403).json({ error: 'Only Owners/Admins can create workspaces' });
    }

    const wsResult = await pool.query(
      'INSERT INTO workspaces (name, organization_id) VALUES ($1, $2) RETURNING *',
      [name, orgId]
    );
    const workspace = wsResult.rows[0];

    // Assign owner/creator to new workspace
    await pool.query(
      'INSERT INTO members (user_id, organization_id, workspace_id, role) VALUES ($1, $2, $3, $4)',
      [userId, orgId, workspace.id, role]
    );

    return res.status(201).json({ workspace });
  } catch (error) {
    console.error('Create workspace error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
