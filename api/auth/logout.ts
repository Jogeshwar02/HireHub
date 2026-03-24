import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None');
  return res.status(200).json({ success: true });
}
