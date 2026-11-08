import type { CSSProperties, ReactNode } from 'react'
import type { CheckResult, InspectionId } from '@/lib/types'

// Page layout for the generated PDF. It reproduces the company's Word report template; only the
// apartment details, inspection results and the report's own photos change from report to report.
// Styles are inline (plain hex colors, no Tailwind) so the page renders the same when captured to an image.

export const PAGE_WIDTH = 794 // A4 at 96 dpi
export const PAGE_HEIGHT = 1123

const BLUE = '#2E74B5'
const RED = '#E00000'
const BORDER = '#BFBFBF'
const SHADE = '#E7EDF5'
const FONT = 'Arial, "Segoe UI", "Noto Sans Hebrew", sans-serif'

export type PdfAssets = { logo: string; association: string; watermark: string }

export type PdfPhoto = { src: string; caption: string; note: string }

export type PdfPhotoPair = { before: PdfPhoto | null; after: PdfPhoto | null }

export type PdfResultRow = { label: string; result: CheckResult; note: string }

export type PdfData = {
  reportNumber: string
  inspectionDate: string
  productionDate: string
  clientName: string
  address: string
  unit: string
  inspector: string
  results: PdfResultRow[]
  photoPairs: PdfPhotoPair[]
  assets: PdfAssets
}

export const PDF_INSPECTION_LABELS: Record<InspectionId, string> = {
  flushing: 'שטיפה',
  camera: 'צילום פנים',
  flood: 'הצפה',
  'ac-line': 'קו מזגן',
}

export function ReportPdfPages({ data }: { data: PdfData }) {
  const lastPhotoIndex = data.photoPairs.length - 1

  return (
    <>
      <Page data={data}>
        <CoverContent data={data} />
      </Page>
      <Page data={data}>
        <TermsContent />
        {data.photoPairs.length === 0 && <Closing />}
      </Page>
      {data.photoPairs.map((pair, index) => (
        <Page key={`photos-${index}`} data={data}>
          <PhotoPairContent pair={pair} />
          {index === lastPhotoIndex && <Closing />}
        </Page>
      ))}
    </>
  )
}

function Page({ data, children }: { data: PdfData; children: ReactNode }) {
  return (
    <div
      data-pdf-page=""
      dir="rtl"
      style={{ position: 'relative', width: PAGE_WIDTH, height: PAGE_HEIGHT, overflow: 'hidden', background: '#FFFFFF', color: '#000000', fontFamily: FONT, boxSizing: 'border-box' }}
    >
      <img
        src={data.assets.watermark}
        alt=""
        style={{ position: 'absolute', left: '50%', top: 330, width: 470, transform: 'translateX(-50%)', opacity: 0.16 }}
      />
      <Header data={data} />
      <div style={{ position: 'absolute', top: 205, right: 60, left: 60, bottom: 130 }}>{children}</div>
      <Footer />
    </div>
  )
}

function Header({ data }: { data: PdfData }) {
  return (
    <div style={{ position: 'absolute', top: 24, right: 50, left: 40, height: 175 }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 250, paddingTop: 30, color: BLUE, fontSize: 14, lineHeight: 1.45 }}>
        <div>שארק רובוטים מתקדמים בע&quot;מ</div>
        <div>שירות שטיפה וצילום מקצועי מהיר ואמין</div>
        <div>פתרונות ואיתור נזילות אל הרס</div>
        <div>בטכנולוגיה החדשה ביותר</div>
        <div>ח.פ 516079464</div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ color: RED, fontSize: 12, marginBottom: 4 }}>מס&apos; דוח: {data.reportNumber || '—'}</div>
        <img src={data.assets.logo} alt="" style={{ height: 150 }} />
      </div>
      <img src={data.assets.association} alt="" style={{ position: 'absolute', top: 40, left: 0, width: 175 }} />
    </div>
  )
}

