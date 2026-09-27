import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const inputClassName =
  'h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring/20'

export const textareaClassName =
  'min-h-24 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-ring/20'

type FieldProps = {
  id: string
  label: string
  className?: string
  children: ReactNode
}

export function Field({ id, label, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn(inputClassName, className)} />
}

export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(textareaClassName, className)} />
}

type SectionProps = {
  step: number
  title: string
  description?: string
  id: string
  action?: ReactNode
  children: ReactNode
}

export function FormSection({ step, title, description, id, action, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
          {step}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={id} className="text-xl font-bold leading-8">
            {title}
          </h2>
          {description && (
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
