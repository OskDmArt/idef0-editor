<script setup>
import { ref, computed } from "vue";

/* ==========================================================================
   КОНСТАНТЫ
   ========================================================================== */

// Размер холста (viewBox) и рамка диаграммы. Границы рамки — это «воздух»,
// откуда приходят и куда уходят граничные стрелки.
const CANVAS = { w: 1520, h: 940 };
const FRAME = { l: 10, t: 10, r: 1510, b: 870 };

// Корневой блок A0 — по центру. Дочерние блоки — лесенкой от левого верхнего
// угла к правому нижнему.
const ROOT_BLOCK = { w: 400, h: 200 };
const CHILD_BLOCK = { w: 180, h: 90, x0: 150, y0: 110, dx: 215, dy: 120 };

// Правило IDEF0: декомпозиция содержит от 3 до 6 блоков.
const MIN_CHILD_BLOCKS = 3;
const MAX_CHILD_BLOCKS = 6;

const TYPE_NAMES = { I: "Вход", C: "Управление", O: "Выход", M: "Механизм" };
// Грань блока, к которой подключается стрелка данного типа.
const SIDE_BY_TYPE = { I: "L", C: "T", O: "R", M: "B" };

/* ==========================================================================
   СОСТОЯНИЕ
   ==========================================================================
   diagrams — все диаграммы проекта. Ключ диаграммы:
     'root'   — контекстная диаграмма A-0 (в ней один блок A0);
     <id блока> — дочерняя диаграмма, на которую декомпозирован этот блок.
   Привязка дочернего листа к родительскому блоку — это сам ключ + parentKey.

   Стрелки диаграммы (без каких-либо текстовых данных):
     { id, kind: 'internal', fromId, toId, port: 'I' | 'C' }
         между блоками: правая грань источника → левая (I) или верхняя (C) грань приёмника
     { id, kind: 'boundary', type: 'I'|'C'|'O'|'M', blockId, parentKey, tunnel }
         граничная: parentKey — стрелка родителя (унаследована) или null;
         tunnel = true — тоннельная (на родителе её нет)
   ========================================================================== */

const diagramType = ref("AS-IS");
const diagrams = ref({
  root: { key: "root", parentKey: null, blocks: [], arrows: [] },
});
const currentKey = ref("root");

let blockSeq = 1;
let arrowSeq = 1;

const selectedId = ref(null);
const hoveredArrowId = ref(null);

const isRoot = computed(() => currentKey.value === "root");
const currentDiagram = computed(() => diagrams.value[currentKey.value]);
const currentBlocks = computed(() => currentDiagram.value.blocks);
const currentArrows = computed(() => currentDiagram.value.arrows);
const selectedBlock = computed(
  () => currentBlocks.value.find((b) => b.id === selectedId.value) || null,
);

const canAddBlock = computed(() =>
  isRoot.value
    ? currentBlocks.value.length < 1
    : currentBlocks.value.length < MAX_CHILD_BLOCKS,
);

/* ==========================================================================
   ВСПОМОГАТЕЛЬНОЕ: поиск, подписи, навигация
   ========================================================================== */

