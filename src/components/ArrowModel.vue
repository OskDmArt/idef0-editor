<script setup>
// Импортируем необходимые константы и словари типов из файла логики
import { MAX_NAME_LEN, TYPE_NAMES } from '../composables/useEditor.js'

// Принимаем входящие данные (пропсы) от родительского компонента App.vue
defineProps([
  'arrowModel',          // Состояние модалки: открыта ли (open), ID редактируемой стрелки (editingId), текст ошибки
  'availableKinds',      // Доступные для выбора типы/виды стрелок в текущем контексте
  'form',                // Данные формы (какую стрелку создаем/редактируем: имя, тип, откуда, куда)
  'replacesSameName',    // Флаг: заменяет ли текущая стрелка старую с таким же именем
  'inheritedFormName',   // Имя родительской стрелки (если это унаследованная стрелка)
  'currentBlocks',       // Список блоков текущей диаграммы (для выпадающих списков)
  'inheritedList',       // Список стрелок родительского уровня
  'boundInheritedKeys'   // Ключи уже подключенных унаследованных стрелок
])

// Объявляем события, которые этот компонент может отправлять наверх в App.vue
const emit = defineEmits(['set-kind', 'save-arrow', 'delete-editing-arrow'])
</script>

<template>
  <!-- Оверлей (темный фон): модальное окно рендерится, только если arrowModel.open == true -->
  <div v-if="arrowModel.open" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" @click.self="arrowModel.open = false">
    <div class="bg-white border border-slate-300 rounded-lg w-full max-w-md p-6 shadow-xl">
      
      <!-- Заголовок окна: меняется в зависимости от режима (создание или редактирование) -->
      <h2 class="text-lg font-bold mb-4 text-slate-900">
        {{ arrowModel.editingId !== null ? "Редактирование стрелки" : "Новая стрелка" }}
      </h2>

      <!-- Переключатель видов/типов стрелок (если их больше одного варианта) -->
      <div v-if="availableKinds.length > 1" class="flex rounded border border-slate-300 overflow-hidden text-sm font-medium mb-4">
        <button
          v-for="k in availableKinds"
          :key="k.value"
          @click="emit('set-kind', k.value)"
          class="flex-1 px-2 py-1.5 transition"
          :class="form.kind === k.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'"
        >
          {{ k.label }}
        </button>
      </div>

      <!-- Основная форма настройки стрелки -->
      <div class="space-y-4 text-sm">
        
        <!-- Блок ввода названия (скрыт для унаследованных стрелок, так как их имя берется у родителя) -->
        <div v-if="form.kind !== 'inherited'">
          <label class="block text-slate-600 mb-1">Название стрелки</label>
          <input
            v-model="form.name"
            type="text"
            :maxlength="MAX_NAME_LEN"
            @keyup.enter="emit('save-arrow')"
            placeholder="например, Заявка клиента"
            class="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-900 focus:outline-none focus:border-blue-600"
          />
          <!-- Подсказка о замене дубликатов с тем же именем -->
          <p v-if="replacesSameName" class="text-xs text-slate-500 mt-1">
            Вход или выход с таким же названием заменит уже существующий.
          </p>
        </div>
        
        <!-- Отображение имени для унаследованных стрелок (только для чтения) -->
        <div v-else>
          <span class="block text-slate-600 mb-1">Название стрелки</span>
          <p class="bg-slate-100 border border-slate-200 rounded p-2" :class="inheritedFormName ? 'text-slate-900' : 'text-slate-400 italic'">
            {{ inheritedFormName || "Без названия" }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            Название задаётся на родительской диаграмме и совпадает на обеих.
          </p>
        </div>

        <!-- КОНТЕКСТНАЯ ЧАСТЬ 1: Настройки для внутренней стрелки (между блоками) -->
        <template v-if="form.kind === 'internal'">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-600 mb-1">Откуда (выход)</label>
              <select v-model.number="form.fromId" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
                <option v-for="b in currentBlocks" :key="b.id" :value="b.id">{{ b.code }} — {{ b.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-600 mb-1">Куда</label>
              <select v-model.number="form.toId" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
                <option v-for="b in currentBlocks" :key="b.id" :value="b.id">{{ b.code }} — {{ b.name }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-slate-600 mb-1">Подключить к грани приёмника</label>
            <select v-model="form.port" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
              <option value="I">Левая — вход</option>
              <option value="C">Верхняя — управление</option>
            </select>
          </div>
        </template>

        <!-- КОНТЕКСТНАЯ ЧАСТЬ 2: Настройки для унаследованной стрелки от родителя -->
        <template v-else-if="form.kind === 'inherited'">
          <div>
            <label class="block text-slate-600 mb-1">Стрелка родителя</label>
            <select v-model.number="form.parentKey" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
              <option v-for="i in inheritedList" :key="i.key" :value="i.key">
                {{ i.code }} — {{ TYPE_NAMES[i.type] }}{{ boundInheritedKeys.has(i.key) ? " (уже подключена)" : "" }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-slate-600 mb-1">Подключить к блоку</label>
            <select v-model.number="form.blockId" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
              <option v-for="b in currentBlocks" :key="b.id" :value="b.id">{{ b.code }} — {{ b.name }}</option>
            </select>
          </div>
        </template>

        <!-- КОНТЕКСТНАЯ ЧАСТЬ 3: Настройки для граничных или тоннельных стрелок -->
        <template v-else>
          <div>
            <label class="block text-slate-600 mb-1">Тип стрелки</label>
            <select v-model="form.type" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
              <option value="I">Вход — слева</option>
              <option value="C">Управление — сверху</option>
              <option value="O">Выход — справа</option>
              <option value="M">Механизм — снизу</option>
            </select>
          </div>
          <!-- Дополнительный выбор блока, если это тоннель -->
          <div v-if="form.kind === 'tunnel'">
            <label class="block text-slate-600 mb-1">Блок</label>
            <select v-model.number="form.blockId" class="w-full bg-slate-50 border border-slate-300 rounded p-2">
              <option v-for="b in currentBlocks" :key="b.id" :value="b.id">{{ b.code }} — {{ b.name }}</option>
            </select>
          </div>
        </template>

        <!-- Вывод текста ошибки валидации, если она возникла при сохранении -->
        <p v-if="arrowModel.error" class="text-red-600">{{ arrowModel.error }}</p>
      </div>

      <!-- Нижняя панель с кнопками управления (Удалить, Отмена, Сохранить) -->
      <div class="flex justify-between items-center mt-6">
        <!-- Кнопка удаления отображается только в режиме редактирования существующей стрелки -->
        <button v-if="arrowModel.editingId !== null" @click="emit('delete-editing-arrow')" class="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm rounded font-medium transition">
          Удалить
        </button>
        <div v-else></div> <!-- Пустой блок для выравнивания, если кнопки удаления нет -->
        
        <div class="flex gap-2">
          <!-- Закрытие модального окна без сохранения -->
          <button @click="arrowModel.open = false" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition">
            Отмена
          </button>
          <!-- Кнопка вызова сохранения стрелки -->
          <button @click="emit('save-arrow')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition">
            Сохранить
          </button>
        </div>
      </div>
      
    </div>
  </div>
</template>