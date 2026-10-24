import { z } from 'zod'
const schema = z.object({ email: z.string().email('Enter a valid e-mail address'), qty: z.number().min(1, 'กรุณาระบุจำนวนอย่างน้อย 1 ชิ้น') })
export default function NewOrder() {
  return (
    <form>
      <input type="email" name="email" placeholder="E-mail" />
      <textarea name="note" aria-label="Note to the shop" />
      <button>Place order</button>
    </form>
  )
}
