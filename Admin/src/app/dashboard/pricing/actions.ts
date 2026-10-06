'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, logAuditAction } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function assertCanEdit(role: string): void {
  if (role === 'viewer') throw new Error('Sua conta é somente leitura.')
}

export async function updatePricingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertCanEdit(admin.role)

  const modelId = String(formData.get('model_id') ?? '')
  const inputPrice = Number(formData.get('input_price'))
  const outputPrice = Number(formData.get('output_price'))
  if (!modelId || Number.isNaN(inputPrice) || Number.isNaN(outputPrice)) return

  const supabase = createSupabaseAdminClient()
  await supabase
    .from('model_pricing')
    .update({ input_price_per_million: inputPrice, output_price_per_million: outputPrice })
    .eq('model_id', modelId)

  await logAuditAction(admin, 'update_model_pricing', modelId, { inputPrice, outputPrice })
  revalidatePath('/dashboard/pricing')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/usage')
}

export async function addPricingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertCanEdit(admin.role)

  const provider = String(formData.get('provider') ?? '')
  const modelId = String(formData.get('model_id') ?? '').trim()
  const label = String(formData.get('label') ?? '').trim() || modelId
  const inputPrice = Number(formData.get('input_price')) || 0
  const outputPrice = Number(formData.get('output_price')) || 0
  if (!modelId || !provider) return

  const supabase = createSupabaseAdminClient()
  await supabase.from('model_pricing').insert({
    provider,
    model_id: modelId,
    label,
    input_price_per_million: inputPrice,
    output_price_per_million: outputPrice
  })

  await logAuditAction(admin, 'add_model_pricing', modelId)
  revalidatePath('/dashboard/pricing')
}

export async function deletePricingAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  assertCanEdit(admin.role)

  const modelId = String(formData.get('model_id') ?? '')
  if (!modelId) return

  const supabase = createSupabaseAdminClient()
  await supabase.from('model_pricing').delete().eq('model_id', modelId)

  await logAuditAction(admin, 'delete_model_pricing', modelId)
  revalidatePath('/dashboard/pricing')
}
