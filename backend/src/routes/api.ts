import { Router } from 'express';
import { googleSignIn, emailSignIn, emailSignUp, sendOTP, verifyOTPAndRegister } from '../controllers/authController';
import { createLead, getLeads, updateLead, deleteLead } from '../controllers/leadsController';
import { inviteMember, acceptInvitation, getWorkspaces, createWorkspace } from '../controllers/teamController';
import { createCheckoutSession, handleRazorpayVerification } from '../controllers/billingController';
import { exportCSV, exportXLSX, exportPDF, exportGoogleSheets } from '../controllers/exportController';
import { getTeamDashboardAnalytics } from '../controllers/analyticsController';
import { getAdminMetrics } from '../controllers/adminController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Authentication
router.post('/auth/google', googleSignIn);
router.post('/auth/login', emailSignIn);
router.post('/auth/register', emailSignUp);           // Legacy (verifyOTPAndRegister alias)
router.post('/auth/send-otp', sendOTP);               // Step 1: send OTP to email
router.post('/auth/verify-otp', verifyOTPAndRegister); // Step 2: verify OTP, create account


// Leads Operations (Authenticated)
router.get('/leads', authenticateToken, getLeads);
router.post('/leads', authenticateToken, createLead);
router.put('/leads/:id', authenticateToken, updateLead);
router.delete('/leads/:id', authenticateToken, deleteLead);

// Team & Collaboration (Authenticated)
router.post('/team/invite', authenticateToken, inviteMember);
router.post('/team/accept', authenticateToken, acceptInvitation);
router.get('/team/workspaces', authenticateToken, getWorkspaces);
router.post('/team/workspaces', authenticateToken, createWorkspace);

// Billing & Upgrades (Authenticated)
router.post('/billing/checkout', authenticateToken, createCheckoutSession);
router.post('/billing/razorpay/verify', authenticateToken, handleRazorpayVerification);

// Exports system (Authenticated)
router.get('/exports/csv', authenticateToken, exportCSV);
router.get('/exports/xlsx', authenticateToken, exportXLSX);
router.get('/exports/pdf', authenticateToken, exportPDF);
router.post('/exports/google-sheets', authenticateToken, exportGoogleSheets);

// Analytics Dashboard (Authenticated)
router.get('/analytics', authenticateToken, getTeamDashboardAnalytics);

// Admin Metrics (System management)
router.get('/admin/metrics', getAdminMetrics);

export default router;
