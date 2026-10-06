import type { SapControlAction } from '../../../shared/sapControl'

/** Guard against repeated input without treating a screenshot difference as proof of success. */
export class SapProgressGuard {
  private previous: { action: SapControlAction; unchanged: boolean } | null = null
  private repeated = 0

  check(action: SapControlAction, previousResult: string): void {
    if (!this.previous) return
    const last = this.previous.action
    const noProgress = this.previous.unchanged || previousResult === 'no_progress' || previousResult === 'uncertain'
    if (!noProgress || last.kind !== action.kind) { this.repeated = 0; return }
    if (action.kind === 'click' && last.kind === 'click') {
      const distance = Math.hypot(action.x! - last.x!, action.y! - last.y!)
      this.repeated = distance <= 16 ? this.repeated + 1 : 0
      if (this.repeated >= 2) throw new Error('Cliques próximos não produziram progresso. O controle foi interrompido; confira foco, campo e captura.')
    } else if (JSON.stringify(action) === JSON.stringify(last)) {
      if (action.kind === 'type_text' || action.kind === 'press_key' && ['ENTER', 'F5', 'F6', 'F7', 'F8', 'BACKSPACE'].includes(action.key ?? '')) {
        throw new Error('A entrada anterior não teve resultado confirmado. Ela não será repetida para evitar duplicação ou nova execução.')
      }
      this.repeated += 1
      if (this.repeated >= 2) throw new Error('A navegação não produziu progresso. Confira o estado da janela SAP.')
    } else { this.repeated = 0 }
  }

  record(action: SapControlAction, unchanged: boolean): void {
    this.previous = { action, unchanged }
  }
}
