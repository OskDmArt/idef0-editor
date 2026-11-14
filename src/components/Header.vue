<script setup>
import { MAX_CHILD_BLOCKS } from '../composables/useEditor.js'

defineProps([
  'diagramType',
  'isRoot',
  'currentBlocks',
  'canAddBlock',
  'canAddArrow',
  'errorCount',
  'issues'
])

const emit = defineEmits([
  'update:diagramType',
  'add-block',
  'open-arrow-Model',
  'open-validation'
])
</script>

<template>
  <header class="bg-white border-b border-slate-300 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-30">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-bold text-slate-900">Редактор IDEF0</h1>
      <div class="flex rounded border border-slate-300 overflow-hidden text-sm font-semibold" role="group">
        <button
          v-for="t in ['AS-IS', 'TO-BE']"
          :key="t"
          @click="emit('update:diagramType', t)"
          class="px-3 py-1.5 transition"
          :class="diagramType === t ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        @click="emit('add-block')"
        :disabled="!canAddBlock"
        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-sm font-medium transition"
      >
        {{ isRoot ? "Создать блок A0" : `Добавить блок (${currentBlocks.length}/${MAX_CHILD_BLOCKS})` }}
      </button>

      <button
        @click="emit('open-arrow-Model')"
        :disabled="!canAddArrow"
        class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-sm font-medium transition"
      >
        Добавить стрелку
      </button>

      <button
        @click="emit('open-validation')"
        class="px-3 py-1.5 border rounded text-sm font-medium transition flex items-center gap-2"
        :class="errorCount ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : issues.length ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'"
      >
        Проверить диаграмму
        <span
          class="inline-block min-w-[1.25rem] text-center rounded-full text-xs font-bold px-1.5 py-0.5 text-white"
          :class="errorCount ? 'bg-red-600' : issues.length ? 'bg-amber-500' : 'bg-emerald-600'"
        >
          {{ issues.length }}
        </span>
      </button>
    </div>
  </header>
</template>