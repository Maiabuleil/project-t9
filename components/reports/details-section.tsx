'use client'

import type { ReportDetails } from '@/lib/types'
import { INSPECTORS, PROJECTS } from '@/lib/report-utils'
import { Field, FormSection, TextInput } from './fields'

type DetailsSectionProps = {
  details: ReportDetails
  onChange: (details: ReportDetails) => void
}

export function DetailsSection({ details, onChange }: DetailsSectionProps) {
  function set<K extends keyof ReportDetails>(key: K, value: ReportDetails[K]) {
    onChange({ ...details, [key]: value })
  }

  return (
    <FormSection step={1} id="details-heading" title="פרטי הדוח">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-border bg-card p-4">
        <Field id="project" label="פרויקט" className="col-span-2">
          <TextInput
            id="project"
            list="projects-list"
            value={details.project}
            onChange={(e) => set('project', e.target.value)}
            placeholder="בחרו או הקלידו פרויקט"
          />
          <datalist id="projects-list">
            {PROJECTS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>

        <Field id="reportNumber" label="מספר דוח">
          <TextInput
            id="reportNumber"
            inputMode="numeric"
            value={details.reportNumber}
            onChange={(e) => set('reportNumber', e.target.value)}
          />
        </Field>

        <Field id="date" label="תאריך">
          <TextInput
            id="date"
            type="date"
            value={details.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </Field>

        <Field id="address" label="כתובת" className="col-span-2">
          <TextInput
            id="address"
            autoComplete="street-address"
            value={details.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="רחוב, מספר, עיר"
          />
        </Field>

        <Field id="building" label="בניין / כניסה" className="col-span-2">
          <TextInput
            id="building"
            value={details.building}
            onChange={(e) => set('building', e.target.value)}
            placeholder="לדוגמה: בניין ב׳"
          />
        </Field>

        <Field id="apartment" label="מספר דירה">
          <TextInput
            id="apartment"
            inputMode="numeric"
            value={details.apartment}
            onChange={(e) => set('apartment', e.target.value)}
          />
        </Field>

        <Field id="floor" label="קומה">
          <TextInput
            id="floor"
            inputMode="numeric"
            value={details.floor}
            onChange={(e) => set('floor', e.target.value)}
          />
        </Field>

        <Field id="clientName" label="שם הדייר / הלקוח" className="col-span-2">
          <TextInput
            id="clientName"
            autoComplete="name"
            value={details.clientName}
            onChange={(e) => set('clientName', e.target.value)}
          />
        </Field>

        <Field id="inspector" label="מבצע הבדיקה" className="col-span-2">
          <TextInput
            id="inspector"
            list="inspectors-list"
            value={details.inspector}
            onChange={(e) => set('inspector', e.target.value)}
            placeholder="שם העובד"
          />
          <datalist id="inspectors-list">
            {INSPECTORS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
      </div>
    </FormSection>
  )
}
