import { create } from 'zustand'
import { supabase } from '@renderer/lib/supabaseClient'
import { useAuthStore } from '@renderer/store/authStore'
import { BUILTIN_SKILLS, type SkillCategory } from '@renderer/lib/skillsCatalog'

export interface SkillItem {
  id: string | null
  slug: string
  name: string
  description: string | null
  category: SkillCategory | null
  isBuiltin: boolean
  contentMd: string | null
  enabled: boolean
}

interface SkillRow {
  id: string
  slug: string
  name: string
  description: string | null
  category: string | null
  is_builtin: boolean
  content_md: string | null
  enabled: boolean
}

interface SkillsState {
  loaded: boolean
  loading: boolean
  skills: SkillItem[]
  load: () => Promise<void>
  toggleSkill: (slug: string) => Promise<void>
  importSkill: (input: { name: string; description: string; contentMd: string }) => Promise<void>
  removeSkill: (slug: string) => Promise<void>
  reset: () => void
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

const DIACRITICS_PATTERN = /[̀-ͯ]/g

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_PATTERN, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'skill'
}

function mergeCatalogWithRows(rows: SkillRow[]): SkillItem[] {
  const rowBySlug = new Map(rows.map((row) => [row.slug, row]))

  const builtinItems: SkillItem[] = BUILTIN_SKILLS.map((skill) => {
    const row = rowBySlug.get(skill.slug)
    return {
      id: row?.id ?? null,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      isBuiltin: true,
      contentMd: null,
      enabled: row ? row.enabled : true
    }
  })

  const customItems: SkillItem[] = rows
    .filter((row) => !row.is_builtin && row.slug !== 'sap-gui-context')
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: null,
      isBuiltin: false,
      contentMd: row.content_md,
      enabled: row.enabled
    }))

  return [...builtinItems, ...customItems]
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  loaded: false,
  loading: false,
  skills: BUILTIN_SKILLS.map((skill) => ({
    id: null,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    isBuiltin: true,
    contentMd: null,
    enabled: true
  })),

  load: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ loading: true })

    const { data } = await supabase.from('user_skills').select('*').eq('user_id', userId)

    set({
      loaded: true,
      loading: false,
      skills: mergeCatalogWithRows((data as SkillRow[] | null) ?? [])
    })
  },

  toggleSkill: async (slug) => {
    const userId = currentUserId()
    if (!userId) return

    const target = get().skills.find((skill) => skill.slug === slug)
    if (!target) return

    const nextEnabled = !target.enabled
    set((state) => ({
      skills: state.skills.map((skill) =>
        skill.slug === slug ? { ...skill, enabled: nextEnabled } : skill
      )
    }))

    const { data } = await supabase
      .from('user_skills')
      .upsert(
        {
          id: target.id ?? undefined,
          user_id: userId,
          slug: target.slug,
          name: target.name,
          description: target.description,
          category: target.category,
          is_builtin: target.isBuiltin,
          content_md: target.contentMd,
          enabled: nextEnabled
        },
        { onConflict: 'user_id,slug' }
      )
      .select('id')
      .single()

    if (data?.id && !target.id) {
      set((state) => ({
        skills: state.skills.map((skill) =>
          skill.slug === slug ? { ...skill, id: data.id } : skill
        )
      }))
    }
  },

  importSkill: async (input) => {
    const userId = currentUserId()
    if (!userId) return

    const existingSlugs = new Set(get().skills.map((skill) => skill.slug))
    let slug = slugify(input.name)
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const { data, error } = await supabase
      .from('user_skills')
      .insert({
        user_id: userId,
        slug,
        name: input.name.trim(),
        description: input.description.trim() || null,
        category: null,
        is_builtin: false,
        content_md: input.contentMd,
        enabled: true
      })
      .select('*')
      .single()

    if (error || !data) return

    const row = data as SkillRow
    set((state) => ({
      skills: [
        ...state.skills,
        {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          category: null,
          isBuiltin: false,
          contentMd: row.content_md,
          enabled: row.enabled
        }
      ]
    }))
  },

  removeSkill: async (slug) => {
    const userId = currentUserId()
    if (!userId) return

    const target = get().skills.find((skill) => skill.slug === slug)
    if (!target || target.isBuiltin) return

    await supabase.from('user_skills').delete().eq('user_id', userId).eq('slug', slug)

    set((state) => ({ skills: state.skills.filter((skill) => skill.slug !== slug) }))
  },

  reset: () =>
    set({
      loaded: false,
      loading: false,
      skills: BUILTIN_SKILLS.map((skill) => ({
        id: null,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        isBuiltin: true,
        contentMd: null,
        enabled: true
      }))
    })
}))
