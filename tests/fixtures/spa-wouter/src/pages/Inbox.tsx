export function InboxPage({ count }: { count: number }) {
  return (
    <section>
      <h1>
        หนังสือเข้า
      </h1>
      <input placeholder="ค้นหาเลขที่หนังสือ" aria-label="Search letters" />
      <button title={'Refresh list'}>รีเฟรช</button>
      <img alt="ตราหน่วยงาน" src="/seal.png" />
      <p>{count} items</p>
      <span className="badge">ใหม่</span>
    </section>
  )
}
