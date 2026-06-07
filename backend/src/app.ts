import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/api';
import { handleStripeWebhook } from './controllers/billingController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security and CORS config
app.use(cors({
  origin: '*', // Allow extension connections
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe Webhook Endpoint needs raw body for signature validation
app.post('/api/billing/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// JSON Parsers for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Core API endpoints
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'leadsilly-backend', timestamp: new Date() });
});

// Startup Server
app.listen(PORT, () => {
  console.log(`Leadsilly Backend Server is running on port ${PORT}`);
});

export default app;
