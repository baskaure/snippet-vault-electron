import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Snippet = {
  id: string
  name: string
  description: string
  language: string
  tags: string[]
  code: string
  favorite?: boolean
  notes?: string
  createdAt?: string
}

const FALLBACK_SNIPPETS: Snippet[] = [
  {
    id: 'react-fetch-hook',
    name: 'React Fetch Hook',
    description: 'Hook pour requêtes avec états de chargement/erreur.',
    language: 'TypeScript',
    tags: ['react', 'hooks', 'fetch'],
    code: `import { useEffect, useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function useFetch<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false

    async function run() {
      try {
        setStatus('loading')
        const res = await fetch(url, options)
        if (!res.ok) throw new Error(\`Request failed: \${res.status}\`)
        const json = (await res.json()) as T
        if (!cancelled) {
          setData(json)
          setStatus('success')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error)
          setStatus('error')
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [url, options])

  return { data, status, error }
}
`,
  },
  {
    id: 'center-div-css',
    name: 'Center Div',
    description: 'Centrer un bloc au milieu de la page.',
    language: 'CSS',
    tags: ['css', 'layout'],
    code: `.centered {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}`,
  },
  {
    id: 'sql-connection-pool',
    name: 'SQL Connection Pool',
    description: 'Pool de connexions PostgreSQL avec node-postgres.',
    language: 'SQL / Node.js',
    tags: ['sql', 'postgres', 'node'],
    code: `import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const client = await pool.connect()
  try {
    const res = await client.query<T>(text, params)
    return res.rows
  } finally {
    client.release()
  }
}
`,
  },
  {
    id: 'git-clean-branches',
    name: 'Git Clean Branches',
    description: 'Supprime les branches locales mergées sur main.',
    language: 'Shell',
    tags: ['git', 'cli'],
    code: `git checkout main
git pull
git branch --merged main | egrep -v '(^\\*|main)' | xargs -r git branch -d
`,
  },
]

type ViewMode = 'view' | 'edit' | 'new'
type SidebarFilter = 'all' | 'favorites' | 'recent'

function mapLanguageForHighlight(lang: string): string {
  const normalized = lang.toLowerCase()
  if (normalized.includes('typescript') || normalized === 'ts' || normalized.includes('tsx')) return 'typescript'
  if (normalized.includes('javascript') || normalized === 'js' || normalized.includes('react')) return 'javascript'
  if (normalized.includes('sql')) return 'sql'
  if (normalized.includes('css')) return 'css'
  if (normalized.includes('shell') || normalized.includes('bash')) return 'bash'
  if (normalized.includes('json')) return 'json'
  return 'plaintext'
}

