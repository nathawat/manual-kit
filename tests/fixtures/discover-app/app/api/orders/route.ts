export async function GET() { return Response.json([]) }
export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Payments are not set up yet')
  return Response.json({})
}