const findBlock = (id) => {
  for (const d of Object.values(diagrams.value)) {
    const b = d.blocks.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
};

const diagramLabel = (key) => {
  if (key === "root") return "A-0 · Контекстная диаграмма";
  const b = findBlock(key);
  return b ? `${b.code} · ${b.name}` : "—";
};

const breadcrumbs = computed(() => {
  const chain = [];
  let k = currentKey.value;
  while (k !== null && diagrams.value[k]) {
    chain.unshift({ key: k, label: diagramLabel(k) });
    k = diagrams.value[k].parentKey;
  }
  return chain;
});

const goTo = (key) => {
  if (!diagrams.value[key]) return;
  currentKey.value = key;
  selectedId.value = null;
  hoveredArrowId.value = null;
};

/* ==========================================================================
   ЦЕЛОСТНОСТЬ ДАННЫХ: нумерация, каскадное удаление, наследование стрелок
   ========================================================================== */

// Номера блоков по правилам узлов IDEF0: A0 → A1..A6 → A11..A16 и т.д.
const renumber = (key, parentCode) => {
  const d = diagrams.value[key];
  if (!d) return;
  d.blocks.forEach((b, i) => {
    if (key === "root") b.code = "A0";
    else b.code = parentCode === "A0" ? `A${i + 1}` : `${parentCode}${i + 1}`;
    renumber(b.id, b.code);
  });
};

const removeDiagram = (key) => {
  const d = diagrams.value[key];
  if (!d) return;
  d.blocks.forEach((b) => removeDiagram(b.id));
  delete diagrams.value[key];
};

// Стрелки, которые родительская диаграмма «передаёт» дочерней:
// все стрелки, подключённые к блоку-родителю на листе выше.
const getInherited = (key) => {
  const d = diagrams.value[key];
  if (!d || d.parentKey === null) return [];
  const parent = diagrams.value[d.parentKey];
  if (!parent) return [];

  const raw = [];
  for (const a of parent.arrows) {
    if (a.kind === "internal") {
      if (a.toId === key)
        raw.push({ key: a.id, type: a.port }); // вход или управление
      else if (a.fromId === key) raw.push({ key: a.id, type: "O" }); // выход
    } else if (a.blockId === key) {
      raw.push({ key: a.id, type: a.type });
    }
  }
  raw.sort((p, q) => p.key - q.key);

  const counters = { I: 0, C: 0, O: 0, M: 0 };
  return raw.map((r) => ({ ...r, code: `${r.type}${++counters[r.type]}` }));
};

// Убираем «осиротевшие» стрелки и синхронизируем типы унаследованных.
// Обход сверху вниз: изменения родителя влияют на детей.
const pruneDiagram = (key) => {
  const d = diagrams.value[key];
  if (!d) return;
  const ids = new Set(d.blocks.map((b) => b.id));
  const inherited = new Map(getInherited(key).map((i) => [i.key, i]));

  d.arrows = d.arrows.filter((a) => {
    if (a.kind === "internal") {
      return ids.has(a.fromId) && ids.has(a.toId) && a.fromId !== a.toId;
    }
    if (!ids.has(a.blockId)) return false;
    if (key === "root") {
      a.parentKey = null;
      a.tunnel = false;
      return true;
    }
    if (a.parentKey !== null) {
      const inh = inherited.get(a.parentKey);
      if (!inh) return false;
      a.type = inh.type;
      a.tunnel = false;
      return true;
    }
    return a.tunnel === true;
  });

  d.blocks.forEach((b) => pruneDiagram(b.id));
};

const normalize = () => {
  pruneDiagram("root");
  renumber("root", "");
};

/* ==========================================================================
   БЛОКИ
   ========================================================================== */

const pushBoundary = (d, type, blockId, parentKey = null, tunnel = false) => {
  d.arrows.push({
    id: arrowSeq++,
    kind: "boundary",
    type,
    blockId,
    parentKey,
    tunnel,
  });
};

const addBlock = () => {
  if (!canAddBlock.value) return;
  const d = currentDiagram.value;
  const block = {
    id: blockSeq++,
    code: "",
    name: isRoot.value ? "Название системы" : `Работа ${d.blocks.length + 1}`,
  };
  d.blocks.push(block);

  // Для A0 сразу создаём четыре граничные стрелки — их можно изменить или удалить.
  if (isRoot.value) {
    ["I", "C", "O", "M"].forEach((t) => pushBoundary(d, t, block.id));
  }

  normalize();
  selectedId.value = block.id;
  openBlockModal(block);
};

const blockModal = ref({
  open: false,
  id: null,
  code: "",
  name: "",
  error: "",
});

const openBlockModal = (block) => {
  blockModal.value = {
    open: true,
    id: block.id,
    code: block.code,
    name: block.name,
    error: "",
  };
};

const saveBlock = () => {
  const name = blockModal.value.name.trim();
  if (!name) {
    blockModal.value.error = "Введите название работы.";
    return;
  }
  const block = currentBlocks.value.find((b) => b.id === blockModal.value.id);
  if (block) block.name = name;
  blockModal.value.open = false;
};

const deleteSelectedBlock = () => {
  const b = selectedBlock.value;
  if (!b) return;
  const hasChild = !!diagrams.value[b.id];
  const text = hasChild
    ? `Удалить блок ${b.code} вместе с его дочерними диаграммами?`
    : `Удалить блок ${b.code}?`;
  if (!confirm(text)) return;

  if (hasChild) removeDiagram(b.id);
  currentDiagram.value.blocks = currentBlocks.value.filter(
    (x) => x.id !== b.id,
  );
  selectedId.value = null;
  normalize();
};

/* ==========================================================================
   ДЕКОМПОЗИЦИЯ: создание дочерней диаграммы и привязка к родителю
   ========================================================================== */

// Подключает ещё не подключённые унаследованные стрелки к дочерним блокам:
// выходы — к последнему блоку, всё остальное — к первому.
const autoBindInherited = (key = currentKey.value) => {
  const d = diagrams.value[key];
  if (!d || !d.blocks.length) return;
  const bound = new Set(
    d.arrows
      .filter((a) => a.kind === "boundary" && a.parentKey !== null)
      .map((a) => a.parentKey),
  );
  const first = d.blocks[0].id;
  const last = d.blocks[d.blocks.length - 1].id;
  for (const inh of getInherited(key)) {
    if (bound.has(inh.key)) continue;
    pushBoundary(d, inh.type, inh.type === "O" ? last : first, inh.key);
  }
};

const decomposeSelected = () => {
  const b = selectedBlock.value;
  if (!b) return;
  if (!diagrams.value[b.id]) {
    diagrams.value[b.id] = {
      key: b.id,
      parentKey: currentKey.value,
      blocks: Array.from({ length: MIN_CHILD_BLOCKS }, (_, i) => ({
        id: blockSeq++,
        code: "",
        name: `Работа ${i + 1}`,
      })),
      arrows: [],
    };
    autoBindInherited(b.id);
    normalize();
  }
  goTo(b.id);
};

/* ==========================================================================
   СТРЕЛКИ: меню создания / редактирования
   ========================================================================== */

const inheritedList = computed(() => getInherited(currentKey.value));
const inheritedMap = computed(
  () => new Map(inheritedList.value.map((i) => [i.key, i])),
);

const boundInheritedKeys = computed(
  () =>
    new Set(
      currentArrows.value
        .filter((a) => a.kind === "boundary" && a.parentKey !== null)
        .map((a) => a.parentKey),
    ),
);
const unboundInherited = computed(() =>
  inheritedList.value.filter((i) => !boundInheritedKeys.value.has(i.key)),
);

const arrowModal = ref({ open: false, editingId: null, error: "" });
const form = ref({
  kind: "internal", // 'root' | 'internal' | 'inherited' | 'tunnel'
  fromId: null,
  toId: null,
  port: "I",
  parentKey: null,
  blockId: null,
  type: "I",
});

const availableKinds = computed(() => {
  if (isRoot.value) return [{ value: "root", label: "Граничная стрелка A0" }];
  const kinds = [];
  if (currentBlocks.value.length >= 2)
    kinds.push({ value: "internal", label: "Между блоками" });
  if (inheritedList.value.length)
    kinds.push({ value: "inherited", label: "От родителя" });
  kinds.push({ value: "tunnel", label: "Тоннельная" });
  return kinds;
});

const canAddArrow = computed(() => currentBlocks.value.length > 0);

const setKind = (kind) => {
  form.value.kind = kind;
  arrowModal.value.error = "";
  if (
    kind === "inherited" &&
    form.value.parentKey === null &&
    inheritedList.value.length
  ) {
    form.value.parentKey = (
      unboundInherited.value[0] || inheritedList.value[0]
    ).key;
  }
  if (kind === "tunnel" && !["I", "C", "M", "O"].includes(form.value.type))
    form.value.type = "I";
};

const openArrowModal = (arrow = null) => {
  const blocks = currentBlocks.value;
  if (!blocks.length) return;
  const defaultBlock = selectedId.value ?? blocks[0].id;
  const firstInh =
    (unboundInherited.value[0] || inheritedList.value[0])?.key ?? null;

  form.value = {
    kind: isRoot.value
      ? "root"
      : blocks.length >= 2
        ? "internal"
        : firstInh !== null
          ? "inherited"
          : "tunnel",
    fromId: blocks[0].id,
    toId: (blocks[1] || blocks[0]).id,
    port: "I",
    parentKey: firstInh,
    blockId: defaultBlock,
    type: "I",
  };

  if (arrow) {
    if (arrow.kind === "internal") {
      Object.assign(form.value, {
        kind: "internal",
        fromId: arrow.fromId,
        toId: arrow.toId,
        port: arrow.port,
      });
    } else if (isRoot.value) {
      Object.assign(form.value, {
        kind: "root",
        type: arrow.type,
        blockId: arrow.blockId,
      });
    } else if (arrow.parentKey !== null) {
      Object.assign(form.value, {
        kind: "inherited",
        parentKey: arrow.parentKey,
        blockId: arrow.blockId,
      });
    } else {
      Object.assign(form.value, {
        kind: "tunnel",
        type: arrow.type,
        blockId: arrow.blockId,
      });
    }
  } else if (isRoot.value) {
    form.value.blockId = blocks[0].id;
  }

  arrowModal.value = {
    open: true,
    editingId: arrow ? arrow.id : null,
    error: "",
  };
};

const saveArrow = () => {
  const f = form.value;
  const d = currentDiagram.value;
  const editing = arrowModal.value.editingId;
  const fail = (msg) => {
    arrowModal.value.error = msg;
  };
  let record;

  if (f.kind === "internal") {
    const fromId = Number(f.fromId);
    const toId = Number(f.toId);
    if (fromId === toId)
      return fail("Источник и приёмник должны быть разными блоками.");
    const duplicate = d.arrows.some(
      (a) =>
        a.kind === "internal" &&
        a.id !== editing &&
        a.fromId === fromId &&
        a.toId === toId &&
        a.port === f.port,
    );
    if (duplicate) return fail("Такая стрелка уже есть на диаграмме.");
    record = { kind: "internal", fromId, toId, port: f.port };
  } else if (f.kind === "inherited") {
    const inh = inheritedMap.value.get(f.parentKey);
    if (!inh) return fail("Выберите стрелку родителя.");
    const blockId = Number(f.blockId);
    const duplicate = d.arrows.some(
      (a) =>
        a.kind === "boundary" &&
        a.id !== editing &&
        a.parentKey === inh.key &&
        a.blockId === blockId,
    );
    if (duplicate)
      return fail("Эта стрелка уже подключена к выбранному блоку.");
    record = {
      kind: "boundary",
      type: inh.type,
      blockId,
      parentKey: inh.key,
      tunnel: false,
    };
  } else if (f.kind === "tunnel") {
    record = {
      kind: "boundary",
      type: f.type,
      blockId: Number(f.blockId),
      parentKey: null,
      tunnel: true,
    };
  } else {
    record = {
      kind: "boundary",
      type: f.type,
      blockId: Number(f.blockId),
      parentKey: null,
      tunnel: false,
    };
  }

  if (editing !== null) {
    const idx = d.arrows.findIndex((a) => a.id === editing);
    if (idx !== -1) d.arrows[idx] = { id: editing, ...record };
  } else {
    d.arrows.push({ id: arrowSeq++, ...record });
  }

  normalize();
  arrowModal.value.open = false;
};

const deleteArrow = (id) => {
  currentDiagram.value.arrows = currentArrows.value.filter((a) => a.id !== id);
  normalize();
};

const deleteEditingArrow = () => {
  deleteArrow(arrowModal.value.editingId);
  arrowModal.value.open = false;
};

/* ==========================================================================
   ГЕОМЕТРИЯ: расположение блоков, порты, маршруты стрелок
   ========================================================================== */

const wrapText = (text, maxChars, maxLines = 3) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const cut = lines
    .slice(0, maxLines)
    .map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + "…" : l));
  if (lines.length > maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].replace(/…?$/, "…");
  return cut;
};