function App() {
  const [query, setQuery] = useState('')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('view')
  const [draft, setDraft] = useState<Snippet | null>(null)
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false

    async function loadSnippets() {
      try {
        setIsLoading(true)
        const result = (await window.ipcRenderer.invoke('get-snippets')) as Snippet[] | undefined
        if (cancelled) return
        if (Array.isArray(result) && result.length > 0) {
          setSnippets(result)
        } else {
          setSnippets(FALLBACK_SNIPPETS)
        }
      } catch (err) {
        console.error('Erreur lors du chargement des snippets', err)
        if (!cancelled) {
          setError("Impossible de charger le fichier local. Utilisation des snippets par défaut.")
          setSnippets(FALLBACK_SNIPPETS)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadSnippets()
    return () => {
      cancelled = true
    }
  }, [])

  const persistSnippets = async (next: Snippet[]) => {
    setSnippets(next)
    try {
      await window.ipcRenderer.invoke('save-snippets', next)
    } catch (err) {
      console.error("Erreur lors de l'enregistrement des snippets", err)
      setError('Impossible de sauvegarder les snippets localement.')
    }
  }

  const languages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const snippet of snippets) {
      if (!snippet.language) continue
      const key = snippet.language
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [snippets])

  const filtered = useMemo(() => {
    let base = [...snippets]

    if (sidebarFilter === 'favorites') {
      base = base.filter((s) => s.favorite)
    } else if (sidebarFilter === 'recent') {
      base = [...base].sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return db - da
      })
    }

    if (languageFilter !== 'all') {
      const target = languageFilter.toLowerCase()
      base = base.filter((s) => s.language.toLowerCase() === target)
    }

    const q = query.trim().toLowerCase()
    if (!q) return base

    return base.filter((snippet) => {
      const haystack =
        `${snippet.name} ${snippet.description} ${snippet.language} ${snippet.tags.join(' ')}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query, snippets, sidebarFilter, languageFilter])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, filtered.length])

  const handleCopy = async (index: number) => {
    const snippet = filtered[index]
    if (!snippet) return
    try {
      await window.ipcRenderer.invoke('copy-snippet-to-clipboard', snippet.code)
    } catch (err) {
      console.error('Erreur lors de la copie du snippet', err)
      setError("Impossible de copier dans le presse-papier.")
    }
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handleCopy(selectedIndex)
    } else if (event.key === 'Escape') {
      window.ipcRenderer.send('hide-window')
    }
  }

  const activeSnippet = filtered[selectedIndex] ?? filtered[0]

  const highlightedCode = useMemo(() => {
    if (!activeSnippet) return ''
    try {
      const language = activeSnippet.language ? mapLanguageForHighlight(activeSnippet.language) : ''
      const code = activeSnippet.code ?? ''
      // Simple "highlighting": indent and escape HTML without external lib
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      if (!language) return escaped
      // Bold some common keywords by language
      const kw = language.toLowerCase()
      if (kw === 'typescript' || kw === 'javascript') {
        return escaped.replace(
          /\b(const|let|function|return|async|await|export|import|from)\b/g,
          '<span class="hljs-keyword">$1</span>',
        )
      }
      if (kw === 'sql') {
        return escaped.replace(
          /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|JOIN)\b/gi,
          '<span class="hljs-keyword">$1</span>',
        )
      }
      if (kw === 'css') {
        return escaped.replace(
          /\b(display|flex|justify-content|align-items|background|color)\b/g,
          '<span class="hljs-attr">$1</span>',
        )
      }
      return escaped
    } catch {
      return (activeSnippet.code ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }
  }, [activeSnippet])

  const beginNewSnippet = () => {
    const now = new Date().toISOString()
    const base: Snippet = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      name: '',
      description: '',
      language: '',
      tags: [],
      code: '',
      createdAt: now,
      favorite: false,
      notes: '',
    }
    setDraft(base)
    setViewMode('new')
  }

  const beginEditSnippet = () => {
    if (!activeSnippet) return
    setDraft({ ...activeSnippet })
    setViewMode('edit')
  }

  const cancelEdit = () => {
    setDraft(null)
    setViewMode('view')
  }

  const commitDraft = async () => {
    if (!draft) return
    const cleaned: Snippet = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      language: draft.language.trim(),
      tags: (draft.tags ?? []).map((t) => t.trim()).filter(Boolean),
      code: draft.code,
    }

    if (!cleaned.name || !cleaned.code) {
      setError('Nom et code sont obligatoires pour un snippet.')
      return
    }

    let next: Snippet[]
    if (viewMode === 'new') {
      next = [cleaned, ...snippets]
      setSelectedIndex(0)
    } else {
      next = snippets.map((s) => (s.id === cleaned.id ? cleaned : s))
    }

    await persistSnippets(next)
    setViewMode('view')
    setDraft(null)
  }

  const toggleFavorite = async () => {
    if (!activeSnippet) return
    const updated = snippets.map((s) =>
      s.id === activeSnippet.id ? { ...s, favorite: !s.favorite } : s,
    )
    await persistSnippets(updated)
  }

  const handleDelete = async () => {
    if (!activeSnippet) return
    const remaining = snippets.filter((s) => s.id !== activeSnippet.id)
    await persistSnippets(remaining)
    setViewMode('view')
    setDraft(null)
    setSelectedIndex(0)
  }

  return (
    <div className='app-root'>
      <div className='spotlight-shell'>
        <header className='spotlight-header'>
          <div className='app-badge'>SV</div>
          <div className='search-shell'>
            <span className='search-icon' aria-hidden='true'>
              ⌕
            </span>
            <input
              autoFocus
              className='search-input'
              placeholder='Search snippets, tags, or code…'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className='shortcut-hint'>
              <span className='kbd'>Ctrl</span>
              <span className='kbd'>+</span>
              <span className='kbd'>Shift</span>
              <span className='kbd'>S</span>
            </div>
          </div>
        </header>

        <div className='body-layout'>
          <aside className='sidebar'>
            <div className='sidebar-header'>
              <span className='sidebar-title'>Snippet Vault</span>
            </div>

            <nav className='sidebar-nav'>
              <button
                type='button'
                className={`nav-item ${sidebarFilter === 'all' ? 'nav-item--active' : ''}`}
                onClick={() => setSidebarFilter('all')}
              >
                <span>Tous les snippets</span>
              </button>
              <button
                type='button'
                className={`nav-item ${sidebarFilter === 'favorites' ? 'nav-item--active' : ''}`}
                onClick={() => setSidebarFilter('favorites')}
              >
                <span>Favoris</span>
              </button>
              <button
                type='button'
                className={`nav-item ${sidebarFilter === 'recent' ? 'nav-item--active' : ''}`}
                onClick={() => setSidebarFilter('recent')}
              >
                <span>Récents</span>
              </button>
            </nav>

            <div className='sidebar-section'>
              <div className='sidebar-section-title'>LANGAGES</div>
              <button
                type='button'
                className={`nav-item nav-item--small ${languageFilter === 'all' ? 'nav-item--active' : ''}`}
                onClick={() => setLanguageFilter('all')}
              >
                <span>Tous</span>
                <span className='badge-count'>{snippets.length}</span>
              </button>
              {languages.map(([lang, count]) => (
                <button
                  key={lang}
                  type='button'
                  className={`nav-item nav-item--small ${
                    languageFilter === lang ? 'nav-item--active' : ''
                  }`}
                  onClick={() => setLanguageFilter(lang)}
                >
                  <span>{lang}</span>
                  <span className='badge-count'>{count}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className='content'>
            <section className='list-pane' aria-label='Résultats des snippets'>
            {isLoading && (
              <div className='status-text'>Chargement des snippets…</div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className='status-text'>Aucun snippet ne correspond à ta recherche.</div>
            )}

            {!isLoading &&
              filtered.map((snippet, index) => {
                const isActive = index === selectedIndex
                return (
                  <button
                    key={snippet.id}
                    type='button'
                    className={`snippet-item ${isActive ? 'snippet-item--active' : ''}`}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleCopy(index)}
                  >
                    <div className='snippet-main'>
                      <div className='snippet-title-row'>
                        <span className='snippet-name'>{snippet.name}</span>
                        <span className='snippet-language'>{snippet.language}</span>
                      </div>
                      <p className='snippet-description'>{snippet.description}</p>
                    </div>
                    <div className='snippet-tags'>
                      {snippet.tags.map((tag) => (
                        <span key={tag} className='tag-pill'>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </section>

            <aside className='detail-pane' aria-label='Détail du snippet'>
            {viewMode === 'view' && activeSnippet && (
              <>
                <div className='detail-header'>
                  <div>
                    <h2 className='detail-title'>{activeSnippet.name}</h2>
                    <p className='detail-meta'>
                      {activeSnippet.language} · {activeSnippet.tags.join(' · ')}
                    </p>
                  </div>
                  <div className='detail-actions'>
                    <button type='button' className='btn-secondary' onClick={toggleFavorite}>
                      {activeSnippet.favorite ? '★ Favori' : '☆ Favori'}
                    </button>
                    <button type='button' className='btn-primary' onClick={beginEditSnippet}>
                      Editer
                    </button>
                  </div>
                </div>
                <div className='code-block'>
                  <pre>
                    <code
                      className='hljs'
                      dangerouslySetInnerHTML={{ __html: highlightedCode || activeSnippet.code }}
                    />
                  </pre>
                </div>
                {activeSnippet.notes && (
                  <p className='detail-note'>{activeSnippet.notes}</p>
                )}
                <div className='detail-footer-row'>
                  <button type='button' className='btn-danger' onClick={handleDelete}>
                    Supprimer le snippet
                  </button>
                </div>
              </>
            )}

            {(viewMode === 'edit' || viewMode === 'new') && draft && (
              <form
                className='snippet-form'
                onSubmit={(e) => {
                  e.preventDefault()
                  void commitDraft()
                }}
              >
                <div className='form-row'>
                  <label>
                    <span>Nom</span>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </label>
                </div>
                <div className='form-row'>
                  <label>
                    <span>Langage</span>
                    <input
                      value={draft.language}
                      onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    />
                  </label>
                </div>
                <div className='form-row'>
                  <label>
                    <span>Tags (séparés par des virgules)</span>
                    <input
                      value={draft.tags.join(', ')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          tags: e.target.value.split(',').map((t) => t.trim()),
                        })
                      }
                    />
                  </label>
                </div>
                <div className='form-row'>
                  <label>
                    <span>Description</span>
                    <input
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                  </label>
                </div>
                <div className='form-row'>
                  <label>
                    <span>Notes</span>
                    <textarea
                      rows={3}
                      value={draft.notes ?? ''}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </label>
                </div>
                <div className='form-row'>
                  <label className='form-code-label'>
                    <span>Code</span>
                    <textarea
                      className='form-code'
                      rows={8}
                      value={draft.code}
                      onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    />
                  </label>
                </div>
                <div className='form-actions'>
                  <button type='button' className='btn-secondary' onClick={cancelEdit}>
                    Annuler
                  </button>
                  <button type='submit' className='btn-primary'>
                    Enregistrer
                  </button>
                </div>
              </form>
            )}

            {viewMode === 'view' && !activeSnippet && (
              <div className='status-text'>Sélectionne un snippet pour prévisualiser le code.</div>
            )}
          </aside>
        </main>
        </div>

        <footer className='footer'>
          <div className='footer-left'>
            <button type='button' className='btn-primary' onClick={beginNewSnippet}>
              + Nouveau snippet
            </button>
          </div>
          <div className='footer-center'>
            <span className='kbd'>Entrée</span>
            <span className='footer-hint-text'>Copier</span>
            <span className='kbd'>↑↓</span>
            <span className='footer-hint-text'>Naviguer</span>
            <span className='kbd'>Esc</span>
            <span className='footer-hint-text'>Fermer</span>
          </div>
          <span className='footer-status'>
            <span className='status-dot' />
            Vault actif
          </span>
        </footer>

        {error && <div className='error-banner'>{error}</div>}
      </div>
    </div>
  )
}

export default App