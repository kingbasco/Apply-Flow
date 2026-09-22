import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, FileSpreadsheet, Search, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = { id: string; name: string }

type ParsedCsv = {
  headers: string[]
  rows: Record<string, string>[]
}

function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
      continue
    }

    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (ch === '\n') {
      row.push(cell)
      cell = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      continue
    }

    if (ch === '\r') continue
    cell += ch
  }

  if (cell !== '' || row.length) {
    row.push(cell)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }

  if (!rows.length) return { headers: [], rows: [] }

  const headers = rows[0].map((header, index) => header.trim() || `Question ${index + 1}`)
  const data = rows
    .slice(1)
    .map((values) => {
      const item: Record<string, string> = {}
      headers.forEach((header, index) => {
        item[header] = (values[index] ?? '').trim()
      })
      return item
    })
    .filter((item) => Object.values(item).some((value) => value !== ''))

  return { headers, rows: data }
}

function isTimestampHeader(value: string) {
  return /^timestamp$/i.test(value.trim())
}

export function GoogleFormImport({
  applications,
  organizationId,
  onClose,
  onComplete,
}: {
  applications: Application[]
  organizationId: string
  onClose: () => void
  onComplete?: () => void
}) {
  const [applicationId, setApplicationId] = useState(applications[0]?.id || '')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv>({ headers: [], rows: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [programmeOpen, setProgrammeOpen] = useState(false)
  const [programmeSearch, setProgrammeSearch] = useState('')

  const selectedApplication = applications.find((application) => application.id === applicationId) || null
  const filteredApplications = useMemo(() => {
    const query = programmeSearch.trim().toLowerCase()
    if (!query) return applications
    return applications.filter((application) => application.name.toLowerCase().includes(query))
  }, [applications, programmeSearch])

  const questionHeaders = useMemo(
    () => parsed.headers.filter((header) => !isTimestampHeader(header)),
    [parsed.headers],
  )
  const sampleRows = parsed.rows.slice(0, 5)

  const validation = useMemo(() => {
    const normalize = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, ' ')

    const findHeader = (names: string[]) =>
      parsed.headers.find((header) => names.includes(normalize(header)))

    const nameHeader = findHeader(['name', 'full name', 'applicant name', 'your name'])
    const emailHeader = findHeader(['email', 'email address'])
    const isValidEmail = (value: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

    let missingNames = 0
    let missingEmails = 0
    let invalidEmails = 0
    const emailCounts = new Map<string, number>()

    for (const row of parsed.rows) {
      const name = nameHeader ? row[nameHeader].trim() : ''
      const email = emailHeader ? row[emailHeader].trim().toLowerCase() : ''

      if (nameHeader && !name) missingNames += 1

      if (emailHeader) {
        if (!email) {
          missingEmails += 1
        } else if (!isValidEmail(email)) {
          invalidEmails += 1
        } else {
          emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
        }
      }
    }

    const duplicateEmails = Array.from(emailCounts.values()).filter((count) => count > 1).length

    return {
      nameHeader,
      emailHeader,
      missingNames,
      missingEmails,
      invalidEmails,
      duplicateEmails,
    }
  }, [parsed])

  const warningCount =
    (validation.nameHeader ? validation.missingNames : 0) +
    (validation.emailHeader
      ? validation.missingEmails + validation.invalidEmails + validation.duplicateEmails
      : 0)

  async function readFile(next: File | null) {
    setFile(next)
    setError('')
    setParsed({ headers: [], rows: [] })
    setDone(false)

    if (!next) return

    if (!next.name.toLowerCase().endsWith('.csv')) {
      setError('For Phase 1, upload the CSV exported from the Google Forms response sheet.')
      return
    }

    if (next.size > 15 * 1024 * 1024) {
      setError('CSV file is too large. Please keep the import under 15 MB for this first phase.')
      return
    }

    try {
      const text = await next.text()
      const result = parseCsv(text)

      if (!result.headers.length) throw new Error('No response data was found in this CSV.')
      if (result.headers.length < 2) throw new Error('The CSV needs at least two columns.')

      setParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this CSV file.')
    }
  }

  async function importPreview() {
    if (!applicationId || !file || !parsed.headers.length || !parsed.rows.length) return

    setBusy(true)
    setError('')

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Your session has expired. Please sign in again.')

      const { data: batch, error: batchError } = await supabase
        .from('form_import_batches')
        .insert({
          organization_id: organizationId,
          application_id: applicationId,
          source_type: 'google_forms_csv',
          file_name: file.name,
          question_headers: questionHeaders,
          row_count: parsed.rows.length,
          metadata: {
            timestamp_header: parsed.headers.find(isTimestampHeader) || null,
            phase: 1,
          },
          status: 'previewed',
          created_by: user.user.id,
        })
        .select('id')
        .single()

      if (batchError) throw batchError

      for (let i = 0; i < parsed.rows.length; i += 500) {
        const chunk = parsed.rows.slice(i, i + 500).map((response, index) => ({
          batch_id: batch.id,
          row_number: i + index + 1,
          response,
        }))

        const { error: rowsError } = await supabase.from('form_import_rows').insert(chunk)
        if (rowsError) throw rowsError
      }

      const { data: importResult, error: importError } = await supabase.rpc(
        'import_google_form_batch',
        { p_batch_id: batch.id },
      )

      if (importError) throw importError
      if (importResult?.status !== 'imported') {
        throw new Error('The import did not complete.')
      }

      setDone(true)
      onComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as { message?: unknown }).message || 'Could not save this import.') : 'Could not save this import.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import Google Form responses">
      <div className="modal card import-modal import-modal-redesign">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Phase 1 · Google Forms</p>
            <h2>Import form responses</h2>
            <p>Upload the CSV exported from your Google Forms response sheet. ApplyFlow will keep the questions dynamic.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="import-success">
            <div className="success-mark"><CheckCircle2 size={24} /></div>
            <p className="eyebrow">Import saved</p>
            <h3>{parsed.rows.length.toLocaleString()} responses are ready.</h3>
            <p>The questions and responses have been imported into the programme. Applicant records and submissions are now ready for the next screening steps.</p>
            <div className="import-summary">
              <div><span>Questions</span><strong>{questionHeaders.length}</strong></div>
              <div><span>Responses</span><strong>{parsed.rows.length}</strong></div>
            </div>
            <div className="modal-footer">
              <button className="primary-button" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-form">
              <div className="import-field">
                <div className="import-field-label">
                  <span>Programme</span>
                  <span className="import-field-hint">Where these responses will be added</span>
                </div>
                <div className="programme-picker">
                  <button
                    type="button"
                    className={programmeOpen ? 'programme-picker-trigger open' : 'programme-picker-trigger'}
                    onClick={() => setProgrammeOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={programmeOpen}
                  >
                    <span className="programme-picker-value">
                      <span className="programme-picker-icon"><FileSpreadsheet size={16} /></span>
                      <span>
                        <strong>{selectedApplication?.name || 'Select a programme'}</strong>
                        <small>{selectedApplication ? 'Responses will be added to this programme' : 'Choose a destination for this import'}</small>
                      </span>
                    </span>
                    <ChevronDown size={17} className="programme-picker-chevron" />
                  </button>

                  {programmeOpen && (
                    <div className="programme-picker-menu" role="listbox" aria-label="Programme">
                      <div className="programme-picker-search">
                        <Search size={16} />
                        <input
                          autoFocus
                          value={programmeSearch}
                          onChange={(event) => setProgrammeSearch(event.target.value)}
                          placeholder="Search programmes…"
                          aria-label="Search programmes"
                        />
                      </div>
                      <div className="programme-picker-options">
                        {filteredApplications.length ? filteredApplications.map((application) => (
                          <button
                            type="button"
                            key={application.id}
                            className={application.id === applicationId ? 'programme-option selected' : 'programme-option'}
                            onClick={() => {
                              setApplicationId(application.id)
                              setProgrammeOpen(false)
                              setProgrammeSearch('')
                            }}
                            role="option"
                            aria-selected={application.id === applicationId}
                          >
                            <span className="programme-option-icon"><FileSpreadsheet size={15} /></span>
                            <span className="programme-option-copy">
                              <strong>{application.name}</strong>
                              <small>Application programme</small>
                            </span>
                            {application.id === applicationId && <CheckCircle2 size={17} />}
                          </button>
                        )) : (
                          <div className="programme-picker-empty">No programmes match “{programmeSearch}”.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="import-field">
                <div className="import-field-label">
                  <span>Google Forms CSV</span>
                  <span className="import-field-hint">CSV only · Maximum 15 MB</span>
                </div>
                <label className="import-dropzone">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => readFile(event.target.files?.[0] || null)}
                  />
                  <span className="import-upload-icon"><Upload size={20} /></span>
                  <strong>{file ? file.name : 'Choose CSV file'}</strong>
                  <span>{file ? 'File loaded. Click to replace it.' : 'Drag and drop your CSV here, or click to browse.'}</span>
                  <small>Google Forms response exports work best in CSV format.</small>
                </label>
              </div>

              {parsed.headers.length > 0 && (
                <span className="import-dropzone">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => readFile(event.target.files?.[0] || null)}
                  />
                  <Upload size={20} />
                  <strong>{file ? file.name : 'Choose CSV file'}</strong>
                  <span>{file ? 'File loaded.' : 'Export your Google Forms responses as CSV first.'}</span>
                </span>
              </label>

              {parsed.headers.length > 0 && (
                <div className="import-preview">
                  <div className="import-preview-heading">
                    <div>
                      <p className="eyebrow">Preview</p>
                      <h3>{parsed.rows.length.toLocaleString()} responses · {questionHeaders.length} questions</h3>
                    </div>
                    <FileSpreadsheet size={20} />
                  </div>

                  <div className="import-question-list">
                    {questionHeaders.map((header, index) => (
                      <span key={header + index}>{header}</span>
                    ))}
                  </div>

                  <div className="table-wrap import-preview-table">
                    <table>
                      <thead>
                        <tr>
                          {parsed.headers.slice(0, 6).map((header, index) => (
                            <th key={header + index}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.map((row, index) => (
                          <tr key={index}>
                            {parsed.headers.slice(0, 6).map((header, cellIndex) => (
                              <td key={header + cellIndex}>{row[header] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parsed.headers.length > 6 && (
                    <p className="muted import-preview-note">
                      Showing the first 6 columns in the preview. All {parsed.headers.length} columns will be stored.
                    </p>
                  )}

                  {warningCount > 0 && (
                    <div className="import-validation-warning">
                      <div>
                        <strong>Validation warnings</strong>
                        <span>These responses can still be imported.</span>
                      </div>
                      <ul>
                        {validation.nameHeader && validation.missingNames > 0 && (
                          <li>{validation.missingNames.toLocaleString()} response{validation.missingNames === 1 ? ' is' : 's are'} missing a name.</li>
                        )}
                        {validation.emailHeader && validation.missingEmails > 0 && (
                          <li>{validation.missingEmails.toLocaleString()} response{validation.missingEmails === 1 ? ' is' : 's are'} missing an email.</li>
                        )}
                        {validation.emailHeader && validation.invalidEmails > 0 && (
                          <li>{validation.invalidEmails.toLocaleString()} response{validation.invalidEmails === 1 ? ' has' : 's have'} an invalid email address.</li>
                        )}
                        {validation.emailHeader && validation.duplicateEmails > 0 && (
                          <li>{validation.duplicateEmails.toLocaleString()} email{validation.duplicateEmails === 1 ? ' appears' : 's appear'} in multiple responses. These responses will remain separate submissions.</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {(validation.nameHeader || validation.emailHeader) && (
                    <p className="muted import-preview-note">
                      Detected {validation.nameHeader ? 'name' : 'no name'} and {validation.emailHeader ? 'email' : 'no email'} columns automatically. Warnings do not block import.
                    </p>
                  )}
                </div>
              )}

              {error && <div className="form-error">{error}</div>}
            </div>

            <div className="modal-footer">
              <button className="secondary-button" onClick={onClose}>Cancel</button>
              <button
                className="primary-button"
                disabled={busy || !applicationId || !file || !parsed.rows.length}
                onClick={importPreview}
              >
                {busy ? 'Importing…' : 'Import responses'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
