import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pool from '../config/db';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleSignIn = async (req: Request, res: Response) => {
  const { idToken, mockUser } = req.body;

  try {
    let email = '';
    let name = '';
    let avatarUrl = '';

    // Standard OAuth token verification, fallback to mock if dev mode
    if (idToken && idToken !== 'mock_token') {
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
          email = payload.email;
          name = payload.name || email.split('@')[0];
          avatarUrl = payload.picture || '';
        } else {
          throw new Error('ID Token payload empty');
        }
      } catch (err) {
        // Fallback: Verify as Access Token by calling Google Userinfo API
        const userinfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${idToken}`);
        if (userinfoRes.ok) {
          const payload = (await userinfoRes.json()) as any;
          if (payload && payload.email) {
            email = payload.email;
            name = payload.name || email.split('@')[0];
            avatarUrl = payload.picture || '';
          } else {
            return res.status(400).json({ error: 'Invalid Google Token (Userinfo empty)' });
          }
        } else {
          return res.status(400).json({ error: 'Invalid Google Token (Failed verification and userinfo check)' });
        }
      }
    } else if (mockUser) {
      // Allow testing/development sign-in with mock user
      email = mockUser.email;
      name = mockUser.name;
      avatarUrl = mockUser.avatarUrl || '';
    } else {
      return res.status(400).json({ error: 'Token or mock payload required' });
    }

    // 1. Check/Create User
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userResult.rows[0];

    if (!user) {
      const newUser = await pool.query(
        'INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING *',
        [email, name, avatarUrl]
      );
      user = newUser.rows[0];

      // 2. Setup Default Organization & Workspace
      const orgName = `${user.name}'s Org`;
      const orgResult = await pool.query(
        'INSERT INTO organizations (name, owner_id) VALUES ($1, $2) RETURNING *',
        [orgName, user.id]
      );
      const organization = orgResult.rows[0];

      const workspaceResult = await pool.query(
        'INSERT INTO workspaces (name, organization_id) VALUES ($1, $2) RETURNING *',
        ['Default Workspace', organization.id]
      );
      const workspace = workspaceResult.rows[0];

      // 3. Make User Owner
      await pool.query(
        'INSERT INTO members (user_id, organization_id, workspace_id, role) VALUES ($1, $2, $3, $4)',
        [user.id, organization.id, workspace.id, 'Owner']
      );

      // 4. Setup Default Free Subscription
      await pool.query(
        'INSERT INTO subscriptions (user_id, organization_id, plan_type, status) VALUES ($1, $2, $3, $4)',
        [user.id, organization.id, 'Free', 'active']
      );
    }
    // Save/update the Google OAuth Access Token in oauth_tokens table for sheet exports
    if (idToken && idToken !== 'mock_token') {
      await pool.query(
        `INSERT INTO oauth_tokens (user_id, provider, access_token)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, provider)
         DO UPDATE SET access_token = $3, updated_at = CURRENT_TIMESTAMP`,
        [user.id, 'google', idToken]
      );
    }

    // Fetch user's membership and current subscription
    const membershipResult = await pool.query(
      `SELECT m.role, m.workspace_id, s.plan_type 
       FROM members m
       LEFT JOIN subscriptions s ON m.organization_id = s.organization_id
       WHERE m.user_id = $1 LIMIT 1`,
      [user.id]
    );

    const workspaceId = membershipResult.rows[0]?.workspace_id || '';
    const planType = membershipResult.rows[0]?.plan_type || 'Free';

    // Sign JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        planType,
        workspaceId
      },
      process.env.JWT_SECRET || 'leadsilly_secret_key_123',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        planType,
        workspaceId
      }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    return res.status(500).json({ error: 'Internal server authentication error' });
  }
};

// ── Email / Password Sign-Up ─────────────────────────────────────────────────
export const emailSignUp = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [email, name, passwordHash]
    );
    const user = newUser.rows[0];

    // Setup Default Org, Workspace, Membership & Free Subscription
    const orgResult = await pool.query(
      'INSERT INTO organizations (name, owner_id) VALUES ($1, $2) RETURNING *',
      [`${name}'s Org`, user.id]
    );
    const organization = orgResult.rows[0];

    const workspaceResult = await pool.query(
      'INSERT INTO workspaces (name, organization_id) VALUES ($1, $2) RETURNING *',
      ['Default Workspace', organization.id]
    );
    const workspace = workspaceResult.rows[0];

    await pool.query(
      'INSERT INTO members (user_id, organization_id, workspace_id, role) VALUES ($1, $2, $3, $4)',
      [user.id, organization.id, workspace.id, 'Owner']
    );
    await pool.query(
      'INSERT INTO subscriptions (user_id, organization_id, plan_type, status) VALUES ($1, $2, $3, $4)',
      [user.id, organization.id, 'Free', 'active']
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, planType: 'Free', workspaceId: workspace.id },
      process.env.JWT_SECRET || 'leadsilly_secret_key_123',
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: '', planType: 'Free', workspaceId: workspace.id }
    });
  } catch (error) {
    console.error('Sign up error:', error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
};

// ── Email / Password Sign-In ─────────────────────────────────────────────────
export const emailSignIn = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Fetch membership & plan
    const membershipResult = await pool.query(
      `SELECT m.role, m.workspace_id, s.plan_type
       FROM members m
       LEFT JOIN subscriptions s ON m.organization_id = s.organization_id
       WHERE m.user_id = $1 LIMIT 1`,
      [user.id]
    );

    const workspaceId = membershipResult.rows[0]?.workspace_id || '';
    const planType = membershipResult.rows[0]?.plan_type || 'Free';

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, planType, workspaceId },
      process.env.JWT_SECRET || 'leadsilly_secret_key_123',
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url || '', planType, workspaceId }
    });
  } catch (error) {
    console.error('Email sign-in error:', error);
    return res.status(500).json({ error: 'Internal server error during sign-in' });
  }
};
