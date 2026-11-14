import { ref, computed } from "vue";

/* ==========================================================================
   КОНСТАНТЫ
   ========================================================================== */

export const CANVAS = { w: 1600, h: 1000 };
export const FRAME = { l: 10, t: 10, r: 1590, b: 930 };

export const ROOT_BLOCK = { w: 400, h: 200 };
export const CHILD_BLOCK = { w: 180, h: 90, x0: 190, y0: 150, dx: 215, dy: 120 };

export const MAX_NAME_LEN = 40;
export const LABEL_CHAR_W = 6.8;
export const DEFAULT_ROOT_NAMES = {
  I: "Входные данные",
  C: "Регламент",
  O: "Результат",
  M: "Исполнитель",
};

export const MIN_CHILD_BLOCKS = 3;
export const MAX_CHILD_BLOCKS = 6;

export const TYPE_NAMES = { I: "Вход", C: "Управление", O: "Выход", M: "Механизм" };
export const SIDE_BY_TYPE = { I: "L", C: "T", O: "R", M: "B" };

/* ==========================================================================
   СОСТОЯНИЕ
   ========================================================================== */

const diagramType = ref("AS-IS"); // Тип диаграммы(нужно будет убрать)
const diagrams = ref({
  root: { key: "root", parentKey: null, blocks: [], arrows: [] }, // Хранилище диаграмм проекта
});
const currentKey = ref("root");


/* 
key - уникальный ключ диаграммы
parentkey - ключ родительской диаграммы
blocks - массив всеъ блоков
arrows- массив всех стрелокid 
Состояние хранится в оперативной памяти


*/

let blockSeq = 1; // Счетчикик которые гарантируют кникальный id  при создании блоко и стрелок
let arrowSeq = 1; //

const selectedId = ref(null); // айди блока на который кликнул пользователь, если ничего не выбрано то null
const hoveredArrowId = ref(null); // Храни айди стрелки над которым пролетает курсор чтобы подсвечивать

const isRoot = computed(() => currentKey.value === "root"); // тру/фолс отвечает  на вопрос мы внутри дочерней диаграммы или нет
const currentDiagram = computed(() => diagrams.value[currentKey.value]); // возвращает объект активной диаграммы 
const currentBlocks = computed(() => currentDiagram.value.blocks);// возвращает блоки и стрелки по их айди

const currentArrows = computed(() => currentDiagram.value.arrows);
const selectedBlock = computed(
  () => currentBlocks.value.find((b) => b.id === selectedId.value) || null,
);

const canAddBlock = computed(() => // ограничения idef0 , на корневом уровне можно иметь только 1 блок, на дочерних декомпозициях от 3 до 6 
  isRoot.value
    ? currentBlocks.value.length < 1
    : currentBlocks.value.length < MAX_CHILD_BLOCKS,
);

/* ==========================================================================
   ВСПОМОГАТЕЛЬНОЕ: поиск, подписи, навигация
   ========================================================================== */

