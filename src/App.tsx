import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Snippet = {
  id: string
  name: string
  description: string
  language: string
  tags: string[]
  code: string
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

function App() {
  const [query, setQuery] = useState('')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return snippets
    return snippets.filter((snippet) => {
      const haystack =
        `${snippet.name} ${snippet.description} ${snippet.language} ${snippet.tags.join(' ')}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query, snippets])

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

  return (
    <div className='app-root'>
      <div className='spotlight-shell'>
        <header className='spotlight-header'>
          <div className='app-badge'>SV</div>
          <input
            autoFocus
            className='search-input'
            placeholder='Rechercher un snippet, un tag, un langage…'
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
        </header>

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
            {activeSnippet ? (
              <>
                <div className='detail-header'>
                  <div>
                    <h2 className='detail-title'>{activeSnippet.name}</h2>
                    <p className='detail-meta'>
                      {activeSnippet.language} · {activeSnippet.tags.join(' · ')}
                    </p>
                  </div>
                </div>
                <div className='code-block'>
                  <pre>
                    <code>{activeSnippet.code}</code>
                  </pre>
                </div>
                <p className='detail-note'>
                  Entrée ou clic pour copier le code dans ton presse-papier. Échap pour masquer Snippet Vault.
                </p>
              </>
            ) : (
              <div className='status-text'>Sélectionne un snippet pour prévisualiser le code.</div>
            )}
          </aside>
        </main>

        <footer className='footer'>
          <span className='footer-text'>↑↓ pour naviguer · Entrée pour copier</span>
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