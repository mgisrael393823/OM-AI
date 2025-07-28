import type { NextApiHandler } from 'next'

const handler: NextApiHandler = (req, res) => {
  res.status(200).json({ ok: true })
}

export default handler
