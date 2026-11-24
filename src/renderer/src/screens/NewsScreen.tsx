import { FormEvent, useEffect, useRef, useState } from 'react'
import { Heart, Plus, Sparkles, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '@renderer/lib/supabaseClient'
import { fetchApiKey, streamChat } from '@renderer/lib/aiClient'
import { useAuthStore } from '@renderer/store/authStore'
import { useEffectiveModel } from '@renderer/lib/effectiveModel'
import { useAiModelsStore } from '@renderer/store/aiModelsStore'
import './NewsScreen.css'

interface NewsPost {
  id: string
  title: string
  summary: string
  body_md: string
  author_id: string
  published: boolean
  created_at: string
}
interface NewsLike { post_id: string; user_id: string }
const EMPTY = { title: '', summary: '', body_md: '', published: true }

export function NewsScreen(): JSX.Element {
  const { user, role } = useAuthStore()
  const canManage = role === 'MASTER' || role === 'ADMIN'
  const { provider: defaultProvider, model: defaultModel } = useEffectiveModel()
  const availableFor = useAiModelsStore((state) => state.availableFor)
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [likes, setLikes] = useState<NewsLike[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY)
  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef<AbortController | null>(null)

  async function load(): Promise<void> {
    const [postsResult, likesResult] = await Promise.all([
      supabase.from('news_posts').select('id, title, summary, body_md, author_id, published, created_at').order('created_at', { ascending: false }),
      supabase.from('news_likes').select('post_id, user_id')
    ])
    const cause = postsResult.error ?? likesResult.error
    if (cause) { setError(cause.message); return }
    setPosts((postsResult.data ?? []) as NewsPost[])
    setLikes((likesResult.data ?? []) as NewsLike[])
    setError(null)
  }
  useEffect(() => { void load() }, [])

  function openEditor(post?: NewsPost): void {
    setEditingId(post?.id ?? null)
    setDraft(post ? { title: post.title, summary: post.summary, body_md: post.body_md, published: post.published } : EMPTY)
    setPrompt('')
    setPreview(false)
    setError(null)
    setEditorOpen(true)
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!canManage || !user) return
    setBusy(true); setError(null)
    const payload = { title: draft.title.trim(), summary: draft.summary.trim(), body_md: draft.body_md.trim(), published: draft.published }
    const result = editingId
      ? await supabase.from('news_posts').update(payload).eq('id', editingId)
      : await supabase.from('news_posts').insert({ ...payload, author_id: user.id })
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    setEditorOpen(false)
    await load()
  }

  async function remove(postId: string): Promise<void> {
    if (!canManage || !window.confirm('Excluir esta notícia?')) return
    const { error: cause } = await supabase.from('news_posts').delete().eq('id', postId)
    if (cause) setError(cause.message)
    else await load()
  }

  async function toggleLike(postId: string): Promise<void> {
    if (!user) return
    const liked = likes.some((item) => item.post_id === postId && item.user_id === user.id)
    const query = liked
      ? supabase.from('news_likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : supabase.from('news_likes').insert({ post_id: postId, user_id: user.id })
    const { error: cause } = await query
    if (cause) setError(cause.message)
    else await load()
  }

  async function improve(mode: 'create' | 'refine'): Promise<void> {
    if (!user || !defaultProvider || !defaultModel) { setError('Escolha um modelo padrão nas configurações de IA.'); return }
    // Antigravity: login do próprio IDE, sem modelo gerenciado nem RPC de acesso.
    if (defaultProvider !== 'antigravity') {
      if (!availableFor(user.id).some((model) => model.provider === defaultProvider && model.model_id === defaultModel)) {
        setError('O modelo padrão está indisponível para seu usuário.'); return
      }
      const { data: allowed, error: accessError } = await supabase.rpc('can_use_ai_model', { p_provider: defaultProvider, p_model_id: defaultModel })
      if (accessError || !allowed) { setError('O modelo padrão está indisponível para seu usuário.'); return }
    }
    const apiKey = await fetchApiKey(user.id, defaultProvider)
    if (!apiKey) { setError('Chave de API não configurada para o modelo padrão.'); return }
    generation.current?.abort()
    const controller = new AbortController()
    generation.current = controller
    setBusy(true); setError(null)
    let result = ''
    try {
      await streamChat({
        provider: defaultProvider, model: defaultModel, apiKey,
        systemPrompt: 'Você escreve notícias, dicas e guias de uso do Abapfy. Responda apenas com o corpo em Markdown em português. Preserve fatos fornecidos, não invente anúncios ou funcionalidades e não inclua título fora do corpo.',
        messages: [{ role: 'user', content: `${mode === 'create' ? 'Crie' : 'Refine'} o texto da notícia. Instruções: ${prompt || 'Texto claro e útil.'}\nTítulo: ${draft.title}\nResumo: ${draft.summary}\nTexto atual:\n${draft.body_md}` }],
        onDelta: (text) => { result += text; setDraft((current) => ({ ...current, body_md: result })) },
        signal: controller.signal
      })
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message) }
    finally { setBusy(false); generation.current = null }
  }

  return <main className="news-screen">
    <header className="news-header"><div><h1>Notícias</h1><p>Novidades, dicas e uso do Abapfy</p></div>
      {canManage && <button type="button" onClick={() => openEditor()}><Plus size={16} /> Adicionar</button>}
    </header>
    {error && <p className="news-error" role="alert">{error}</p>}
    {posts.length === 0 && <p className="news-empty">Nenhuma notícia publicada ainda.</p>}
    <div className="news-list">{posts.map((post) => {
      const count = likes.filter((item) => item.post_id === post.id).length
      const liked = likes.some((item) => item.post_id === post.id && item.user_id === user?.id)
      return <article className="news-card" key={post.id}>
        <div className="news-card-heading"><div><span className="news-date">{new Date(post.created_at).toLocaleDateString('pt-BR')}{!post.published && ' · Rascunho'}</span><h2>{post.title}</h2></div>
          {canManage && <div className="news-admin-actions"><button type="button" onClick={() => openEditor(post)}>Editar</button><button type="button" onClick={() => void remove(post.id)}>Excluir</button></div>}
        </div>
        {post.summary && <p className="news-summary">{post.summary}</p>}
        <div className="news-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body_md}</ReactMarkdown></div>
        <button type="button" className={`news-like ${liked ? 'news-liked' : ''}`} onClick={() => void toggleLike(post.id)} aria-label={liked ? 'Remover curtida' : 'Curtir notícia'}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /> {count}</button>
      </article>
    })}</div>
    {editorOpen && <div className="news-overlay" onMouseDown={() => { generation.current?.abort(); setEditorOpen(false) }}>
      <div className="news-modal" role="dialog" aria-modal="true" aria-label="Editor de notícia" onMouseDown={(event) => event.stopPropagation()}>
        <div className="news-modal-title"><h2>{editingId ? 'Editar notícia' : 'Adicionar notícia'}</h2><button type="button" onClick={() => { generation.current?.abort(); setEditorOpen(false) }} aria-label="Fechar"><X size={18} /></button></div>
        <form onSubmit={(event) => void save(event)}>
          <label>Título<input required minLength={3} maxLength={180} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Resumo<input value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} /></label>
          <label>Orientações para IA<input placeholder="Tom, público, pontos importantes..." value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
          <div className="news-editor-actions"><button type="button" disabled={busy} onClick={() => void improve('create')}><Sparkles size={14} /> Criar com IA</button><button type="button" disabled={busy || !draft.body_md.trim()} onClick={() => void improve('refine')}><Sparkles size={14} /> Refinar</button><button type="button" onClick={() => setPreview((value) => !value)}>{preview ? 'Editar Markdown' : 'Prévia'}</button></div>
          {preview ? <div className="news-markdown news-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.body_md}</ReactMarkdown></div>
            : <label>Conteúdo Markdown<textarea required rows={15} value={draft.body_md} onChange={(event) => setDraft((current) => ({ ...current, body_md: event.target.value }))} /></label>}
          <label className="news-published"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft((current) => ({ ...current, published: event.target.checked }))} /> Publicar agora</label>
          <div className="news-editor-actions"><button type="button" onClick={() => { generation.current?.abort(); setEditorOpen(false) }}>Cancelar</button><button type="submit" disabled={busy || !draft.title.trim() || !draft.body_md.trim()}>Salvar</button></div>
        </form>
      </div>
    </div>}
  </main>
}
