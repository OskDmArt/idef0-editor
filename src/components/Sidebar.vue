<script setup>
// Импортируем справочник наименований типов стрелок (Вход, Управление, Выход, Механизм)
import { TYPE_NAMES } from '../composables/useEditor.js'

// Принимаем входящие данные (пропсы) из корневого компонента App.vue
defineProps([
  'selectedBlock',      // Объект выбранного в данный момент блока (или null)
  'isRoot',             // Флаг: является ли текущая диаграмма корневой (A-0)
  'inheritedList',      // Список стрелок, унаследованных от родительского блока
  'boundInheritedKeys', // Set-коллекция ключей тех родительских стрелок, которые уже подключены на текущей диаграмме
  'unboundInherited',   // Список еще не подключенных унаследованных стрелок
  'arrowItems',         // Список всех стрелок текущей диаграммы с описанием для боковой панели
  'diagrams',           // Полный словарь всех диаграмм проекта (нужен для проверки дочерних диаграмм)
  'currentKey',         // Ключ текущей открытой диаграммы
  'hoveredArrowId'      // ID стрелки, на которую в данный момент наведен курсор
])

// Объявляем события (emits), которые компонент передает наверх в App.vue
const emit = defineEmits([
  'open-block-Model',    // Запрос на открытие модального окна редактирования блока
  'decompose-selected',  // Запрос на создание или открытие дочерней диаграммы выбранного блока
  'delete-diagram',      // Запрос на удаление дочерней диаграммы
  'delete-block',        // Запрос на удаление выбранного блока
  'auto-bind-inherited', // Запрос на автоматическое подключение оставшихся унаследованных стрелок
  'open-arrow-Model',    // Запрос на открытие модального окна редактирования стрелки
  'hover-arrow'          // Событие наведения мыши на стрелку в списке
])
</script>

<template>
  <!-- Главный контейнер боковой панели (ширина 80, фиксированная ширина, прокрутка) -->
  <aside class="w-80 shrink-0 bg-white border-l border-slate-300 overflow-y-auto text-sm">
    
    <!-- СЕКЦИЯ 1: УПРАВЛЕНИЕ ВЫБРАННЫМ БЛОКОМ -->
    <section class="p-4 border-b border-slate-200">
      <h2 class="font-bold text-slate-900 mb-2">Выбранный блок</h2>
      
      <!-- Если блок выбран, показываем информацию о нем и кнопки управления -->
      <template v-if="selectedBlock">
        <p class="font-mono font-bold text-slate-900">{{ selectedBlock.code }}</p>
        <p class="text-slate-700 mb-3 break-words">{{ selectedBlock.name }}</p>
        
        <div class="flex flex-col gap-2">
          <!-- Кнопка вызова модального окна изменения названия блока -->
          <button @click="emit('open-block-Model', selectedBlock)" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded font-medium transition">
            Изменить название
          </button>
          
          <!-- Кнопка создания/открытия дочерней диаграммы (декомпозиции) -->
          <button @click="emit('decompose-selected')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition">
            {{ diagrams[selectedBlock.id] ? "Открыть дочернюю диаграмму" : "Создать дочернюю диаграмму" }}
          </button>
          
          <!-- Кнопка удаления дочерней диаграммы (появляется только если декомпозиция уже создана) -->
          <button v-if="diagrams[selectedBlock.id]" @click="emit('delete-diagram', selectedBlock.id)" class="px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded font-medium transition">
            Удалить дочернюю диаграмму
          </button>
          
          <!-- Кнопка удаления самого блока -->
          <button @click="emit('delete-block')" class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded font-medium transition">
            Удалить блок
          </button>
        </div>
      </template>
      
      <!-- Если блок не выбран, выводим подсказку -->
      <p v-else class="text-slate-500">
        Выберите блок на диаграмме. Двойной щелчок открывает редактирование названия.
      </p>
    </section>

    <!-- СЕКЦИЯ 2: СТРЕЛКИ РОДИТЕЛЯ (отображается только на дочерних диаграммах, где !isRoot === true) -->
    <section v-if="!isRoot" class="p-4 border-b border-slate-200">
      <h2 class="font-bold text-slate-900 mb-2">Стрелки родителя</h2>
      
      <!-- Если у родительского блока вообще нет стрелок -->
      <p v-if="!inheritedList.length" class="text-slate-500">
        У родительского блока нет стрелок. Добавьте их на родительской диаграмме.
      </p>
      
      <!-- Список унаследованных стрелок с индикатором статуса (подключена / не подключена) -->
      <ul v-else class="space-y-1">
        <li v-for="i in inheritedList" :key="i.key" class="flex justify-between items-center">
          <span><span class="font-mono font-bold">{{ i.code }}</span> · {{ TYPE_NAMES[i.type] }}</span>
          <span class="text-xs font-medium px-2 py-0.5 rounded" :class="boundInheritedKeys.has(i.key) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'">
            {{ boundInheritedKeys.has(i.key) ? "подключена" : "не подключена" }}
          </span>
        </li>
      </ul>
      
      <!-- Кнопка автоматического подключения оставшихся унаследованных стрелок -->
      <button v-if="unboundInherited.length" @click="emit('auto-bind-inherited')" class="mt-3 w-full px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white rounded font-medium transition">
        Подключить автоматически ({{ unboundInherited.length }})
      </button>
      
      <!-- Кнопка удаления текущей дочерней диаграммы целиком -->
      <button @click="emit('delete-diagram', currentKey)" class="mt-3 w-full px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded font-medium transition">
        Удалить эту диаграмму
      </button>
    </section>

    <!-- СЕКЦИЯ 3: СПИСОК ВСЕХ СТРЕЛОК ТЕКУЩЕЙ ДИАГРАММЫ -->
    <section class="p-4 border-b border-slate-200">
      <h2 class="font-bold text-slate-900 mb-2">Стрелки диаграммы</h2>
      
      <p v-if="!arrowItems.length" class="text-slate-500">Стрелок пока нет.</p>
      
      <!-- Интерактивный список стрелок с подсветкой при наведении мыши -->
      <ul v-else class="space-y-1">
        <li v-for="it in arrowItems" :key="it.arrow.id">
          <button
            @click="emit('open-arrow-Model', it.arrow)"
            @mouseenter="emit('hover-arrow', it.arrow.id)"
            @mouseleave="emit('hover-arrow', null)"
            class="w-full text-left px-2 py-1.5 rounded transition hover:bg-blue-50"
            :class="hoveredArrowId === it.arrow.id ? 'bg-blue-50' : ''"
          >
            <!-- Название стрелки (если пустое, выводится курсивом «Без названия») -->
            <span class="font-medium break-words" :class="it.name ? 'text-slate-900' : 'text-slate-400 italic'">{{ it.name || "Без названия" }}</span>
            <!-- Дополнительная информация (тип, направление, связи) -->
            <span class="block text-xs text-slate-500">{{ it.title }} · {{ it.sub }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- СЕКЦИЯ 4: СПРАВОЧНАЯ ИНФОРМАЦИЯ / ПОДСКАЗКИ -->
    <section class="p-4 text-slate-600">
      <h2 class="font-bold text-slate-900 mb-2">Как подключаются стрелки</h2>
      <ul class="space-y-1 text-xs leading-relaxed">
        <li>Вход — к левой грани, управление — к верхней.</li>
        <li>Выход — от правой грани, механизм — к нижней.</li>
        <li>Скобки ( ) у границы — тоннель: стрелки нет на родительской диаграмме.</li>
        <li>Нажмите на стрелку, чтобы изменить или удалить её.</li>
      </ul>
    </section>
  </aside>
</template>