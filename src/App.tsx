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

type SidebarFilter = 'all' | 'favorites' | 'recent'

type TopFilter = 'latest' | 'shared' | 'personal' | 'untagged'

type DetailMode = 'view' | 'edit' | 'new'

function languageIconClass(language: string): string {
  const lower = language.toLowerCase()
  if (lower.includes('typescript') || lower.includes('tsx')) return 'icon-ts'
  if (lower.includes('javascript') || lower.includes('js')) return 'icon-js'
  if (lower.includes('css')) return 'icon-css'
  if (lower.includes('sql') || lower.includes('db') || lower.includes('prisma')) return 'icon-db'
  return 'icon-ts'
}

function languageIconLabel(language: string): string {
  const lower = language.toLowerCase()
  if (lower.includes('typescript') || lower.includes('tsx')) return '</>'
  if (lower.includes('javascript') || lower.includes('js')) return 'JS'
  if (lower.includes('css')) return 'CSS'
  if (lower.includes('sql') || lower.includes('db') || lower.includes('prisma')) return '🗄'
  return '</>'
}

function formatCreatedAt(value?: string): string {
  if (!value) return 'Local snippet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Local snippet'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [query, setQuery] = useState('')
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>('all')
  const [topFilter, setTopFilter] = useState<TopFilter>('latest')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailMode, setDetailMode] = useState<DetailMode>('view')
  const [draft, setDraft] = useState<Snippet | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSnippets() {
      try {
        setIsLoading(true)
        const result = (await window.ipcRenderer.invoke('get-snippets')) as Snippet[] | undefined
        if (cancelled) return
        if (Array.isArray(result)) {
          setSnippets(result)
          if (result.length > 0) setActiveId(result[0].id)
        } else {
          setSnippets([])
        }
      } catch (err) {
        console.error('Erreur lors du chargement des snippets', err)
        if (!cancelled) {
          setError("Impossible de charger les snippets locaux.")
          setSnippets([])
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
      setError("Impossible de sauvegarder les snippets localement.")
    }
  }

  const languages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const snippet of snippets) {
      const key = snippet.language || 'Unknown'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [snippets])

  const filtered = useMemo(() => {
    let base = [...snippets]

    if (sidebarFilter === 'favorites') {
      base = base.filter((s) => s.favorite)
    } else if (sidebarFilter === 'recent') {
      base.sort((a, b) => {
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
    if (q) {
      base = base.filter((snippet) => {
        const haystack = `${snippet.name} ${snippet.description} ${snippet.language} ${snippet.tags.join(
          ' ',
        )}`.toLowerCase()
        return haystack.includes(q)
      })
    }

    // Filtres avancés
    if (topFilter === 'untagged') {
      base = base.filter((s) => !s.tags || s.tags.length === 0)
    } else if (topFilter === 'shared') {
      base = base.filter((s) =>
        (s.tags ?? []).some((tag) => {
          const t = tag.toLowerCase()
          return t === 'shared' || t === 'share'
        }),
      )
    } else if (topFilter === 'personal') {
      base = base.filter((s) =>
        !(s.tags ?? []).some((tag) => {
          const t = tag.toLowerCase()
          return t === 'shared' || t === 'share'
        }),
      )
    } else if (topFilter === 'latest') {
      base = [...base].sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return db - da
      })
    }

    return base
  }, [snippets, sidebarFilter, languageFilter, query, topFilter])

  const activeSnippet = useMemo(() => {
    if (filtered.length === 0) return undefined
    if (!activeId) return filtered[0]
    const match = filtered.find((s) => s.id === activeId)
    return match ?? filtered[0]
  }, [filtered, activeId])

  useEffect(() => {
    if (!activeSnippet) {
      setActiveId(null)
      return
    }
    setActiveId((prev) => prev ?? activeSnippet.id)
  }, [activeSnippet])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(id)
  }, [toast])

  const handleCopyActive = async () => {
    if (!activeSnippet) return
    try {
      await window.ipcRenderer.invoke('copy-snippet-to-clipboard', activeSnippet.code)
      showToast('Snippet copié dans le presse-papier')
    } catch (err) {
      console.error('Erreur lors de la copie du snippet', err)
      setError("Impossible de copier dans le presse-papier.")
      showToast("Impossible de copier dans le presse-papier.", 'error')
    }
  }

  const handleCardClick = (snippet: Snippet) => {
    setActiveId(snippet.id)
  }

  // Raccourcis clavier globaux (navigation + copie + fermeture)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      // Ne perturbe pas la saisie dans les formulaires d'édition
      if (detailMode !== 'view' && isTypingTarget) return

      if (event.key === 'Escape') {
        event.preventDefault()
        window.ipcRenderer.send('hide-window')
        return
      }

      if (event.key === 'Enter') {
        // Copie le snippet actif
        event.preventDefault()
        void handleCopyActive()
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // Navigation dans la liste
        if (filtered.length === 0) return
        event.preventDefault()
        const currentIndex = activeId ? filtered.findIndex((s) => s.id === activeId) : -1
        let nextIndex = currentIndex
        if (event.key === 'ArrowDown') {
          nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % filtered.length
        } else {
          nextIndex =
            currentIndex < 0 ? filtered.length - 1 : (currentIndex - 1 + filtered.length) % filtered.length
        }
        setActiveId(filtered[nextIndex].id)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, activeId, detailMode, handleCopyActive])

  const toggleFavorite = async (id: string) => {
    const updated = snippets.map((s) =>
      s.id === id ? { ...s, favorite: !s.favorite } : s,
    )
    await persistSnippets(updated)
    showToast('État favori mis à jour')
  }

  const beginNewSnippet = () => {
    const now = new Date().toISOString()
    const base: Snippet = {
      id: `${Date.now()}`,
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
    setDetailMode('new')
    setActiveId(base.id)
  }

  const beginEditSnippet = () => {
    if (!activeSnippet) return
    setDraft({ ...activeSnippet })
    setDetailMode('edit')
  }

  const cancelEdit = () => {
    setDetailMode('view')
    setDraft(null)
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
      const msg = 'Nom et code sont obligatoires pour un snippet.'
      setError(msg)
      showToast(msg, 'error')
      return
    }

    let next: Snippet[]
    if (detailMode === 'new') {
      next = [cleaned, ...snippets]
    } else {
      next = snippets.map((s) => (s.id === cleaned.id ? cleaned : s))
    }

    await persistSnippets(next)
    setActiveId(cleaned.id)
    setDetailMode('view')
    setDraft(null)
    showToast(detailMode === 'new' ? 'Snippet créé' : 'Snippet mis à jour')
  }

  const deleteActiveSnippet = async () => {
    if (!activeSnippet) return
    const ok = window.confirm(`Supprimer le snippet "${activeSnippet.name}" ?`)
    if (!ok) return
    const next = snippets.filter((s) => s.id !== activeSnippet.id)
    await persistSnippets(next)
    if (next.length > 0) {
      setActiveId(next[0].id)
    } else {
      setActiveId(null)
    }
    setDetailMode('view')
    setDraft(null)
    showToast('Snippet supprimé')
  }

  return (
    <div className="app-root">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          Snippet Vault
        </div>

        <nav className="nav-section">
          <button
            type="button"
            className={`nav-item ${sidebarFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSidebarFilter('all')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            All Snippets
          </button>
          <button
            type="button"
            className={`nav-item ${sidebarFilter === 'favorites' ? 'active' : ''}`}
            onClick={() => setSidebarFilter('favorites')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Favorites
          </button>
          <button
            type="button"
            className={`nav-item ${sidebarFilter === 'recent' ? 'active' : ''}`}
            onClick={() => setSidebarFilter('recent')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Recent
          </button>
        </nav>

        <div className="section-label">Languages</div>
        <button
          type="button"
          className={`lang-item ${languageFilter === 'all' ? 'active' : ''}`}
          onClick={() => setLanguageFilter('all')}
        >
          <span className="lang-dot" style={{ background: '#f5c842' }} />
          All
          <span className="lang-count">{snippets.length}</span>
        </button>
        {languages.map(([lang, count]) => (
          <button
            key={lang}
            type="button"
            className={`lang-item ${languageFilter === lang ? 'active' : ''}`}
            onClick={() => setLanguageFilter(lang)}
          >
            <span className="lang-dot" />
            {lang}
            <span className="lang-count">{count}</span>
          </button>
        ))}

        <button className="new-btn" type="button" onClick={beginNewSnippet}>
          + New Snippet
        </button>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="topbar">
          <div className="search-wrap">
            <span className="search-icon">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search snippets, tags, or code… "
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <span className="kbd">⌘K</span>
          </div>
        </div>

        <div className="filters-bar">
          <span className="filters-label">Filters:</span>
          <button
            type="button"
            className={`filter-chip ${topFilter === 'latest' ? 'active' : ''}`}
            onClick={() => setTopFilter('latest')}
          >
            Latest
          </button>
          <button
            type="button"
            className={`filter-chip ${topFilter === 'shared' ? 'active' : ''}`}
            onClick={() => setTopFilter('shared')}
          >
            Shared
          </button>
          <button
            type="button"
            className={`filter-chip ${topFilter === 'personal' ? 'active' : ''}`}
            onClick={() => setTopFilter('personal')}
          >
            Personal
          </button>
          <button
            type="button"
            className={`filter-chip ${topFilter === 'untagged' ? 'active' : ''}`}
            onClick={() => setTopFilter('untagged')}
          >
            Untagged
          </button>
        </div>

        <div className="grid-area">
          {isLoading && <div className="status-text">Chargement des snippets…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="status-text">Aucun snippet ne correspond à ta recherche.</div>
          )}
          <div className="snippet-grid">
            {filtered.map((snippet) => {
              const isActive = activeSnippet?.id === snippet.id
              const iconClass = languageIconClass(snippet.language)
              const iconLabel = languageIconLabel(snippet.language)
              const preview =
                snippet.code.length > 200 ? `${snippet.code.slice(0, 200)}…` : snippet.code

              return (
                <button
                  type="button"
                  key={snippet.id}
                  className={`card ${isActive ? 'active' : ''}`}
                  onClick={() => handleCardClick(snippet)}
                >
                  <div className="card-header">
                    <div className={`card-lang-icon ${iconClass}`}>{iconLabel}</div>
                    <div className="card-title-wrap">
                      <div className="card-title">{snippet.name}</div>
                      <div className="card-lang">{snippet.language}</div>
                    </div>
                    <button
                      type="button"
                      className={`star-btn ${snippet.favorite ? 'starred' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleFavorite(snippet.id)
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill={snippet.favorite ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  </div>
                  <div className="card-code">{preview}</div>
                  <div className="card-footer">
                    {snippet.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                    {snippet.createdAt && (
                      <span className="card-time">{formatCreatedAt(snippet.createdAt)}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </main>

      {/* DETAIL PANEL */}
      <aside className="detail">
        <div className="detail-header">
          <span className="active-badge">
            {activeSnippet ? 'Active Snippet' : 'Aucun snippet sélectionné'}
          </span>
          <div className="detail-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={deleteActiveSnippet}
              title="Supprimer le snippet"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>
        </div>

        <div className="detail-body">
          {detailMode !== 'view' && draft ? (
            <form
              className="edit-form"
              onSubmit={(e) => {
                e.preventDefault()
                void commitDraft()
              }}
            >
              <div className="edit-row">
                <label>
                  <span className="edit-label">Name</span>
                  <input
                    className="edit-input"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
              </div>
              <div className="edit-row">
                <label>
                  <span className="edit-label">Language</span>
                  <input
                    className="edit-input"
                    value={draft.language}
                    onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                  />
                </label>
              </div>
              <div className="edit-row">
                <label>
                  <span className="edit-label">Tags (séparés par des virgules)</span>
                  <input
                    className="edit-input"
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
              <div className="edit-row">
                <label>
                  <span className="edit-label">Description</span>
                  <input
                    className="edit-input"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
              </div>
              <div className="edit-row">
                <label>
                  <span className="edit-label">Notes</span>
                  <textarea
                    className="edit-textarea"
                    rows={3}
                    value={draft.notes ?? ''}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </label>
              </div>
              <div className="edit-row">
                <label>
                  <span className="edit-label">Code</span>
                  <textarea
                    className="edit-textarea code-textarea"
                    rows={10}
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="button" className="action-btn btn-secondary" onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="submit" className="action-btn btn-primary">
                  Save Snippet
                </button>
              </div>
            </form>
          ) : activeSnippet ? (
            <>
              <div className="detail-title">{activeSnippet.name}</div>
              <div className="detail-meta">
                <span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Created {formatCreatedAt(activeSnippet.createdAt)}
                </span>
                <span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {activeSnippet.language}
                </span>
              </div>

              <button className="action-btn btn-primary" type="button" onClick={handleCopyActive}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Code
              </button>
              <button
                className="action-btn btn-secondary"
                type="button"
                onClick={beginEditSnippet}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Snippet
              </button>

              <div className="section-head">
                <span className="section-head-label">Code</span>
                <span className="lang-badge">{activeSnippet.language}</span>
              </div>

              <div className="code-block">
                <pre>
                  <code>{activeSnippet.code}</code>
                </pre>
              </div>

              <div className="section-head" style={{ marginTop: 22 }}>
                <span className="section-head-label">Tags</span>
              </div>
              <div className="tags-wrap">
                {activeSnippet.tags.map((tag) => (
                  <span key={tag} className="detail-tag">
                    {tag}
                  </span>
                ))}
                <div className="add-tag-btn">+</div>
              </div>

              <div className="section-head" style={{ marginTop: 22 }}>
                <span className="section-head-label">Notes</span>
              </div>
              <div className="notes-text">
                {activeSnippet.notes || 'Aucune note pour ce snippet pour le moment.'}
              </div>
            </>
          ) : (
            <div className="status-text">
              Ajoute ou sélectionne un snippet pour voir les détails.
            </div>
          )}
        </div>
      </aside>

      {error && <div className="error-banner">{error}</div>}
      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App