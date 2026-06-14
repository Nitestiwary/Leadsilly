import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    planType: string;
    workspaceId?: string;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Bypass signature check for local mock test tokens
  if (token.startsWith('mock_') || token === 'mock_token') {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'niteshkumar@leadsilly.com',
      name: 'Nitesh Kumar',
      planType: 'Free',
    };
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'leadsilly_secret_key_123', (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      planType: decoded.planType || 'Free',
      workspaceId: decoded.workspaceId
    };
    next();
  });
};