const findBlock = (id) => {
  for (const diagObj of Object.values(diagrams.value)) {
    const b = diagObj.blocks.find((x) => x.id === id);
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
   ЦЕЛОСТНОСТЬ ДАННЫХ
   ========================================================================== */

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

const resolveName = (key, a) => {
  if (a.kind === "boundary" && a.parentKey !== null) {
    return getInherited(key).find((i) => i.key === a.parentKey)?.name ?? "";
  }
  return a.name || "";
};

const getInherited = (key) => {
  const d = diagrams.value[key];
  if (!d || d.parentKey === null) return [];
  const parent = diagrams.value[d.parentKey];
  if (!parent) return [];

  const raw = [];
  for (const a of parent.arrows) {
    let type = null;
    if (a.kind === "internal") {
      if (a.toId === key) type = a.port;
      else if (a.fromId === key) type = "O";
    } else if (a.blockId === key) {
      type = a.type;
    }
    if (type) raw.push({ key: a.id, type, name: resolveName(d.parentKey, a) });
  }
  raw.sort((p, q) => p.key - q.key);

  const counters = { I: 0, C: 0, O: 0, M: 0 };
  return raw.map((r) => ({ ...r, code: `${r.type}${++counters[r.type]}` }));
};

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

const pushBoundary = (
  d,
  type,
  blockId,
  parentKey = null,
  tunnel = false,
  name = "",
) => {
  d.arrows.push({
    id: arrowSeq++,
    kind: "boundary",
    type,
    blockId,
    parentKey,
    tunnel,
    name,
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

  if (isRoot.value) {
    ["I", "C", "O", "M"].forEach((t) =>
      pushBoundary(d, t, block.id, null, false, DEFAULT_ROOT_NAMES[t]),
    );
  }

  normalize();
  selectedId.value = block.id;
  openBlockModel(block);
};

const blockModel = ref({
  open: false,
  id: null,
  code: "",
  name: "",
  error: "",
});

const openBlockModel = (block) => {
  blockModel.value = {
    open: true,
    id: block.id,
    code: block.code,
    name: block.name,
    error: "",
  };
};

const saveBlock = () => {
  const name = blockModel.value.name.trim();
  if (!name) {
    blockModel.value.error = "Введите название работы.";
    return;
  }
  const block = currentBlocks.value.find((b) => b.id === blockModel.value.id);
  if (block) block.name = name;
  blockModel.value.open = false;
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
   ДЕКОМПОЗИЦИЯ
   ========================================================================== */

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

const countBlocks = (key) => {
  const d = diagrams.value[key];
  return d ? d.blocks.reduce((n, b) => n + 1 + countBlocks(b.id), 0) : 0;
};

const deleteDiagram = (key) => {
  const d = diagrams.value[key];
  if (!d || key === "root") return;
  const owner = findBlock(key);
  const text =
    `Удалить дочернюю диаграмму блока ${owner?.code ?? ""}?\n` +
    `Будут удалены все её блоки и стрелки (всего блоков: ${countBlocks(key)}), включая вложенные диаграммы. ` +
    `Сам блок ${owner?.code ?? ""} останется.`;
  if (!confirm(text)) return;

  if (currentKey.value === key) {
    currentKey.value = d.parentKey;
    selectedId.value = key;
  }
  removeDiagram(key);
  normalize();
  showNotice(`Дочерняя диаграмма блока ${owner?.code ?? ""} удалена.`);
};

/* ==========================================================================
   УВЕДОМЛЕНИЯ
   ========================================================================== */

const notice = ref("");
let noticeTimer = null;
const showNotice = (text) => {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 5000);
};

/* ==========================================================================
   СТРЕЛКИ
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

const arrowModel = ref({ open: false, editingId: null, error: "" });
const form = ref({
  kind: "internal",
  fromId: null,
  toId: null,
  port: "I",
  parentKey: null,
  blockId: null,
  type: "I",
  name: "",
});

const inheritedFormName = computed(
  () => inheritedMap.value.get(form.value.parentKey)?.name ?? "",
);

const replacesSameName = computed(() => {
  const f = form.value;
  if (f.kind === "internal") return f.port === "I";
  return f.type === "I" || f.type === "O";
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
  arrowModel.value.error = "";
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

const openArrowModel = (arrow = null) => {
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
    name: "",
  };

  if (arrow) {
    form.value.name = arrow.name || "";
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

  arrowModel.value = {
    open: true,
    editingId: arrow ? arrow.id : null,
    error: "",
  };
};

const saveArrow = () => {
  const f = form.value;
  const d = currentDiagram.value;
  const editing = arrowModel.value.editingId;
  const fail = (msg) => {
    arrowModel.value.error = msg;
  };
  const name = f.name.trim().slice(0, MAX_NAME_LEN);
  let record;
  let effectiveName = name;

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
    record = { kind: "internal", fromId, toId, port: f.port, name };
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
      name: "",
    };
    effectiveName = inh.name;
  } else if (f.kind === "tunnel") {
    record = {
      kind: "boundary",
      type: f.type,
      blockId: Number(f.blockId),
      parentKey: null,
      tunnel: true,
      name,
    };
  } else {
    record = {
      kind: "boundary",
      type: f.type,
      blockId: Number(f.blockId),
      parentKey: null,
      tunnel: false,
      name,
    };
  }

  // Запрет на одинаковые имена стрелок на одной диаграмме
  if (effectiveName && effectiveName.toLowerCase() !== "без названия") {
    const duplicateByName = d.arrows.some((a) => {
      if (a.id === editing) return false;

      // РАЗРЕШАЕМ ВЕТВЛЕНИЕ: если это унаследованная стрелка от того же родителя, 
      // то совпадение имени допустимо (это разветвление одной логической стрелки на разные блоки)
      if (f.kind === "inherited" && a.kind === "boundary" && a.parentKey === f.parentKey) {
        return false;
      }

      const existingName = resolveName(currentKey.value, a).trim().toLowerCase();
      return existingName === effectiveName.toLowerCase();
    });

    if (duplicateByName) {
      return fail(`Стрелка с названием «${effectiveName}» уже существует на этой диаграмме. Имена стрелок должны быть уникальными.`);
    }
  }

  const target = currentDiagram.value;
  if (editing !== null) {
    const idx = target.arrows.findIndex((a) => a.id === editing);
    if (idx !== -1) target.arrows[idx] = { id: editing, ...record };
  } else {
    target.arrows.push({ id: arrowSeq++, ...record });
  }

  normalize();
  arrowModel.value.open = false;
};

const deleteArrow = (id) => {
  currentDiagram.value.arrows = currentArrows.value.filter((a) => a.id !== id);
  normalize();
};

const deleteEditingArrow = () => {
  deleteArrow(arrowModel.value.editingId);
  arrowModel.value.open = false;
};

/* ==========================================================================
   ГЕОМЕТРИЯ
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

const labelFor = (pts, name, trimStart = 0, trimEnd = 0) => {
  if (!name) return null;
  const work = pts.map((p) => [...p]);
  const shorten = (a, b, by) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= by) return;
    a[0] += ((b[0] - a[0]) / len) * by;
    a[1] += ((b[1] - a[1]) / len) * by;
  };
  if (trimStart) shorten(work[0], work[1], trimStart);
  if (trimEnd) shorten(work[work.length - 1], work[work.length - 2], trimEnd);

  let best = null;
  for (let i = 0; i < work.length - 1; i++) {
    const [x1, y1] = work[i];
    const [x2, y2] = work[i + 1];
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    if (!best || len > best.len + 0.5) {
      best = {
        len,
        vertical: Math.abs(x2 - x1) < 0.5,
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
      };
    }
  }

  const max = Math.floor((best.len - 14) / LABEL_CHAR_W);
  if (max < 3) return null;
  const text = name.length > max ? name.slice(0, max - 1) + "…" : name;
  return best.vertical
    ? { x: best.x - 6, y: best.y, rotate: true, text }
    : { x: best.x, y: best.y - 6, rotate: false, text };
};

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

    const name =
      a.kind === "boundary" && a.parentKey !== null
        ? (inheritedMap.value.get(a.parentKey)?.name ?? "")
        : a.name || "";
    const trimStart =
      tunnel && !(a.kind === "boundary" && a.type === "O") ? 44 : 0;
    const trimEnd = tunnel && a.kind === "boundary" && a.type === "O" ? 44 : 0;

    return [
      {
        id: a.id,
        arrow: a,
        name,
        label: labelFor(pts, name, trimStart, trimEnd),
        d: "M " + pts.map((p) => `${p[0]} ${p[1]}`).join(" L "),
        tunnel,
      },
    ];
  });
});

/* ==========================================================================
   БОКОВАЯ ПАНЕЛЬ
   ========================================================================== */

const idxOf = (id) => currentBlocks.value.findIndex((b) => b.id === id);

const describeArrow = (a) => {
  const code = (id) => findBlock(id)?.code ?? "?";
  const name = resolveName(currentKey.value, a);
  if (a.kind === "internal") {
    const back = idxOf(a.toId) < idxOf(a.fromId);
    return {
      name,
      title: `${code(a.fromId)} → ${code(a.toId)}`,
      sub: `Выход → ${a.port === "I" ? "Вход" : "Управление"}${back ? ", обратная связь" : ""}`,
    };
  }
  const b = code(a.blockId);
  let sub = TYPE_NAMES[a.type];
  if (a.tunnel) sub += ", тоннель";
  else if (a.parentKey !== null)
    sub += `, ${inheritedMap.value.get(a.parentKey)?.code ?? ""} от родителя`;
  return {
    name,
    title: a.type === "O" ? `${b} → граница` : `граница → ${b}`,
    sub,
  };
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
    const push = (text, level = "error") =>
      out.push({ key, where, text, level });
    const code = (id) => findBlock(id)?.code ?? "?";

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

    // Проверка на дубликаты названий стрелок на одной диаграмме
    // Не дает создать такую же только есди это не родительская стрелка
    const nameCounts = {};
    for (const a of d.arrows) {
      const arrowName = resolveName(key, a).trim().toLowerCase();
      if (arrowName && arrowName !== "без названия") {
        nameCounts[arrowName] = (nameCounts[arrowName] || 0) + 1;
      }
    }
    for (const [arrowName, count] of Object.entries(nameCounts)) {
      if (count > 1) {
        push(`На диаграмме обнаружено несколько стрелок с одинаковым названием: «${arrowName}». Имена стрелок должны быть уникальными.`);
      }
    }

    for (const a of d.arrows) {
      if (a.kind === "boundary" && a.parentKey !== null) continue;
      if (!(a.name || "").trim()) {
        const who =
          a.kind === "internal"
            ? `${code(a.fromId)} → ${code(a.toId)}`
            : `${TYPE_NAMES[a.type].toLowerCase()} у блока ${code(a.blockId)}`;
        push(`Стрелка без названия: ${who}.`, "warning");
      }
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

    if (key !== "root") {
      const plural = {
        I: "входов",
        C: "управлений",
        O: "выходов",
        M: "механизмов",
      };
      const parentCode = code(key);
      const inherited = getInherited(key);
      for (const type of ["I", "C", "O", "M"]) {
        const expected = inherited.filter((i) => i.type === type);
        const missing = expected.filter((i) => !bound.has(i.key));
        if (missing.length) {
          push(
            `Не совпадает число ${plural[type]}: у блока ${parentCode} — ${expected.length}, ` +
              `на диаграмме — ${expected.length - missing.length} (не подключены: ${missing.map((m) => m.code).join(", ")}).`,
          );
        }
      }
    }

    d.blocks.forEach((b) => walk(b.id));
  };

  walk("root");
  return out;
});

const errorCount = computed(
  () => issues.value.filter((i) => i.level === "error").length,
);
const validationOpen = ref(false);

// Экспортируем функцию useEditor и все необходимые константы
export function useEditor() {
  return {
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
    diagramLabel,
    breadcrumbs,
    goTo,
    addBlock,
    blockModel,
    openBlockModel,
    saveBlock,
    deleteSelectedBlock,
    autoBindInherited,
    decomposeSelected,
    deleteDiagram,
    notice,
    inheritedList,
    boundInheritedKeys,
    unboundInherited,
    arrowModel,
    form,
    inheritedFormName,
    replacesSameName,
    availableKinds,
    canAddArrow,
    setKind,
    openArrowModel,
    saveArrow,
    deleteEditingArrow,
    blockRects,
    arrowShapes,
    arrowItems,
    issues,
    errorCount,
    validationOpen,
  };
}