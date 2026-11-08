import type { CSSProperties, ReactNode } from 'react'
import type { CheckResult, InspectionId } from '@/lib/types'

// Page layout for the generated PDF. It reproduces the company's Word report template; only the
// apartment details, inspection results and the report's own photos change from report to report.
// Styles are inline (plain hex colors, no Tailwind) so the page renders the same when captured to an image.
//
// The HTML holds only text, tables and frames. Logos, the watermark and the photos are drawn straight
// into the PDF at the fixed positions in PDF_LAYOUT: iPhone Safari drops or mis-measures images when a page
// is captured, which left the PDF without photos.

export const PAGE_WIDTH = 794 // A4 at 96 dpi
export const PAGE_HEIGHT = 1123

const CONTENT_TOP = 205
const CONTENT_SIDE = 60
const PHOTO_HEADER_TOP = 120 // inside the content area
const PHOTO_HEADER_HEIGHT = 32
const PHOTO_PADDING = 8
const PHOTO_AREA_HEIGHT = 520
const PHOTO_COLUMN_WIDTH = (PAGE_WIDTH - CONTENT_SIDE * 2) / 2

// Page coordinates (px) of everything drawn into the PDF directly.
export const PDF_LAYOUT = {
  watermark: { x: (PAGE_WIDTH - 470) / 2, y: 330, width: 470, opacity: 0.16 },
  logo: { centerX: 40 + (PAGE_WIDTH - 40 - 50) / 2, y: 24 + 18, height: 150 },
  association: { x: 40, y: 24 + 40, width: 175 },
  // Right-to-left: "before" is the right-hand column.
  photos: {
    before: { x: CONTENT_SIDE + PHOTO_COLUMN_WIDTH + PHOTO_PADDING, y: CONTENT_TOP + PHOTO_HEADER_TOP + PHOTO_HEADER_HEIGHT + PHOTO_PADDING, width: PHOTO_COLUMN_WIDTH - PHOTO_PADDING * 2, height: PHOTO_AREA_HEIGHT },
    after: { x: CONTENT_SIDE + PHOTO_PADDING, y: CONTENT_TOP + PHOTO_HEADER_TOP + PHOTO_HEADER_HEIGHT + PHOTO_PADDING, width: PHOTO_COLUMN_WIDTH - PHOTO_PADDING * 2, height: PHOTO_AREA_HEIGHT },
  },
} as const

const BLUE = '#2E74B5'
const RED = '#E00000'
const BORDER = '#BFBFBF'
const SHADE = '#E7EDF5'
const FONT = 'Arial, "Segoe UI", "Noto Sans Hebrew", sans-serif'

// `loaded` is false when the photo could not be loaded; the PDF then shows a labelled placeholder.
export type PdfPhoto = { id: string; loaded: boolean; caption: string; note: string }

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
      <Page data={data} photoPair={-1}>
        <TermsContent />
        {data.photoPairs.length === 0 && <Closing />}
      </Page>
      {data.photoPairs.map((pair, index) => (
        <Page key={`photos-${index}`} data={data} photoPair={index}>
          <PhotoPairContent pair={pair} />
          {index === lastPhotoIndex && <Closing />}
        </Page>
      ))}
    </>
  )
}

function Page({ data, photoPair = -1, children }: { data: PdfData; photoPair?: number; children: ReactNode }) {
  return (
    <div
      data-pdf-page=""
      data-photo-pair={photoPair}
      dir="rtl"
      style={{ position: 'relative', width: PAGE_WIDTH, height: PAGE_HEIGHT, overflow: 'hidden', background: '#FFFFFF', color: '#000000', fontFamily: FONT, boxSizing: 'border-box' }}
    >
      <Header data={data} />
      <div style={{ position: 'absolute', top: CONTENT_TOP, right: CONTENT_SIDE, left: CONTENT_SIDE, bottom: 130 }}>{children}</div>
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
      {/* The Shark logo (below this line) and the association logo (left) are drawn into the PDF directly. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', color: RED, fontSize: 12, lineHeight: '16px' }}>מס&apos; דוח: {data.reportNumber || '—'}</div>
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
  const frameTop = PHOTO_HEADER_TOP
  const areaTop = frameTop + PHOTO_HEADER_HEIGHT
  const captionTop = areaTop + PHOTO_PADDING + PHOTO_AREA_HEIGHT + PHOTO_PADDING
  const frameBottom = captionTop + 52
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <p style={{ position: 'absolute', top: 36, right: 0, fontSize: 15, fontWeight: 700, margin: 0, lineHeight: '20px' }}>תיעוד מצולם לפני ואחרי ביצוע הבדיקה</p>
      <p style={{ position: 'absolute', top: 62, right: 0, fontSize: 13, margin: 0, lineHeight: '18px' }}>התמונות שלהלן מתעדות את מצב המקטעים לפני הבדיקה ולאחריה, בציון מיקום ותיאור קצר.</p>
      {/* Two-column frame: header row, photo area (photo drawn into the PDF), caption. */}
      <div style={{ position: 'absolute', top: frameTop, right: 0, left: 0, height: frameBottom - frameTop, border: `1px solid ${BORDER}`, boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', top: frameTop, right: 0, left: 0, height: PHOTO_HEADER_HEIGHT, background: SHADE, borderBottom: `1px solid ${BORDER}`, boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', top: frameTop, height: frameBottom - frameTop, left: PHOTO_COLUMN_WIDTH, width: 1, background: BORDER }} />
      <PhotoColumn side="before" photo={pair.before} headerTop={frameTop} areaTop={areaTop} captionTop={captionTop} />
      <PhotoColumn side="after" photo={pair.after} headerTop={frameTop} areaTop={areaTop} captionTop={captionTop} />
    </div>
  )
}

function PhotoColumn({ side, photo, headerTop, areaTop, captionTop }: { side: 'before' | 'after'; photo: PdfPhoto | null; headerTop: number; areaTop: number; captionTop: number }) {
  const horizontal: CSSProperties = side === 'before' ? { right: 0 } : { left: 0 }
  const column: CSSProperties = { position: 'absolute', width: PHOTO_COLUMN_WIDTH, ...horizontal }
  return (
    <>
      <div style={{ ...column, top: headerTop, height: PHOTO_HEADER_HEIGHT, lineHeight: `${PHOTO_HEADER_HEIGHT}px`, textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>
        {side === 'before' ? 'לפני' : 'אחרי'}
      </div>
      {!photo?.loaded && (
        <div style={{ ...column, top: areaTop + PHOTO_PADDING, height: PHOTO_AREA_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: PHOTO_COLUMN_WIDTH - PHOTO_PADDING * 2, height: PHOTO_AREA_HEIGHT, background: '#F4F6F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: photo ? '#C00000' : '#7F7F7F', fontSize: 13 }}>
            {photo ? 'התמונה לא נטענה' : 'אין תמונה'}
          </div>
        </div>
      )}
      {photo && (
        <div style={{ ...column, top: captionTop, padding: `0 ${PHOTO_PADDING + 2}px`, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 13, lineHeight: '18px', minHeight: 18 }}>{clip(photo.caption, 70)}</div>
          {photo.note && <div style={{ fontSize: 12, lineHeight: '16px', color: '#404040', marginTop: 3 }}>{clip(photo.note, 110)}</div>}
        </div>
      )}
    </>
  )
}

function Closing() {
  return <p style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 14, margin: 0 }}>בברכה, שארק רובוטים מתקדמים בע״מ</p>
}

function clip(text: string, max: number) {
  const value = text.trim()
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
