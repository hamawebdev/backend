# Chargily Pay v2 Integration

This module implements the integration with Chargily Pay v2 for handling payments, subscriptions, and activation codes.

## Features

- Create checkout sessions with Chargily Pay
- Handle webhook events from Chargily Pay
- Manage subscriptions
- Validate and redeem existing activation codes
- Idempotent webhook processing
- HMAC signature verification

## Endpoints

### Create Checkout
```
POST /api/v1/payments/checkouts
```

**Request Body:**
```typescript
{
  userId: number;
  studyPackId: number;
  amountDzd: number;         // in DZD "minor unit" (DA has no decimals)
  locale?: 'ar'|'en'|'fr';   // default: 'ar'
  paymentMethod?: 'edahabia'|'cib'|'chargily_app'; // default: 'edahabia'
  activationCode?: string;   // optional activation code
}
```

**Response:**
```typescript
{
  checkoutUrl: string; // URL to redirect user to complete payment
  checkoutId: string;   // Chargily checkout ID
}
```

### Webhook Handler
```
POST /api/v1/payments/webhook
```

Handles events from Chargily Pay:
- `checkout.paid` - Activates subscription and redeems activation code if provided
- `checkout.failed` - Cancels subscription

## Environment Variables

```env
CHARGILY_SECRET_KEY=your_chargily_secret_key_here
CHARGILY_MODE=test        # "test" | "live"
PAYMENTS_SUCCESS_PATH=/payments/success
PAYMENTS_FAILURE_PATH=/payments/failure
WEBHOOK_PUBLIC_URL=https://your-site.com/api/v1/payments/webhook
APP_BASE_URL=http://localhost:3000
```

## Test Mode vs Live Mode

- **Test Mode**: Uses `https://pay.chargily.net/test/api/v2` endpoint
- **Live Mode**: Uses `https://pay.chargily.net/api/v2` endpoint

Switch between modes by setting `CHARGILY_MODE` to either `test` or `live`.

## Supported Payment Methods

- `edahabia` - EDAHABIA card payments
- `cib` - CIB card payments
- `chargily_app` - QR code payments via Chargily App

## Security

- All webhook requests are verified using HMAC SHA-256 signature
- Raw body is used for signature verification (JSON parsing happens after verification)
- Idempotent processing prevents duplicate handling of events

## Separation of Activation Code Management and Payment Processing

It's important to note that activation code generation and validation are completely independent of the online payment processing:

- **Activation Code Generation**: Handled separately by the admin module. New activation codes are created and managed independently of any payment transactions.
- **Activation Code Validation**: During checkout creation, the system only validates existing activation codes to ensure they are valid (active, not expired, and within usage limits).
- **Activation Code Redemption**: When a payment is successful, existing activation codes are redeemed by incrementing their usage count and recording the redemption. No new codes are generated during this process.

This ensures that payment transactions and license key management operate through separate, isolated systems with no direct correlation or dependency between them.

## Testing

Run the test script to verify integration:
```bash
npm run test:payments
```

Or manually test by creating a checkout and completing a payment in test mode.