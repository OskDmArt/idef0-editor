<script setup>
// Принимаем единственный пропс 'blockModel' от родительского компонента.
// Внутри объекта blockModel хранятся: open (состояние видимости), id, code (номер A1, A2 и т.д.), name и текст ошибки.
defineProps(['blockModel'])

// Объявляем событие 'save-block', которое сообразно клику или нажатию Enter будет передано наверх в родитель.
const emit = defineEmits(['save-block'])
</script>

<template>
  <!-- 
    Оверлей модального окна: 
    Оно рендерится на экране только тогда, когда blockModel.open равно true.
    Модификатор @click.self позволяет закрыть модалку по клику на темный фон вокруг белого окна.
  -->
  <div v-if="blockModel.open" class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" @click.self="blockModel.open = false">
    
    <!-- Белая карточка модального окна с тенью и скруглениями -->
    <div class="bg-white border border-slate-300 rounded-lg w-full max-w-md p-6 shadow-xl">
      
      <!-- Динамический заголовок, отображающий текущий системный номер блока (например, «Блок A1») -->
      <h2 class="text-lg font-bold mb-4 text-slate-900">Блок {{ blockModel.code }}</h2>
      
      <!-- Метка для поля ввода названия -->
      <label class="block text-sm text-slate-600 mb-1">Название работы</label>
      
      <!-- Поле ввода с двусторонней связью (v-model) напрямую изменяет имя блока в объекте -->
      <input
        v-model="blockModel.name"
        type="text"
        maxlength="80"
        @keyup.enter="emit('save-block')"
        class="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-900 focus:outline-none focus:border-blue-600"
      />
      
      <!-- Информационная подсказка о том, что кодировка узлов формируется автоматически -->
      <p class="text-xs text-slate-500 mt-2">
        Номер {{ blockModel.code }} присваивается автоматически по месту блока в иерархии.
      </p>
      
      <!-- Блок вывода ошибки валидации (например, если пользователь попытался сохранить пустое поле) -->
      <p v-if="blockModel.error" class="text-sm text-red-600 mt-2">{{ blockModel.error }}</p>
      
      <!-- Панель с кнопками управления в нижней части окна -->
      <div class="flex justify-end gap-2 mt-6">
        
        <!-- Кнопка «Отмена»: просто переключает флаг open в false, скрывая модалку без сохранения -->
        <button @click="blockModel.open = false" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition">
          Отмена
        </button>
        
        <!-- Кнопка «Сохранить»: отправляет сигнал наверх родителю для применения изменений -->
        <button @click="emit('save-block')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition">
          Сохранить
        </button>
        
      </div>
    </div>
  </div>
</template>