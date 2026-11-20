// SMS sender. SMS_PROVIDER=console (default: prints to the server log) or webhook.
// "webhook" POSTs {to, message} as JSON to SMS_WEBHOOK_URL with SMS_WEBHOOK_TOKEN as a Bearer token, which is
// the simplest way to plug in MSR's chosen Indian SMS gateway (DLT-registered sender ID and template required in India).
export async function sendSms(phone, message) {
  const provider = process.env.SMS_PROVIDER || 'console';
  if (provider === 'webhook') {
    const res = await fetch(process.env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN || ''}` },
      body: JSON.stringify({ to: `+91${phone}`, message }),
    });
    if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`);
    return;
  }
  if (process.env.NODE_ENV !== 'test') console.log(`[sms] to +91 ${phone.slice(0, 2)}••••••${phone.slice(-2)}: ${message}`);
}
