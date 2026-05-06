import { Hono } from 'hono';
import { initiateSTKPush, querySTKPushStatus } from '../lib/mpesa';

export const mpesaRouter = new Hono();

// POST /api/mpesa/stk-push
// Called by the frontend when the cashier selects M-Pesa and confirms amount.
mpesaRouter.post('/stk-push', async (c) => {
  const body = await c.req.json<{
    phone: string;
    amount: number;
    reference: string;   // transactionId or order ref shown on customer's phone
  }>();

  if (!body.phone || !body.amount || !body.reference) {
    return c.json({ error: 'phone, amount, and reference are required' }, 400);
  }

  if (!process.env.MPESA_CONSUMER_KEY) {
    return c.json({ error: 'M-Pesa not configured on this server' }, 503);
  }

  try {
    const result = await initiateSTKPush({
      phone: body.phone,
      amount: body.amount,
      reference: body.reference,
      description: `NomadBite payment ${body.reference}`,
    });

    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'STK push failed';
    console.error('[mpesa] stk-push error:', message);
    return c.json({ error: message }, 502);
  }
});

// GET /api/mpesa/status/:checkoutRequestId
// Frontend can poll this if the callback hasn't arrived yet.
mpesaRouter.get('/status/:checkoutRequestId', async (c) => {
  const id = c.req.param('checkoutRequestId');

  if (!process.env.MPESA_CONSUMER_KEY) {
    return c.json({ error: 'M-Pesa not configured on this server' }, 503);
  }

  try {
    const status = await querySTKPushStatus(id);
    // ResultCode "0" = success, "1032" = cancelled by user
    return c.json({ ...status, paid: status.resultCode === '0' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status query failed';
    return c.json({ error: message }, 502);
  }
});

// POST /api/mpesa/callback
// Safaricom calls this URL after the customer pays (or cancels).
// Must be publicly reachable — use ngrok in dev.
mpesaRouter.post('/callback', async (c) => {
  const body = await c.req.json<{
    Body: {
      stkCallback: {
        MerchantRequestID: string;
        CheckoutRequestID: string;
        ResultCode: number;
        ResultDesc: string;
        CallbackMetadata?: {
          Item: Array<{ Name: string; Value: string | number }>;
        };
      };
    };
  }>();

  const cb = body.Body.stkCallback;
  const paid = cb.ResultCode === 0;

  if (paid && cb.CallbackMetadata) {
    const meta = Object.fromEntries(
      cb.CallbackMetadata.Item.map((i) => [i.Name, i.Value])
    );
    console.log('[mpesa] payment confirmed', {
      checkoutRequestId: cb.CheckoutRequestID,
      mpesaReceiptNumber: meta['MpesaReceiptNumber'],
      amount: meta['Amount'],
      phone: meta['PhoneNumber'],
    });
    // TODO: mark the pending transaction as COMPLETED using CheckoutRequestID
    //       Store CheckoutRequestID on the Transaction model and look it up here.
  } else {
    console.log('[mpesa] payment failed/cancelled', cb.CheckoutRequestID, cb.ResultDesc);
    // TODO: mark the pending transaction as VOIDED
  }

  // Safaricom expects a 200 with this exact body
  return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});