const blockRects = computed(() =>
  currentBlocks.value.map((b, i) => {
    const geo = isRoot.value
      ? {
          x: (CANVAS.w - ROOT_BLOCK.w) / 2,
          y: (FRAME.t + FRAME.b) / 2 - ROOT_BLOCK.h / 2,
          w: ROOT_BLOCK.w,
          h: ROOT_BLOCK.h,
        }
      : {
          x: CHILD_BLOCK.x0 + i * CHILD_BLOCK.dx,
          y: CHILD_BLOCK.y0 + i * CHILD_BLOCK.dy,
          w: CHILD_BLOCK.w,
          h: CHILD_BLOCK.h,
        };
    return {
      ...geo,
      id: b.id,
      index: i,
      block: b,
      lines: wrapText(b.name, Math.floor((geo.w - 24) / 7.6)),
      hasChild: !!diagrams.value[b.id],
    };
  }),
);

const rectById = computed(() =>
  Object.fromEntries(blockRects.value.map((r) => [r.id, r])),
);

// Точки подключения: на каждой грани стрелки равномерно распределены вдоль неё.
const ports = computed(() => {
  const rects = rectById.value;
  const groups = {};
  const cx = (r) => r.x + r.w / 2;
  const cy = (r) => r.y + r.h / 2;
  const add = (blockId, side, arrowId, end, sortKey) => {
    const k = `${blockId}:${side}`;
    if (!groups[k]) groups[k] = { blockId, side, items: [] };
    groups[k].items.push({ arrowId, end, sortKey });
  };

  for (const a of currentArrows.value) {
    if (a.kind === "internal") {
      const from = rects[a.fromId];
      const to = rects[a.toId];
      if (!from || !to) continue;
      add(a.fromId, "R", a.id, "src", cy(to));
      const side = a.port === "C" ? "T" : "L";
      add(a.toId, side, a.id, "dst", side === "T" ? cx(from) : cy(from));
    } else {
      const r = rects[a.blockId];
      if (!r) continue;
      const side = SIDE_BY_TYPE[a.type];
      add(
        a.blockId,
        side,
        a.id,
        "bnd",
        side === "T" || side === "B" ? cx(r) : cy(r),
      );
    }
  }

  const result = {};
  for (const g of Object.values(groups)) {
    const r = rects[g.blockId];
    g.items.sort((p, q) => p.sortKey - q.sortKey || p.arrowId - q.arrowId);
    g.items.forEach((it, i) => {
      const f = (i + 1) / (g.items.length + 1);
      const pos =
        g.side === "L"
          ? { x: r.x, y: r.y + r.h * f }
          : g.side === "R"
            ? { x: r.x + r.w, y: r.y + r.h * f }
            : g.side === "T"
              ? { x: r.x + r.w * f, y: r.y }
              : { x: r.x + r.w * f, y: r.y + r.h };
      result[`${it.arrowId}:${it.end}`] = pos;
    });
  }
  return result;
});

