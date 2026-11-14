<script setup>
import { useEditor } from './composables/useEditor.js'

import Header from './components/Header.vue'
import DiagramCanvas from './components/DiagramCanvas.vue'
import Sidebar from './components/Sidebar.vue'
import BlockModel from './components/BlockModel.vue'
import ArrowModel from './components/ArrowModel.vue'
import ValidationModel from './components/ValidationModel.vue'

// Деструктурируем все реактивные свойства и методы из нашего хука useEditor
const {
  diagramType,
  diagrams,
  currentKey,
  selectedId,
  hoveredArrowId,
  isRoot,
  currentBlocks,
  currentArrows,
  selectedBlock,
  canAddBlock,
  canAddArrow,
  breadcrumbs,
  notice,
  inheritedList,
  boundInheritedKeys,
  unboundInherited,
  arrowItems,
  blockModel,
  arrowModel,
  form,
  inheritedFormName,
  replacesSameName,
  availableKinds,
  blockRects,
  arrowShapes,
  issues,
  errorCount,
  validationOpen,
  goTo,
  addBlock,
  saveBlock,
  deleteSelectedBlock,
  decomposeSelected,
  deleteDiagram,
  autoBindInherited,
  setKind,
  openArrowModel,
  saveArrow,
  deleteEditingArrow,
  openBlockModel,
  diagramLabel
} = useEditor()
</script>

<template>
  <div class="h-screen bg-slate-100 text-slate-800 flex flex-col font-sans select-none overflow-hidden">
    <!-- Шапка приложения -->
    <Header
      :diagramType="diagramType"
      :isRoot="isRoot"
      :currentBlocks="currentBlocks"
      :canAddBlock="canAddBlock"
      :canAddArrow="canAddArrow"
      :errorCount="errorCount"
      :issues="issues"
      @update:diagramType="diagramType = $event"
      @add-block="addBlock"
      @open-arrow-Model="openArrowModel()"
      @open-validation="validationOpen = true"
    />

    <div class="flex-1 flex min-h-0">
      <!-- Центральный холст для отрисовки блоков и стрелок -->
      <DiagramCanvas
        :breadcrumbs="breadcrumbs"
        :currentKey="currentKey"
        :diagramType="diagramType"
        :currentBlocks="currentBlocks"
        :arrowShapes="arrowShapes"
        :blockRects="blockRects"
        :selectedId="selectedId"
        :hoveredArrowId="hoveredArrowId"
        :notice="notice"
        :isRoot="isRoot"
        :diagramLabel="diagramLabel"
        @go-to="goTo"
        @select-id="selectedId = $event"
        @hover-arrow="hoveredArrowId = $event"
        @open-arrow-Model="openArrowModel"
        @open-block-Model="openBlockModel"
        @clear-notice="notice = ''"
      />

      <!-- Боковая панель управления выбранным блоком и списком стрелок -->
      <Sidebar
        :selectedBlock="selectedBlock"
        :isRoot="isRoot"
        :inheritedList="inheritedList"
        :boundInheritedKeys="boundInheritedKeys"
        :unboundInherited="unboundInherited"
        :arrowItems="arrowItems"
        :diagrams="diagrams"
        :currentKey="currentKey"
        :hoveredArrowId="hoveredArrowId"
        @open-block-Model="openBlockModel"
        @decompose-selected="decomposeSelected"
        @delete-diagram="deleteDiagram"
        @delete-block="deleteSelectedBlock"
        @auto-bind-inherited="autoBindInherited"
        @open-arrow-Model="openArrowModel"
        @hover-arrow="hoveredArrowId = $event"
      />
    </div>

    <!-- Модальное окно работы с блоком -->
    <BlockModel
      :blockModel="blockModel"
      @save-block="saveBlock"
    />

    <!-- Модальное окно работы со стрелками -->
    <ArrowModel
      :arrowModel="arrowModel"
      :availableKinds="availableKinds"
      :form="form"
      :replacesSameName="replacesSameName"
      :inheritedFormName="inheritedFormName"
      :currentBlocks="currentBlocks"
      :inheritedList="inheritedList"
      :boundInheritedKeys="boundInheritedKeys"
      @set-kind="setKind"
      @save-arrow="saveArrow"
      @delete-editing-arrow="deleteEditingArrow"
    />

    <!-- Модальное окно проверки диаграммы по правилам IDEF0 -->
    <ValidationModel
      :validationOpen="validationOpen"
      :errorCount="errorCount"
      :issues="issues"
      @close="validationOpen = false"
      @go-to="goTo"
    />
  </div>
</template>