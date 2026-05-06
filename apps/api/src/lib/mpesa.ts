// Safaricom Daraja API — M-Pesa STK Push
// Sandbox: https://sandbox.safaricom.co.ke
// Production: https://api.safaricom.co.ke
// Docs: https://developer.safaricom.co.ke/docs

const DARAJA_BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getOAuthToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY!;
  const secret = process.env.MPESA_CONSUMER_SECRET!;
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) throw new Error(`Daraja OAuth failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

function buildPassword(): { password: string; timestamp: string } {
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { password, timestamp };
}

export interface STKPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

// Initiates an STK Push to the customer's phone. Returns a checkoutRequestId
// to poll or match against the callback.
export async function initiateSTKPush(params: {
  phone: string;       // format: 2547XXXXXXXX
  amount: number;      // in KES, integer
  reference: string;   // transaction/order ID shown on the customer's phone
  description: string;
}): Promise<STKPushResult> {
  const token = await getOAuthToken();
  const { password, timestamp } = buildPassword();
  const callbackUrl = process.env.MPESA_CALLBACK_URL!;

  const body = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(params.amount),
    PartyA: params.phone,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: params.phone,
    CallBackURL: callbackUrl,
    AccountReference: params.reference,
    TransactionDesc: params.description,
  };

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STK push failed (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    CheckoutRequestID: string;
    MerchantRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
  };

  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription,
    customerMessage: data.CustomerMessage,
  };
}

// Poll whether a specific STK push was completed (use as fallback if callback fails).
export async function querySTKPushStatus(checkoutRequestId: string): Promise<{
  resultCode: string;
  resultDesc: string;
}> {
  const token = await getOAuthToken();
  const { password, timestamp } = buildPassword();

  const body = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`STK query failed: ${res.status}`);
  const data = await res.json() as { ResultCode: string; ResultDesc: string };
  return { resultCode: data.ResultCode, resultDesc: data.ResultDesc };
}