/*
  Маршруты. Блоки стоят лесенкой, поэтому «вперёд» (индекс приёмника больше)
  всегда значит «вправо и вниз», и линии не пересекают чужие блоки:
   • Выход → Вход:       правая грань → ступенька → левая грань
   • Выход → Управление: правая грань → вправо → вниз в верхнюю грань
   • Обратная по входу:  вправо → вниз под блоки → влево → вверх → левая грань
   • Обратная по управлению: вправо → вверх над блоками → влево → вниз в верхнюю грань
*/
const arrowShapes = computed(() => {
  const rects = rectById.value;
  const P = ports.value;
  const laneIn = {};
  let laneBack = 0;

  return currentArrows.value.flatMap((a) => {
    let pts;
    let tunnel = null;

    if (a.kind === "internal") {
      const s = rects[a.fromId];
      const t = rects[a.toId];
      const sp = P[`${a.id}:src`];
      const tp = P[`${a.id}:dst`];
      if (!s || !t || !sp || !tp) return [];

      if (t.index > s.index) {
        if (a.port === "C") {
          pts = [
            [sp.x, sp.y],
            [tp.x, sp.y],
            [tp.x, tp.y],
          ];
        } else {
          laneIn[t.id] = (laneIn[t.id] ?? -1) + 1;
          const xv = tp.x - 8 - 4 * (laneIn[t.id] % 4);
          pts = [
            [sp.x, sp.y],
            [xv, sp.y],
            [xv, tp.y],
            [tp.x, tp.y],
          ];
        }
      } else {
        const lane = laneBack++ % 4;
        const xr = sp.x + 8 + 5 * lane;
        if (a.port === "C") {
          const yu = t.y - 8 - 5 * lane;
          pts = [
            [sp.x, sp.y],
            [xr, sp.y],
            [xr, yu],
            [tp.x, yu],
            [tp.x, tp.y],
          ];
        } else {
          const yb = s.y + s.h + 8 + 5 * lane;
          const xl = t.x - 22 - 4 * lane;
          pts = [
            [sp.x, sp.y],
            [xr, sp.y],
            [xr, yb],
            [xl, yb],
            [xl, tp.y],
            [tp.x, tp.y],
          ];
        }
      }
    } else {
      const p = P[`${a.id}:bnd`];
      if (!p) return [];
      if (a.type === "I") {
        pts = [
          [FRAME.l, p.y],
          [p.x, p.y],
        ];
        tunnel = { x: FRAME.l + 28, y: p.y, angle: 0 };
      } else if (a.type === "C") {
        pts = [
          [p.x, FRAME.t],
          [p.x, p.y],
        ];
        tunnel = { x: p.x, y: FRAME.t + 28, angle: 90 };
      } else if (a.type === "M") {
        pts = [
          [p.x, FRAME.b],
          [p.x, p.y],
        ];
        tunnel = { x: p.x, y: FRAME.b - 28, angle: 90 };
      } else {
        pts = [
          [p.x, p.y],
          [FRAME.r, p.y],
        ];
        tunnel = { x: FRAME.r - 28, y: p.y, angle: 0 };
      }
      if (!a.tunnel) tunnel = null;
    }

    return [
      {
        id: a.id,
        arrow: a,
        d: "M " + pts.map((p) => `${p[0]} ${p[1]}`).join(" L "),
        tunnel,
      },
    ];
  });
});

