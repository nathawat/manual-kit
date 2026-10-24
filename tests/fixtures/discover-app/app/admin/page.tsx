import { requireRole } from '../../lib/auth'
export default async function Admin() { await requireRole('admin'); return <h1>Admin</h1> }