function Footer() {
  return (
    <div style={{ position: 'absolute', bottom: 28, right: 60, left: 60, textAlign: 'center', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
      <div>שארק-תיקון אל הרס-שרוול חידוש צנרת ארוכה-רובוט כרסום בטון שורשים-שטיפה וצילום צנרת</div>
      <div>ייבוש תת רצפתי-איתור נזילות מים במערכות מתקדמת</div>
      <div dir="ltr" style={{ color: '#1AA3E8' }}>INFO@SHARKROBOOT.COM-----WWW.SHARKROBOOT.COM</div>
      <div dir="ltr">054-5544401/ 050-7924174 /054-7185117</div>
    </div>
  )
}

const sectionTitle: CSSProperties = { color: BLUE, fontSize: 20, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 4, margin: '0 0 18px' }
const cell: CSSProperties = { border: `1px solid ${BORDER}`, padding: '7px 10px', fontSize: 13.5, verticalAlign: 'middle', textAlign: 'right' }
const shadedCell: CSSProperties = { ...cell, background: SHADE }

function CoverContent({ data }: { data: PdfData }) {
  return (
    <div>
      <h1 style={{ textAlign: 'center', fontSize: 34, fontWeight: 400, margin: '6px 0 46px' }}>דוח בדיקת קווי דלוחים</h1>
      <p style={{ color: RED, fontSize: 13, margin: '0 0 42px' }}>
        תאריך הבדיקה: {data.inspectionDate || '—'}&nbsp;&nbsp;&nbsp;&nbsp;תאריך הפקה: {data.productionDate}
      </p>

      <h2 style={sectionTitle}>פרטי הלקוח והנכס:</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.75)', marginBottom: 44 }}>
        <tbody>
          <DetailRow label="שם הלקוח" value={data.clientName} shaded bold />
          <DetailRow label="כתובת הנכס" value={data.address} />
          <DetailRow label="בניין  קומה  דירה" value={data.unit} />
          <DetailRow label="מבצע הבדיקה" value={data.inspector} />
        </tbody>
      </table>

      <h2 style={sectionTitle}>ממצאים ותוצאות:</h2>
      <table style={{ width: '82%', margin: '0 auto', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.75)' }}>
        <thead>
          <tr>
            <th style={{ ...shadedCell, fontWeight: 400, width: '25%' }}>סוג הבדיקה</th>
            <th style={{ ...shadedCell, fontWeight: 400, width: '17%' }}>תוצאה</th>
            <th style={{ ...shadedCell, fontWeight: 400 }}>ממצא או הערה</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((row) => (
            <tr key={row.label}>
              <td style={{ ...cell, height: 34 }}>{row.label}</td>
              <td style={cell}>
                <ResultMark result={row.result} />
              </td>
              <td style={cell}>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailRow({ label, value, shaded = false, bold = false }: { label: string; value: string; shaded?: boolean; bold?: boolean }) {
  const style = shaded ? shadedCell : cell
  return (
    <tr>
      <td style={{ ...style, width: '31%' }}>{label}</td>
      <td style={{ ...style, fontWeight: bold ? 700 : 400 }}>{value || '—'}</td>
    </tr>
  )
}

function ResultMark({ result }: { result: CheckResult }) {
  if (result === null) return <span style={{ color: '#7F7F7F' }}>—</span>
  const ok = result === 'ok'
  return (
    <span style={{ display: 'inline-block', minWidth: 18, padding: '0 3px', textAlign: 'center', background: ok ? '#00FF00' : '#FF4D4D', color: ok ? '#000000' : '#FFFFFF', fontWeight: 700, fontSize: 14 }}>
      {ok ? '✓' : '✗'}
    </span>
  )
}

const termsHeading: CSSProperties = { color: BLUE, fontSize: 14, margin: '0 0 4px' }
const termsText: CSSProperties = { fontSize: 14, lineHeight: 1.45, margin: '0 0 9px' }

function TermsContent() {
  return (
    <div style={{ paddingTop: 70 }}>
      <h2 style={{ ...sectionTitle, fontSize: 24, marginBottom: 26 }}>היקף הבדיקות ותיעוד מצולם</h2>
      <p style={termsHeading}>הערות והסתייגויות</p>
      <p style={termsText}>• הבדיקה משקפת את מצב המקטעים שהיו נגישים ונצפו במועד הבדיקה בלבד.</p>
      <p style={termsText}>• מקטע שלא ניתן היה לגשת אליו או לצלמו יצוין במפורש בדוח.</p>
      <p style={termsText}>• ליקוי סמוי, שינוי עתידי או כשל שאינו נראה בצילום אינם נשללים בהיעדר סימן גלוי.</p>
      <p style={termsText}>• במקרה של ממצא מהותי מומלץ לבצע טיפול מקצועי ובדיקת אימות לאחר השלמתו.</p>
      <p style={termsText}>תוצאה תקינה אינה אישור לתקינות כלל המערכת או איטום המבנה. שטיפה אינה תיקון של ליקוי מבני ואינה התחייבות למניעת סתימות או תקלות עתידיות.</p>
      <p style={termsText}>בדיקה חוזרת עקב טעות של מבצע הבדיקה תבוצע ללא תשלום. בדיקה חוזרת בשל תנאי שטח משתנים או מידע שגוי מהלקוח, וכן ציוד או פעולות נוספים, יתומחרו לפי הצורך ויתואמו עם הלקוח לפני ביצועם.</p>
      <p style={{ ...termsHeading, marginTop: 14 }}>תיעוד מצולם</p>
      <p style={termsText}>הדוח מבוסס על הבדיקות והממצאים מהשטח ועל תמונות וסרטונים ככל שצולמו. לכל תמונה יש לציין מיקום והסבר קצר.</p>
      <h2 style={{ ...sectionTitle, fontSize: 24, margin: '34px 0 8px' }}>הצהרת עורך הדוח</h2>
      <p style={termsText}>אני החותם מטה התבקשתי על ידי הלקוח לבדוק את קווי הדלוחים בנכס המפורט בדוח. במסגרת העבודה בוצעו שטיפה בלחץ מים גבוה, צילום פנים הצנרת ובדיקות הצפה באמצעות חסימת המקטעים בבלוני אטימה ייעודיים ומילויים במים. כל בדיקת הצפה נמשכה בין 20 ל־30 דקות, תוך מעקב אחר מפלס המים ובחינת סימנים לדליפה.</p>
      <p style={termsText}>חוות דעתי נערכה לפי מיטב ידיעתי והכשרתי המקצועית, והיא מבוססת על הבדיקות שבוצעו והממצאים שתועדו בפועל במקטעים שנבדקו ובמועד הבדיקה.</p>
      <p style={termsText}>אני נותן חוות דעתי זו במקום עדות בבית המשפט, ומצהיר כי ידוע לי שלעניין הוראות החוק הפלילי בדבר עדות שקר בשבועה, דין חוות דעת זו, כשהיא חתומה על ידי, כדין עדות בשבועה שנתתי בבית המשפט.</p>
    </div>
  )
}

function PhotoPairContent({ pair }: { pair: PdfPhotoPair }) {
  return (
    <div style={{ paddingTop: 36 }}>
      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>תיעוד מצולם לפני ואחרי ביצוע הבדיקה</p>
      <p style={{ fontSize: 13, margin: '0 0 28px' }}>התמונות שלהלן מתעדות את מצב המקטעים לפני הבדיקה ולאחריה, בציון מיקום ותיאור קצר.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: '#FFFFFF' }}>
        <thead>
          <tr>
            <th style={{ ...shadedCell, fontWeight: 700, textAlign: 'center' }}>לפני</th>
            <th style={{ ...shadedCell, fontWeight: 700, textAlign: 'center' }}>אחרי</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <PhotoCell photo={pair.before} />
            <PhotoCell photo={pair.after} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function PhotoCell({ photo }: { photo: PdfPhoto | null }) {
  return (
    <td style={{ ...cell, padding: 8, verticalAlign: 'top' }}>
      <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', background: photo ? '#FFFFFF' : '#F4F6F9' }}>
        {photo ? (
          <img src={photo.src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ color: '#7F7F7F', fontSize: 13 }}>אין תמונה</span>
        )}
      </div>
      <div style={{ fontSize: 13, marginTop: 8, minHeight: 18 }}>{photo ? clip(photo.caption, 70) : ''}</div>
      {photo?.note && <div style={{ fontSize: 12, color: '#404040', marginTop: 3 }}>{clip(photo.note, 140)}</div>}
    </td>
  )
}

function Closing() {
  return <p style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 14, margin: 0 }}>בברכה, שארק רובוטים מתקדמים בע״מ</p>
}

function clip(text: string, max: number) {
  const value = text.trim()
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
