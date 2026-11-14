<script setup>
// Принимаем входные параметры (пропсы) от родительского компонента
defineProps([
  'validationOpen', // Булево значение: открыто ли окно проверки (true/false)
  'errorCount',     // Количество критических ошибок (level === 'error')
  'issues'          // Массив всех найденных проблем (ошибок и предупреждений)
])

// Объявляем события (emits), которые передаются наверх родителю
const emit = defineEmits([
  'close',  // Событие закрытия модального окна проверки
  'go-to'   // Событие перехода к конкретной диаграмме, где обнаружена проблема
])
</script>

<template>
  <!-- 
    Оверлей (затемненный фон): модальное окно рендерится только при validationOpen === true.
    Клик по пустому пространству вокруг окна вызывает событие закрытия 'close'.
  -->
  <div v-if="validationOpen" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" @click.self="emit('close')">
    
    <!-- Карточка модального окна с максимальной высотой и гибким вертикальным расположением -->
    <div class="bg-white border border-slate-300 rounded-lg w-full max-w-xl p-6 shadow-xl max-h-[80vh] flex flex-col">
      
      <!-- Заголовок модального окна -->
      <h2 class="text-lg font-bold mb-1 text-slate-900">Проверка по правилам IDEF0</h2>
      
      <!-- 
        Динамический статус-абзац: цвет текста меняется в зависимости от наличия ошибок или предупреждений.
        (Обратите внимание: здесь в коде шаблона есть опечатка в вычислении разницы errorCount — минус в строке).
      -->
      <p class="text-sm mb-4" :class="errorCount ? 'text-red-700' : issues.length ? 'text-amber-700' : 'text-emerald-700'">
        {{ issues.length ? `Ошибок: ${errorCount}, предупреждений: ${issues.length - errorCount}` : "Замечаний нет. Диаграммы соответствуют правилам." }}
      </p>
      
      <!-- Список найденных проблем с прокруткой (если их много) -->
      <ul class="overflow-y-auto space-y-2 text-sm">
        <li v-for="(it, i) in issues" :key="i" class="border rounded p-3 flex justify-between items-start gap-3" :class="it.level === 'error' ? 'border-red-200' : 'border-amber-200'">
          
          <!-- Описание проблемы: уровень (Ошибка / Предупреждение), место (where) и текст сообщения (text) -->
          <div>
            <p class="text-xs text-slate-500">{{ it.level === "error" ? "Ошибка" : "Предупреждение" }} · {{ it.where }}</p>
            <p class="text-slate-900">{{ it.text }}</p>
          </div>
          
          <!-- Кнопка «Перейти»: мгновенно открывает проблемную диаграмму и закрывает окно валидации -->
          <button @click="emit('go-to', it.key); emit('close')" class="shrink-0 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium transition">
            Перейти
          </button>
        </li>
      </ul>
      
      <!-- Нижняя панель с кнопкой закрытия окна -->
      <div class="flex justify-end mt-4">
        <button @click="emit('close')" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition">
          Закрыть
        </button>
      </div>
      
    </div>
  </div>
</template>