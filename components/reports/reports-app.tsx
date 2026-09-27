'use client'

import { useState } from 'react'
import { SAMPLE_REPORTS } from '@/lib/sample-data'
import { createEmptyReport } from '@/lib/report-utils'
import type { Report } from '@/lib/types'
import { ReportList } from './report-list'
import { ReportForm } from './report-form'

export function ReportsApp() {
  const [reports, setReports] = useState<Report[]>(SAMPLE_REPORTS)
  const [activeReport, setActiveReport] = useState<Report | null>(null)
  const [isNew, setIsNew] = useState(false)

  function openReport(report: Report, fresh: boolean) {
    setActiveReport(report)
    setIsNew(fresh)
    window.scrollTo({ top: 0 })
  }

  function closeReport() {
    setActiveReport(null)
    window.scrollTo({ top: 0 })
  }

  function saveReport(report: Report) {
    setReports((prev) => {
      const exists = prev.some((r) => r.id === report.id)
      return exists ? prev.map((r) => (r.id === report.id ? report : r)) : [report, ...prev]
    })
    closeReport()
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
      {activeReport ? (
        <ReportForm
          key={activeReport.id}
          initialReport={activeReport}
          isNew={isNew}
          onCancel={closeReport}
          onSave={saveReport}
        />
      ) : (
        <ReportList
          reports={reports}
          onCreate={() => openReport(createEmptyReport(reports), true)}
          onOpen={(report) => openReport(report, false)}
        />
      )}
    </div>
  )
}
