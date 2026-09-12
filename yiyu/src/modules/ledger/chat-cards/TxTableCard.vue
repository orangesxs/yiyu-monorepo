<script setup lang="ts">
import type { CardPayload } from '@/modules/agent/agent-stream'

defineProps<{ payload: CardPayload }>()

type TxRow = { id: string; type: string; amount: number; category: string; date: string; note: string }
</script>

<template>
  <div class="tx-card yiyu-card">
    <p class="tx-card__title">{{ payload.title }}</p>
    <el-table :data="(payload.data.rows as TxRow[]) ?? []" size="small" :show-header="true" style="width: 100%">
      <el-table-column prop="date" label="时间" width="118">
        <template #default="{ row }">{{ row.date.slice(5, 16) }}</template>
      </el-table-column>
      <el-table-column label="分类" min-width="80">
        <template #default="{ row }">{{ row.category }}<span v-if="row.note" class="tx-card__note">·{{ row.note }}</span></template>
      </el-table-column>
      <el-table-column label="金额" width="90" align="right">
        <template #default="{ row }">
          <span class="num" :class="row.type === 'expense' ? 'money-out' : 'money-in'">
            {{ (row.type === 'expense' ? '-' : '+') + row.amount.toFixed(2) }}
          </span>
        </template>
      </el-table-column>
    </el-table>
    <p v-if="(payload.data.total as number) > (payload.data.rows as TxRow[]).length" class="tx-card__more">
      共 {{ payload.data.total }} 笔,对我说"下一页"看更多
    </p>
  </div>
</template>

<style scoped>
.tx-card {
  align-self: stretch;
  padding: 10px 12px;
}
.tx-card__title {
  margin: 0 0 6px;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
}
.tx-card__note {
  color: var(--text-3, #aaa);
  font-size: var(--fs-caption, 12px);
}
.tx-card__more {
  margin: 6px 0 0;
  font-size: var(--fs-caption, 12px);
  color: var(--text-3, #999);
  text-align: center;
}
</style>
