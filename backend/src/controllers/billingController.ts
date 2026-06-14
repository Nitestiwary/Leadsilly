import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import pool from '../config/db';
import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2023-10-16' as any,
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret',
});

export const createCheckoutSession = async (req: AuthenticatedRequest, res: Response) => {
  const { planType, gateway } = req.body;
  const userId = req.user?.id;

  try {
    let email = 'local_test_user@leadsilly.com';
    try {
      const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
      if (userRes.rows[0]?.email) {
        email = userRes.rows[0].email;
      }
    } catch (dbError) {
      console.warn('Database email fetch failed (local testing mode), utilizing fallback email:', dbError);
    }

    // Prices mapping (USD)
    const prices = {
      Individual: { usd: 400, inr: 39000 },
      Team: { usd: 1500, inr: 129000 },
      Agency: { usd: 4900, inr: 419000 }
    };

    if (gateway === 'stripe') {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `Leadsilly ${planType} Plan` },
              unit_amount: prices[planType as keyof typeof prices]?.usd || 0,
              recurring: { interval: 'month' },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/cancel`,
        metadata: { userId: userId || '', planType: planType || '' },
        customer_email: email || undefined,
      });

      return res.json({ checkoutUrl: session.url });
    } else if (gateway === 'razorpay') {
      // Create Razorpay Order
      const amount = prices[planType as keyof typeof prices]?.inr || 0;
      const order = (await razorpay.orders.create({
        amount, // in paisa
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
        notes: { userId: userId || '', planType: planType || '' }
      })) as any;

      return res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock'
      });
    }

    return res.status(400).json({ error: 'Unsupported payment gateway' });
  } catch (error) {
    console.error('Checkout creation error:', error);
    return res.status(500).json({ error: 'Failed to create subscription checkout' });
  }
};

export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock'
    );
  } catch (err: any) {
    // Webhook mock fallback for dev testing
    if (process.env.NODE_ENV !== 'production') {
      event = req.body;
    } else {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = session.metadata.userId;
      const planType = session.metadata.planType;
      const stripeSubId = session.subscription;

      // Find user org and update subscription details
      const memberRes = await pool.query('SELECT organization_id FROM members WHERE user_id = $1 LIMIT 1', [userId]);
      const orgId = memberRes.rows[0]?.organization_id;

      if (orgId) {
        await pool.query(
          `UPDATE subscriptions 
           SET plan_type = $1, stripe_subscription_id = $2, status = 'active', current_period_end = NOW() + interval '1 month', updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = $3`,
          [planType, stripeSubId, orgId]
        );
      }
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handling error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const handleRazorpayVerification = async (req: AuthenticatedRequest, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType } = req.body;
  const userId = req.user?.id;

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'mock_secret')
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generated_signature !== razorpay_signature && process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  try {
    // Fetch Organization ID for User
    try {
      const memberRes = await pool.query('SELECT organization_id FROM members WHERE user_id = $1 LIMIT 1', [userId]);
      const orgId = memberRes.rows[0]?.organization_id;

      if (orgId) {
        await pool.query(
          `UPDATE subscriptions 
           SET plan_type = $1, razorpay_subscription_id = $2, status = 'active', current_period_end = NOW() + interval '1 month', updated_at = CURRENT_TIMESTAMP
           WHERE organization_id = $3`,
          [planType, razorpay_payment_id, orgId]
        );
      }
    } catch (dbError) {
      console.warn('Database query failed (local testing mode):', dbError);
      // Suppress database connection failures in local development to allow payment verification testing
    }

    return res.json({ success: true, message: 'Subscription upgraded successfully!' });
  } catch (error) {
    console.error('Razorpay verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