/* ==========================================================================
   БОКОВАЯ ПАНЕЛЬ: описание стрелок
   ========================================================================== */

const idxOf = (id) => currentBlocks.value.findIndex((b) => b.id === id);

const describeArrow = (a) => {
  const code = (id) => findBlock(id)?.code ?? "?";
  if (a.kind === "internal") {
    const back = idxOf(a.toId) < idxOf(a.fromId);
    return {
      title: `${code(a.fromId)} → ${code(a.toId)}`,
      sub: `Выход → ${a.port === "I" ? "Вход" : "Управление"}${back ? ", обратная связь" : ""}`,
    };
  }
  const b = code(a.blockId);
  let sub = TYPE_NAMES[a.type];
  if (a.tunnel) sub += ", тоннель";
  else if (a.parentKey !== null)
    sub += `, ${inheritedMap.value.get(a.parentKey)?.code ?? ""} от родителя`;
  return { title: a.type === "O" ? `${b} → граница` : `граница → ${b}`, sub };
};

const arrowItems = computed(() =>
  currentArrows.value.map((a) => ({ arrow: a, ...describeArrow(a) })),
);

/* ==========================================================================
   ПРОВЕРКА ПРАВИЛ IDEF0
   ========================================================================== */

const issues = computed(() => {
  const out = [];

  const walk = (key) => {
    const d = diagrams.value[key];
    if (!d) return;
    const where = diagramLabel(key);
    const push = (text) => out.push({ key, where, text });

    if (key === "root") {
      if (!d.blocks.length) push("На контекстной диаграмме нет блока A0.");
    } else if (
      d.blocks.length < MIN_CHILD_BLOCKS ||
      d.blocks.length > MAX_CHILD_BLOCKS
    ) {
      push(
        `Блоков на диаграмме: ${d.blocks.length}. Декомпозиция должна содержать от ${MIN_CHILD_BLOCKS} до ${MAX_CHILD_BLOCKS}.`,
      );
    }

    for (const b of d.blocks) {
      const hasControl = d.arrows.some((a) =>
        a.kind === "internal"
          ? a.toId === b.id && a.port === "C"
          : a.blockId === b.id && a.type === "C",
      );
      const hasOutput = d.arrows.some((a) =>
        a.kind === "internal"
          ? a.fromId === b.id
          : a.blockId === b.id && a.type === "O",
      );
      if (!hasControl) push(`Блок ${b.code}: нет стрелки управления.`);
      if (!hasOutput) push(`Блок ${b.code}: нет стрелки выхода.`);
    }

    const bound = new Set(
      d.arrows
        .filter((a) => a.kind === "boundary" && a.parentKey !== null)
        .map((a) => a.parentKey),
    );
    for (const inh of getInherited(key)) {
      if (!bound.has(inh.key)) {
        push(
          `Унаследованная стрелка ${inh.code} (${TYPE_NAMES[inh.type].toLowerCase()}) не подключена ни к одному блоку.`,
        );
      }
    }

    d.blocks.forEach((b) => walk(b.id));
  };

  walk("root");
  return out;
});

const validationOpen = ref(false);
</script>

