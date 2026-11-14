<script setup>
// Импортируем константы границ холста и рамки диаграммы
import { CANVAS, FRAME } from '../composables/useEditor.js'

// Принимаем данные (пропсы) от родительского компонента App.vue
defineProps([
  'breadcrumbs',      // Массив хлебных крошек для навигации по иерархии
  'currentKey',       // Ключ текущей диаграммы ('root' или id блока)
  'diagramType',      // Метка процесса (например, 'AS-IS' или 'TO-BE')
  'currentBlocks',    // Список блоков, находящихся на текущей диаграмме
  'arrowShapes',      // Сформированные геометрические пути и координаты стрелок для SVG
  'blockRects',       // Вычисленные координаты и размеры прямоугольников блоков
  'selectedId',       // ID выбранного в данный момент блока
  'hoveredArrowId',   // ID стрелки, на которую наведен курсор мыши
  'notice',           // Текст временного всплывающего уведомления (тост)
  'isRoot',           // Булево значение: является ли текущая диаграмма корневой (A-0)
  'diagramLabel'      // Функция или строка для получения красивого названия диаграммы
])

// Объявляем события (emits), которые компонент может вызывать для передачи действий родителю
const emit = defineEmits([
  'go-to',              // Переход по хлебным крошкам на другую диаграмму
  'select-id',          // Выбор блока (или сброс выделения при клике на пустой холст)
  'hover-arrow',        // Наведение курсора на стрелку (для подсветки)
  'open-arrow-Model',   // Открытие модального окна настройки стрелки
  'open-block-Model',   // Открытие модального окна редактирования блока (по двойному клику)
  'clear-notice'        // Закрытие/очистка всплывающего уведомления
])
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0">
    
    <!-- НАВИГАЦИОННАЯ ПАНЕЛЬ (Хлебные крошки / Breadcrumbs) -->
    <nav class="bg-slate-50 border-b border-slate-300 px-4 py-2 flex items-center gap-2 text-sm z-30">
      <span class="text-slate-500 mr-1">Диаграмма:</span>
      <template v-for="(item, i) in breadcrumbs" :key="item.key">
        <button
          @click="emit('go-to', item.key)"
          class="transition hover:text-blue-600"
          :class="i === breadcrumbs.length - 1 ? 'text-blue-700 font-bold' : 'text-slate-600'"
        >
          {{ item.label }}
        </button>
        <span v-if="i < breadcrumbs.length - 1" class="text-slate-400">/</span>
      </template>
    </nav>

    <!-- ЦЕНТРАЛЬНАЯ ОБЛАСТЬ ХОЛСТА -->
    <main class="flex-1 relative bg-white min-w-0">
      
      <!-- SVG-ХОЛСТ: масштабируемая векторная графика для отрисовки чертежа IDEF0 -->
      <svg
        class="absolute inset-0 w-full h-full bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]"
        :viewBox="`0 0 ${CANVAS.w} ${CANVAS.h}`"
        preserveAspectRatio="xMidYMid meet"
        font-family="ui-sans-serif, system-ui, sans-serif"
        @click="emit('select-id', null)" <!-- Клик по пустому месту холста сбрасывает выбор блока -->
      >
        <!-- Определение графических элементов (маркеров-стрелок для линий) -->
        <defs>
          <!-- Стандартный маркер стрелки (темно-серый) -->
          <marker id="arrow" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto">
            <polygon points="0 0, 12 5, 0 10" fill="#0f172a" />
          </marker>
          <!-- Активный/подсвеченный маркер стрелки (синий) -->
          <marker id="arrow-active" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto">
            <polygon points="0 0, 12 5, 0 10" fill="#2563eb" />
          </marker>
        </defs>

        <!-- Внешняя рамка диаграммы IDEF0 -->
        <rect :x="FRAME.l" :y="FRAME.t" :width="FRAME.r - FRAME.l" :height="FRAME.b - FRAME.t" fill="none" stroke="#0f172a" stroke-width="2" />
        
        <!-- Текстовая плашка в левом нижнем углу рамки (название диаграммы и метка AS-IS / TO-BE) -->
        <text :x="FRAME.l + 6" :y="FRAME.b + 34" font-size="15" fill="#334155">
          <tspan font-weight="700">{{ diagramLabel(currentKey) }}</tspan>
          <tspan dx="24">Метка: {{ diagramType }}</tspan>
        </text>

        <!-- Сообщение-заглушка, если на холсте еще нет ни одного блока -->
        <text v-if="currentBlocks.length === 0" :x="CANVAS.w / 2" :y="CANVAS.h / 2" text-anchor="middle" font-size="20" fill="#94a3b8" font-style="italic">
          {{ isRoot ? "Диаграмма пуста. Нажмите «Создать блок A0»." : "На диаграмме нет блоков. Нажмите «Добавить блок»." }}
        </text>

        <!-- ОТРИСОВКА СТРЕЛОК -->
        <g
          v-for="s in arrowShapes"
          :key="s.id"
          class="cursor-pointer"
          @click.stop="emit('open-arrow-Model', s.arrow)" <!-- Клик открывает модалку редактирования стрелки -->
          @mouseenter="emit('hover-arrow', s.id)"         <!-- Подсветка стрелки при наведении -->
          @mouseleave="emit('hover-arrow', null)"        <!-- Снятие подсветки при уходе курсора -->
        >
          <!-- Всплывающая подсказка с полным названием стрелки -->
          <title v-if="s.name">{{ s.name }}</title>
          
          <!-- Невидимая широкая линия для удобства клика мышкой по тонким стрелкам -->
          <path :d="s.d" fill="none" stroke="transparent" stroke-width="16" />
          
          <!-- Видимая линия стрелки (меняет цвет на синий при наведении) -->
          <path :d="s.d" fill="none" stroke-width="2.2" stroke-linejoin="round" :stroke="hoveredArrowId === s.id ? '#2563eb' : '#0f172a'" :marker-end="hoveredArrowId === s.id ? 'url(#arrow-active)' : 'url(#arrow)'" />
          
          <!-- Отрисовка тоннельных скобок ( ) у границы, если стрелка туннельная -->
          <g v-if="s.tunnel" :transform="`translate(${s.tunnel.x} ${s.tunnel.y}) rotate(${s.tunnel.angle})`" fill="none" stroke-width="2.2" stroke-linecap="round" :stroke="hoveredArrowId === s.id ? '#2563eb' : '#0f172a'">
            <path d="M -4 -9 Q -12 0 -4 9" />
            <path d="M 4 -9 Q 12 0 4 9" />
          </g>
          
          <!-- Текстовая подпись стрелки посередине отрезка -->
          <text v-if="s.label" :x="s.label.x" :y="s.label.y" :transform="s.label.rotate ? `rotate(-90 ${s.label.x} ${s.label.y})` : null" text-anchor="middle" font-size="12" font-weight="600" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round" :fill="hoveredArrowId === s.id ? '#2563eb' : '#334155'">
            {{ s.label.text }}
          </text>
        </g>

        <!-- ОТРИСОВКА БЛОКОВ (ПРЯМОУГОЛЬНИКОВ ПРОЦЕССОВ) -->
        <g
          v-for="r in blockRects"
          :key="r.id"
          class="cursor-pointer"
          @click.stop="emit('select-id', r.id)"            <!-- Одинарный клик выделяет блок -->
          @dblclick.stop="emit('open-block-Model', r.block)" <!-- Двойной клик открывает модалку переименования -->
        >
          <!-- Прямоугольник блока (цвет меняется на синий, если блок выбран) -->
          <rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" fill="#fff" :stroke="selectedId === r.id ? '#2563eb' : '#0f172a'" :stroke-width="selectedId === r.id ? 3.5 : 2.5" />
          
          <!-- Многострочное название работы внутри блока -->
          <text v-for="(line, i) in r.lines" :key="i" :x="r.x + r.w / 2" :y="r.y + r.h / 2 + (i - (r.lines.length - 1) / 2) * 17 - 4" text-anchor="middle" font-size="14" font-weight="600" fill="#0f172a">
            {{ line }}
          </text>
          
          <!-- Системный код блока в правом нижнем углу (например, A1, A2) -->
          <text :x="r.x + r.w - 8" :y="r.y + r.h - 8" text-anchor="end" font-size="13" font-weight="700" font-family="ui-monospace, monospace" fill="#0f172a">
            {{ r.block.code }}
          </text>
          
          <!-- Индикатор наличия дочерней диаграммы в левом нижнем углу блока -->
          <text v-if="r.hasChild" :x="r.x + 8" :y="r.y + r.h - 8" font-size="12" fill="#2563eb" font-weight="600">
            ↘ есть дочерняя
          </text>
        </g>
      </svg>

      <!-- ВСПЛЫВАЮЩЕЕ УВЕДОМЛЕНИЕ (Тост внизу по центру холста) -->
      <div v-if="notice" role="status" class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded shadow-lg flex items-center gap-3 z-20">
        <span>{{ notice }}</span>
        <button @click="emit('clear-notice')" class="text-slate-300 hover:text-white">✕</button>
      </div>
    </main>
  </div>
</template>