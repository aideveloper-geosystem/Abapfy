import { CodeBlock } from './CodeBlock'
import { createContext, useContext } from 'react'
import {
  isSourceCodeField,
  TECHNICAL_LABELS,
  TECHNICAL_VALUES
} from '@renderer/lib/structuredPresentation'
import type { StructuredValue } from '@renderer/lib/structuredResponse'
import './StructuredJson.css'

const BADGE_KEYS = new Set([
  'severity',
  'risk_level',
  'priority',
  'verdict',
  'probability',
  'impact',
  'status'
])

const LocalizedContext = createContext(false)

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'success',
  info: 'neutral',
  approved: 'success',
  approved_with_changes: 'warning',
  rejected: 'danger'
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isPlainObject(value: unknown): value is Record<string, StructuredValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickHeader(item: Record<string, StructuredValue>, index: number): string {
  const candidateKeys = ['rank', 'id', 'title', 'name', 'file', 'nome', 'object_name']
  for (const key of candidateKeys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return `#${value}`
  }
  return `#${index + 1}`
}

function headerKey(item: Record<string, StructuredValue>): string | null {
  const candidateKeys = ['rank', 'id', 'title', 'name', 'file', 'nome', 'object_name']
  return candidateKeys.find((key) => key in item) ?? null
}

interface FieldProps {
  fieldKey: string
  value: StructuredValue
}

function Field({ fieldKey, value }: FieldProps): JSX.Element | null {
  const localized = useContext(LocalizedContext)
  const fieldLabel = localized
    ? (TECHNICAL_LABELS[fieldKey] ?? humanizeKey(fieldKey))
    : humanizeKey(fieldKey)
  const displayValue =
    typeof value === 'string' ? (localized ? (TECHNICAL_VALUES[value] ?? value) : value) : ''
  // Compatibility is explicitly unknown, rather than silently omitted.
  if (value === null && fieldKey === 's4hana_compatible' && localized) {
    return (
      <div className="structured-field">
        <span className="structured-field-label">{fieldLabel}</span>
        <span className="structured-badge structured-badge-neutral">A confirmar</span>
      </div>
    )
  }
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'boolean') {
    return (
      <div className="structured-field">
        <span className="structured-field-label">{fieldLabel}</span>
        <span className={`structured-badge structured-badge-${value ? 'success' : 'danger'}`}>
          {value ? 'Sim' : 'Não'}
        </span>
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <div className="structured-field">
        <span className="structured-field-label">{fieldLabel}</span>
        <span className="structured-field-number">{value}</span>
      </div>
    )
  }

  if (typeof value === 'string') {
    if (BADGE_KEYS.has(fieldKey.toLowerCase())) {
      const color = STATUS_COLOR[value.toLowerCase()] ?? 'neutral'
      return (
        <div className="structured-field">
          <span className="structured-field-label">{fieldLabel}</span>
          <span className={`structured-badge structured-badge-${color}`}>{displayValue}</span>
        </div>
      )
    }

    if (isSourceCodeField(fieldKey)) {
      return (
        <div className="structured-field structured-field-block">
          <span className="structured-field-label">{fieldLabel}</span>
          <CodeBlock language="abap" code={value} />
        </div>
      )
    }

    return (
      <div className="structured-field structured-field-block">
        <span className="structured-field-label">{fieldLabel}</span>
        <p className="structured-field-text">{displayValue}</p>
      </div>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null

    const allPrimitive = value.every((item) => typeof item !== 'object' || item === null)
    if (allPrimitive) {
      return (
        <div className="structured-field structured-field-block">
          <span className="structured-field-label">{fieldLabel}</span>
          <div className="structured-chip-list">
            {value.map((item, index) => (
              <span key={index} className="structured-chip">
                {String(item)}
              </span>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="structured-field structured-field-block">
        <span className="structured-field-label">{fieldLabel}</span>
        <div className="structured-array">
          {value.map((item, index) => {
            if (!isPlainObject(item)) {
              return (
                <div key={index} className="structured-array-card">
                  {String(item)}
                </div>
              )
            }
            const header = pickHeader(item, index)
            const skipKey = headerKey(item)
            return (
              <div key={index} className="structured-array-card">
                <span className="structured-array-card-header">{header}</span>
                <div className="structured-array-card-body">
                  {Object.entries(item)
                    .filter(([key]) => key !== skipKey)
                    .map(([key, subValue]) => (
                      <Field key={key} fieldKey={key} value={subValue} />
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (isPlainObject(value)) {
    return (
      <div className="structured-field structured-field-block">
        <span className="structured-field-label">{fieldLabel}</span>
        <div className="structured-nested">
          {Object.entries(value).map(([key, subValue]) => (
            <Field key={key} fieldKey={key} value={subValue} />
          ))}
        </div>
      </div>
    )
  }

  return null
}

interface StructuredJsonProps {
  data: Record<string, StructuredValue>
  localized?: boolean
}

export function StructuredJson({ data, localized = false }: StructuredJsonProps): JSX.Element {
  return (
    <LocalizedContext.Provider value={localized}>
      <div className="structured-json">
        {Object.entries(data).map(([key, value]) => (
          <Field key={key} fieldKey={key} value={value} />
        ))}
      </div>
    </LocalizedContext.Provider>
  )
}
