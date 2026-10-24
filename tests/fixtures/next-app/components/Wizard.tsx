export function Wizard() {
  return <section id="wizard"><h2>ขั้นที่ 1: กรอกข้อมูล</h2><StepTwo /></section>
}
function StepTwo() { return <div className="drawer">Review the draft</div> }
