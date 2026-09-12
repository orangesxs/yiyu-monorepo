import type { Component } from 'vue'
import TxTableCard from './TxTableCard.vue'
import ReportCard from './ReportCard.vue'
import TxCreatedCard from './TxCreatedCard.vue'
import TxUpdatedCard from './TxUpdatedCard.vue'
import TxDeletedCard from './TxDeletedCard.vue'

/** ledger 模块聊天卡片:cardType 与后端 skills.ledger.ts 的 card.cardType 对齐 */
export const ledgerChatCards: Record<string, Component> = {
  'ledger.tx_table': TxTableCard,
  'ledger.report': ReportCard,
  'ledger.tx_created': TxCreatedCard,
  'ledger.tx_updated': TxUpdatedCard,
  'ledger.tx_deleted': TxDeletedCard,
}