<template>
  <div
    class="h-screen bg-slate-100 text-slate-800 flex flex-col font-sans select-none overflow-hidden"
  >
    <!-- ВЕРХНЯЯ ПАНЕЛЬ -->
    <header
      class="bg-white border-b border-slate-300 px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-30"
    >
      <div class="flex items-center gap-4">
        <h1 class="text-lg font-bold text-slate-900">Редактор IDEF0</h1>

        <div
          class="flex rounded border border-slate-300 overflow-hidden text-sm font-semibold"
          role="group"
          aria-label="Метка процесса"
        >
          <button
            v-for="t in ['AS-IS', 'TO-BE']"
            :key="t"
            @click="diagramType = t"
            class="px-3 py-1.5 transition"
            :class="
              diagramType === t
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            "
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="addBlock"
          :disabled="!canAddBlock"
          class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-sm font-medium transition"
        >
          {{
            isRoot
              ? "Создать блок A0"
              : `Добавить блок (${currentBlocks.length}/${MAX_CHILD_BLOCKS})`
          }}
        </button>

        <button
          @click="openArrowModal()"
          :disabled="!canAddArrow"
          class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-sm font-medium transition"
        >
          Добавить стрелку
        </button>

        <button
          @click="validationOpen = true"
          class="px-3 py-1.5 border rounded text-sm font-medium transition flex items-center gap-2"
          :class="
            issues.length
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          "
        >
          Проверить диаграмму
          <span
            class="inline-block min-w-[1.25rem] text-center rounded-full text-xs font-bold px-1.5 py-0.5 text-white"
            :class="issues.length ? 'bg-red-600' : 'bg-emerald-600'"
            >{{ issues.length }}</span
          >
        </button>
      </div>
    </header>

    <!-- ХЛЕБНЫЕ КРОШКИ -->
    <nav
      class="bg-slate-50 border-b border-slate-300 px-4 py-2 flex items-center gap-2 text-sm z-30"
      aria-label="Иерархия диаграмм"
    >
      <span class="text-slate-500 mr-1">Диаграмма:</span>
      <template v-for="(item, i) in breadcrumbs" :key="item.key">
        <button
          @click="goTo(item.key)"
          class="transition hover:text-blue-600"
          :class="
            i === breadcrumbs.length - 1
              ? 'text-blue-700 font-bold'
              : 'text-slate-600'
          "
        >
          {{ item.label }}
        </button>
        <span v-if="i < breadcrumbs.length - 1" class="text-slate-400">/</span>
      </template>
    </nav>

    <div class="flex-1 flex min-h-0">
      <!-- ХОЛСТ -->
      <main class="flex-1 relative bg-white min-w-0">
        <svg
          class="absolute inset-0 w-full h-full bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px]"
          :viewBox="`0 0 ${CANVAS.w} ${CANVAS.h}`"
          preserveAspectRatio="xMidYMid meet"
          font-family="ui-sans-serif, system-ui, sans-serif"
          @click="selectedId = null"
        >
          <defs>
            <marker
              id="arrow"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              markerHeight="10"
              refX="11"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 12 5, 0 10" fill="#0f172a" />
            </marker>
            <marker
              id="arrow-active"
              markerUnits="userSpaceOnUse"
              markerWidth="12"
              markerHeight="10"
              refX="11"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 12 5, 0 10" fill="#2563eb" />
            </marker>
          </defs>

          <!-- Рамка диаграммы -->
          <rect
            :x="FRAME.l"
            :y="FRAME.t"
            :width="FRAME.r - FRAME.l"
            :height="FRAME.b - FRAME.t"
            fill="none"
            stroke="#0f172a"
            stroke-width="2"
          />
          <text
            :x="FRAME.l + 6"
            :y="FRAME.b + 34"
            font-size="15"
            fill="#334155"
          >
            <tspan font-weight="700">{{ diagramLabel(currentKey) }}</tspan>
            <tspan dx="24">Метка: {{ diagramType }}</tspan>
          </text>

          <!-- Пустой холст -->
          <text
            v-if="currentBlocks.length === 0"
            :x="CANVAS.w / 2"
            :y="CANVAS.h / 2"
            text-anchor="middle"
            font-size="20"
            fill="#94a3b8"
            font-style="italic"
          >
            {{
              isRoot
                ? "Диаграмма пуста. Нажмите «Создать блок A0»."
                : "На диаграмме нет блоков. Нажмите «Добавить блок»."
            }}
          </text>

          <!-- Стрелки (без текстовых подписей) -->
          <g
            v-for="s in arrowShapes"
            :key="s.id"
            class="cursor-pointer"
            @click.stop="openArrowModal(s.arrow)"
            @mouseenter="hoveredArrowId = s.id"
            @mouseleave="hoveredArrowId = null"
          >
            <path :d="s.d" fill="none" stroke="transparent" stroke-width="16" />
            <path
              :d="s.d"
              fill="none"
              stroke-width="2.2"
              stroke-linejoin="round"
              :stroke="hoveredArrowId === s.id ? '#2563eb' : '#0f172a'"
              :marker-end="
                hoveredArrowId === s.id ? 'url(#arrow-active)' : 'url(#arrow)'
              "
            />
            <!-- Тоннельные скобки у границы диаграммы -->
            <g
              v-if="s.tunnel"
              :transform="`translate(${s.tunnel.x} ${s.tunnel.y}) rotate(${s.tunnel.angle})`"
              fill="none"
              stroke-width="2.2"
              stroke-linecap="round"
              :stroke="hoveredArrowId === s.id ? '#2563eb' : '#0f172a'"
            >
              <path d="M -4 -9 Q -12 0 -4 9" />
              <path d="M 4 -9 Q 12 0 4 9" />
            </g>
          </g>

          <!-- Блоки -->
          <g
            v-for="r in blockRects"
            :key="r.id"
            class="cursor-pointer"
            @click.stop="selectedId = r.id"
            @dblclick.stop="openBlockModal(r.block)"
          >
            <rect
              :x="r.x"
              :y="r.y"
              :width="r.w"
              :height="r.h"
              fill="#fff"
              :stroke="selectedId === r.id ? '#2563eb' : '#0f172a'"
              :stroke-width="selectedId === r.id ? 3.5 : 2.5"
            />
            <text
              v-for="(line, i) in r.lines"
              :key="i"
              :x="r.x + r.w / 2"
              :y="r.y + r.h / 2 + (i - (r.lines.length - 1) / 2) * 17 - 4"
              text-anchor="middle"
              font-size="14"
              font-weight="600"
              fill="#0f172a"
            >
              {{ line }}
            </text>
            <text
              :x="r.x + r.w - 8"
              :y="r.y + r.h - 8"
              text-anchor="end"
              font-size="13"
              font-weight="700"
              font-family="ui-monospace, monospace"
              fill="#0f172a"
            >
              {{ r.block.code }}
            </text>
            <text
              v-if="r.hasChild"
              :x="r.x + 8"
              :y="r.y + r.h - 8"
              font-size="12"
              fill="#2563eb"
              font-weight="600"
            >
              ↘ есть дочерняя
            </text>
          </g>
        </svg>
      </main>

      <!-- БОКОВАЯ ПАНЕЛЬ -->
      <aside
        class="w-80 shrink-0 bg-white border-l border-slate-300 overflow-y-auto text-sm"
      >
        <section class="p-4 border-b border-slate-200">
          <h2 class="font-bold text-slate-900 mb-2">Выбранный блок</h2>
          <template v-if="selectedBlock">
            <p class="font-mono font-bold text-slate-900">
              {{ selectedBlock.code }}
            </p>
            <p class="text-slate-700 mb-3 break-words">
              {{ selectedBlock.name }}
            </p>
            <div class="flex flex-col gap-2">
              <button
                @click="openBlockModal(selectedBlock)"
                class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded font-medium transition"
              >
                Изменить название
              </button>
              <button
                @click="decomposeSelected"
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
              >
                {{
                  diagrams[selectedBlock.id]
                    ? "Открыть дочернюю диаграмму"
                    : "Создать дочернюю диаграмму"
                }}
              </button>
              <button
                @click="deleteSelectedBlock"
                class="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded font-medium transition"
              >
                Удалить блок
              </button>
            </div>
          </template>
          <p v-else class="text-slate-500">
            Выберите блок на диаграмме. Двойной щелчок открывает редактирование
            названия.
          </p>
        </section>

        <section v-if="!isRoot" class="p-4 border-b border-slate-200">
          <h2 class="font-bold text-slate-900 mb-2">Стрелки родителя</h2>
          <p v-if="!inheritedList.length" class="text-slate-500">
            У родительского блока нет стрелок. Добавьте их на родительской
            диаграмме.
          </p>
          <ul v-else class="space-y-1">
            <li
              v-for="i in inheritedList"
              :key="i.key"
              class="flex justify-between items-center"
            >
              <span
                ><span class="font-mono font-bold">{{ i.code }}</span> ·
                {{ TYPE_NAMES[i.type] }}</span
              >
              <span
                class="text-xs font-medium px-2 py-0.5 rounded"
                :class="
                  boundInheritedKeys.has(i.key)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                "
              >
                {{
                  boundInheritedKeys.has(i.key) ? "подключена" : "не подключена"
                }}
              </span>
            </li>
          </ul>
          <button
            v-if="unboundInherited.length"
            @click="autoBindInherited()"
            class="mt-3 w-full px-3 py-1.5 bg-slate-900 hover:bg-slate-700 text-white rounded font-medium transition"
          >
            Подключить автоматически ({{ unboundInherited.length }})
          </button>
        </section>

        <section class="p-4 border-b border-slate-200">
          <h2 class="font-bold text-slate-900 mb-2">Стрелки диаграммы</h2>
          <p v-if="!arrowItems.length" class="text-slate-500">
            Стрелок пока нет.
          </p>
          <ul v-else class="space-y-1">
            <li v-for="it in arrowItems" :key="it.arrow.id">
              <button
                @click="openArrowModal(it.arrow)"
                @mouseenter="hoveredArrowId = it.arrow.id"
                @mouseleave="hoveredArrowId = null"
                class="w-full text-left px-2 py-1.5 rounded transition hover:bg-blue-50"
                :class="hoveredArrowId === it.arrow.id ? 'bg-blue-50' : ''"
              >
                <span class="font-medium text-slate-900">{{ it.title }}</span>
                <span class="block text-xs text-slate-500">{{ it.sub }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section class="p-4 text-slate-600">
          <h2 class="font-bold text-slate-900 mb-2">
            Как подключаются стрелки
          </h2>
          <ul class="space-y-1 text-xs leading-relaxed">
            <li>Вход — к левой грани, управление — к верхней.</li>
            <li>Выход — от правой грани, механизм — к нижней.</li>
            <li>
              Скобки ( ) у границы — тоннель: стрелки нет на родительской
              диаграмме.
            </li>
            <li>Нажмите на стрелку, чтобы изменить или удалить её.</li>
          </ul>
        </section>
      </aside>
    </div>

    <!-- ОКНО: БЛОК -->
    <div
      v-if="blockModal.open"
      class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      @click.self="blockModal.open = false"
    >
      <div
        class="bg-white border border-slate-300 rounded-lg w-full max-w-md p-6 shadow-xl"
      >
        <h2 class="text-lg font-bold mb-4 text-slate-900">
          Блок {{ blockModal.code }}
        </h2>
        <label class="block text-sm text-slate-600 mb-1">Название работы</label>
        <input
          v-model="blockModal.name"
          type="text"
          maxlength="80"
          @keyup.enter="saveBlock"
          class="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-900 focus:outline-none focus:border-blue-600"
        />
        <p class="text-xs text-slate-500 mt-2">
          Номер {{ blockModal.code }} присваивается автоматически по месту блока
          в иерархии.
        </p>
        <p v-if="blockModal.error" class="text-sm text-red-600 mt-2">
          {{ blockModal.error }}
        </p>
        <div class="flex justify-end gap-2 mt-6">
          <button
            @click="blockModal.open = false"
            class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition"
          >
            Отмена
          </button>
          <button
            @click="saveBlock"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>

    <!-- ОКНО: СТРЕЛКА -->
    <div
      v-if="arrowModal.open"
      class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      @click.self="arrowModal.open = false"
    >
      <div
        class="bg-white border border-slate-300 rounded-lg w-full max-w-md p-6 shadow-xl"
      >
        <h2 class="text-lg font-bold mb-4 text-slate-900">
          {{
            arrowModal.editingId !== null
              ? "Редактирование стрелки"
              : "Новая стрелка"
          }}
        </h2>

        <div
          v-if="availableKinds.length > 1"
          class="flex rounded border border-slate-300 overflow-hidden text-sm font-medium mb-4"
        >
          <button
            v-for="k in availableKinds"
            :key="k.value"
            @click="setKind(k.value)"
            class="flex-1 px-2 py-1.5 transition"
            :class="
              form.kind === k.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            "
          >
            {{ k.label }}
          </button>
        </div>

        <div class="space-y-4 text-sm">
          <!-- Между блоками -->
          <template v-if="form.kind === 'internal'">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-600 mb-1">Откуда (выход)</label>
                <select
                  v-model.number="form.fromId"
                  class="w-full bg-slate-50 border border-slate-300 rounded p-2"
                >
                  <option v-for="b in currentBlocks" :key="b.id" :value="b.id">
                    {{ b.code }} — {{ b.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-slate-600 mb-1">Куда</label>
                <select
                  v-model.number="form.toId"
                  class="w-full bg-slate-50 border border-slate-300 rounded p-2"
                >
                  <option v-for="b in currentBlocks" :key="b.id" :value="b.id">
                    {{ b.code }} — {{ b.name }}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-slate-600 mb-1"
                >Подключить к грани приёмника</label
              >
              <select
                v-model="form.port"
                class="w-full bg-slate-50 border border-slate-300 rounded p-2"
              >
                <option value="I">Левая — вход</option>
                <option value="C">Верхняя — управление</option>
              </select>
            </div>
            <p class="text-xs text-slate-500">
              Если приёмник стоит выше или левее источника, стрелка
              автоматически строится как обратная связь и огибает блоки.
            </p>
          </template>

          <!-- Унаследованная -->
          <template v-else-if="form.kind === 'inherited'">
            <div>
              <label class="block text-slate-600 mb-1">Стрелка родителя</label>
              <select
                v-model.number="form.parentKey"
                class="w-full bg-slate-50 border border-slate-300 rounded p-2"
              >
                <option v-for="i in inheritedList" :key="i.key" :value="i.key">
                  {{ i.code }} — {{ TYPE_NAMES[i.type]
                  }}{{
                    boundInheritedKeys.has(i.key) ? " (уже подключена)" : ""
                  }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-slate-600 mb-1"
                >Подключить к блоку</label
              >
              <select
                v-model.number="form.blockId"
                class="w-full bg-slate-50 border border-slate-300 rounded p-2"
              >
                <option v-for="b in currentBlocks" :key="b.id" :value="b.id">
                  {{ b.code }} — {{ b.name }}
                </option>
              </select>
            </div>
            <p class="text-xs text-slate-500">
              Одну стрелку родителя можно подключить к нескольким блокам.
            </p>
          </template>

          <!-- Тоннельная или граничная A0 -->
          <template v-else>
            <div>
              <label class="block text-slate-600 mb-1">Тип стрелки</label>
              <select
                v-model="form.type"
                class="w-full bg-slate-50 border border-slate-300 rounded p-2"
              >
                <option value="I">Вход — слева</option>
                <option value="C">Управление — сверху</option>
                <option value="O">Выход — справа</option>
                <option value="M">Механизм — снизу</option>
              </select>
            </div>
            <div v-if="form.kind === 'tunnel'">
              <label class="block text-slate-600 mb-1">Блок</label>
              <select
                v-model.number="form.blockId"
                class="w-full bg-slate-50 border border-slate-300 rounded p-2"
              >
                <option v-for="b in currentBlocks" :key="b.id" :value="b.id">
                  {{ b.code }} — {{ b.name }}
                </option>
              </select>
            </div>
            <p v-if="form.kind === 'tunnel'" class="text-xs text-slate-500">
              {{
                form.type === "O"
                  ? "Тоннель на приёмнике: стрелка выходит из блока в границу диаграммы, на родительской диаграмме её нет."
                  : "Тоннель на источнике: стрелка начинается у границы диаграммы, на родительской диаграмме её нет."
              }}
            </p>
            <p v-else class="text-xs text-slate-500">
              Стрелка подключается к блоку A0 и затем наследуется дочерней
              диаграммой.
            </p>
          </template>

          <p v-if="arrowModal.error" class="text-red-600">
            {{ arrowModal.error }}
          </p>
        </div>

        <div class="flex justify-between items-center mt-6">
          <button
            v-if="arrowModal.editingId !== null"
            @click="deleteEditingArrow"
            class="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm rounded font-medium transition"
          >
            Удалить
          </button>
          <div v-else></div>
          <div class="flex gap-2">
            <button
              @click="arrowModal.open = false"
              class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition"
            >
              Отмена
            </button>
            <button
              @click="saveArrow"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ОКНО: ПРОВЕРКА IDEF0 -->
    <div
      v-if="validationOpen"
      class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      @click.self="validationOpen = false"
    >
      <div
        class="bg-white border border-slate-300 rounded-lg w-full max-w-xl p-6 shadow-xl max-h-[80vh] flex flex-col"
      >
        <h2 class="text-lg font-bold mb-1 text-slate-900">
          Проверка по правилам IDEF0
        </h2>
        <p
          class="text-sm mb-4"
          :class="issues.length ? 'text-red-700' : 'text-emerald-700'"
        >
          {{
            issues.length
              ? `Найдено замечаний: ${issues.length}`
              : "Замечаний нет. Диаграммы соответствуют правилам."
          }}
        </p>
        <ul class="overflow-y-auto space-y-2 text-sm">
          <li
            v-for="(it, i) in issues"
            :key="i"
            class="border border-slate-200 rounded p-3 flex justify-between items-start gap-3"
          >
            <div>
              <p class="text-xs text-slate-500">{{ it.where }}</p>
              <p class="text-slate-900">{{ it.text }}</p>
            </div>
            <button
              @click="
                goTo(it.key);
                validationOpen = false;
              "
              class="shrink-0 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium transition"
            >
              Перейти
            </button>
          </li>
        </ul>
        <div class="flex justify-end mt-4">
          <button
            @click="validationOpen = false"
            class="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-medium transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
