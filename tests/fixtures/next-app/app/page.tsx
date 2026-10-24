import { Wizard } from '../components/Wizard'
export default function Home() {
  const n = 3
  return (
    <main>
      <h1>ร่างหนังสือราชการ</h1>
      <p>
        เริ่ม   ร่าง
        ได้ทันที
      </p>
      <input placeholder="ค้นหาระเบียบ" aria-label="Search rules" className="x y" />
      <button title={'Save draft'}>{'Save draft'}</button>
      <span>{n} items</span>
      <Wizard />
    </main>
  )
}
