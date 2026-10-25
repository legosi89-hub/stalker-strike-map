'use strict';

// Local editor data only. Rendering, persistence and network access live elsewhere.
(() => {
  const MAX_ITEMS = 500;
  const MAX_HISTORY = 100;
  const MAX_NUMBER = Number.MAX_SAFE_INTEGER - 1;
  const TOP_KEYS = ['schemaVersion', 'updatedAt', 'nextPointNumber', 'nextAnomalyNumber', 'points', 'anomalies'];
  const POINT_KEYS = ['id', 'number', 'kind', 'x', 'y', 'note', 'title', 'icon'];
  const ANOMALY_KEYS = ['id', 'number', 'kind', 'type', 'x', 'y', 'category', 'title', 'subtitle', 'description', 'tag', 'icon', 'note'];
  const TEXT_LIMITS = {category: 120, title: 160, subtitle: 240, description: 4000, tag: 120, icon: 64, note: 2000};
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function object(value, name, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}: требуется объект.`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(`${name}: некорректный объект.`);
    if (Object.keys(value).some(key => !keys.includes(key))) fail(`${name}: есть неизвестные поля.`);
    return value;
  }

  function positiveNumber(value, name) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_NUMBER) fail(`${name}: требуется положительный целый номер.`);
    return value;
  }

  function coordinate(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      fail(`${name}: координата должна быть числом от 0 до 100.`);
    }
    return Math.round(value * 1000) / 1000;
  }

  function string(value, name, limit) {
    if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      fail(`${name}: некорректный текст (максимум ${limit} знаков).`);
    }
    return value;
  }

  function identifier(value, name) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) fail(`${name}: некорректный идентификатор.`);
    return value;
  }

  function validate(data) {
    object(data, 'Разметка', TOP_KEYS);
    if (data.schemaVersion !== 1) fail('Эта версия файла разметки не поддерживается.');
    if (typeof data.updatedAt !== 'string' || data.updatedAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(data.updatedAt) || !Number.isFinite(Date.parse(data.updatedAt))) {
      fail('Разметка: некорректная дата сохранения.');
    }
    for (const key of ['points', 'anomalies']) {
      if (!Array.isArray(data[key]) || data[key].length > MAX_ITEMS) fail(`Разметка: ${key} должен быть массивом не более ${MAX_ITEMS} меток.`);
    }
    const ids = new Set();
    function common(item, name, numbers) {
      const id = identifier(item.id, `${name}: id`);
      const number = positiveNumber(item.number, `${name}: номер`);
      if (ids.has(id)) fail(`Идентификатор ${id} повторяется.`);
      if (numbers.has(number)) fail(`${name}: номер ${number} повторяется.`);
      ids.add(id);
      numbers.add(number);
      return {id, number, x: coordinate(item.x, `${name}: x`), y: coordinate(item.y, `${name}: y`)};
    }
    const pointNumbers = new Set();
    const points = data.points.map((item, index) => {
      const name = `Точка ${index + 1}`;
      object(item, name, POINT_KEYS);
      const result = common(item, name, pointNumbers);
      if (!['known', 'rumor'].includes(item.kind)) fail(`${name}: тип должен быть known или rumor.`);
      const normalized = {id: result.id, number: result.number, kind: item.kind, x: result.x, y: result.y, note: string(item.note, `${name}: заметка`, TEXT_LIMITS.note)};
      for (const key of ['title', 'icon']) {
        if (own(item, key)) normalized[key] = string(item[key], `${name}: ${key}`, TEXT_LIMITS[key]);
      }
      return normalized;
    });
    if (points.filter(point => point.kind === 'known').length > 3) fail('На карте может быть не больше трёх известных точек.');
    const anomalyNumbers = new Set();
    const anomalies = data.anomalies.map((item, index) => {
      const name = `Аномалия ${index + 1}`;
      object(item, name, ANOMALY_KEYS);
      const result = common(item, name, anomalyNumbers);
      if ((own(item, 'kind') && item.kind !== 'anomaly') || (own(item, 'type') && item.type !== 'anomaly')) fail(`${name}: некорректный тип.`);
      const normalized = {id: result.id, number: result.number, kind: 'anomaly', type: 'anomaly', x: result.x, y: result.y};
      for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
        if (own(item, key)) normalized[key] = string(item[key], `${name}: ${key}`, limit);
      }
      if (!own(normalized, 'note')) normalized.note = '';
      return normalized;
    });
    const nextPointNumber = positiveNumber(data.nextPointNumber, 'Следующий номер точки');
    const nextAnomalyNumber = positiveNumber(data.nextAnomalyNumber, 'Следующий номер аномалии');
    if (points.some(point => point.number >= nextPointNumber)) fail('Следующий номер точки должен быть больше всех существующих номеров.');
    if (anomalies.some(anomaly => anomaly.number >= nextAnomalyNumber)) fail('Следующий номер аномалии должен быть больше всех существующих номеров.');
    return {schemaVersion: 1, updatedAt: new Date(data.updatedAt).toISOString(), nextPointNumber, nextAnomalyNumber, points, anomalies};
  }

  function seed(anomalies) {
    if (!Array.isArray(anomalies) || anomalies.length > MAX_ITEMS) fail('Некорректный набор исходных аномалий.');
    return validate({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      nextPointNumber: 1,
      nextAnomalyNumber: Math.max(6, anomalies.length + 1),
      points: [],
      anomalies: anomalies.map((source, index) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) fail('Некорректная исходная аномалия.');
        const result = {id: source.id, number: index + 1, kind: 'anomaly', type: 'anomaly', x: source.x, y: source.y, note: ''};
        for (const key of Object.keys(TEXT_LIMITS)) {
          if (own(source, key)) result[key] = source[key];
        }
        return result;
      })
    });
  }

  window.createPlacementStore = function createPlacementStore({initial, anomalies = []} = {}) {
    let state = initial == null ? seed(anomalies) : validate(initial);
    let pointNumberFloor = state.nextPointNumber;
    let anomalyNumberFloor = state.nextAnomalyNumber;
    const undoStack = [];
    const redoStack = [];
    const listeners = new Set();

    function notify() {
      for (const listener of [...listeners]) {
        try { listener(clone(state)); }
        catch (error) { console.error('Не удалось обновить редактор разметки:', error); }
      }
    }
    function preserveNumbers(next) {
      pointNumberFloor = Math.max(pointNumberFloor, next.nextPointNumber);
      anomalyNumberFloor = Math.max(anomalyNumberFloor, next.nextAnomalyNumber);
      next.nextPointNumber = pointNumberFloor;
      next.nextAnomalyNumber = anomalyNumberFloor;
      return next;
    }
    function remember(stack, snapshot) {
      stack.push(clone(snapshot));
      if (stack.length > MAX_HISTORY) stack.shift();
    }
    function commit(draft) {
      const next = preserveNumbers(validate(draft));
      // Repeated pointer-up or an unchanged note must not consume undo history.
      if (JSON.stringify({...next, updatedAt: ''}) === JSON.stringify({...state, updatedAt: ''})) return false;
      remember(undoStack, state);
      redoStack.length = 0;
      next.updatedAt = new Date().toISOString();
      state = next;
      notify();
      return true;
    }
    function locate(snapshot, id) {
      identifier(id, 'Идентификатор метки');
      const item = snapshot.points.find(point => point.id === id) || snapshot.anomalies.find(anomaly => anomaly.id === id);
      if (!item) fail('Метка не найдена.');
      return item;
    }
    function newId(prefix, number) {
      const ids = new Set([...state.points, ...state.anomalies].map(item => item.id));
      const base = `${prefix}-${number}`;
      let result = base, suffix = 2;
      while (ids.has(result)) result = `${base}-${suffix++}`;
      return result;
    }
    function nextNumber(number) {
      if (number >= MAX_NUMBER) fail('Достигнут предел номеров меток.');
      return number + 1;
    }

    const api = {
      getState: () => clone(state),
      serialize: () => clone(state),
      subscribe(listener) {
        if (typeof listener !== 'function') fail('Подписчик должен быть функцией.');
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      addPoint(kind, x, y) {
        if (!['known', 'rumor'].includes(kind)) fail('Тип точки должен быть known или rumor.');
        if (state.points.length >= MAX_ITEMS) fail(`На карте уже ${MAX_ITEMS} точек.`);
        if (kind === 'known' && state.points.filter(point => point.kind === 'known').length >= 3) fail('Уже расставлены три известные точки. Остальные можно добавить как слухи.');
        const number = state.nextPointNumber;
        const item = {id: newId('point', number), number, kind, x: coordinate(x, 'x'), y: coordinate(y, 'y'), note: ''};
        const draft = clone(state);
        draft.nextPointNumber = nextNumber(number);
        draft.points.push(item);
        commit(draft);
        return clone(item);
      },
      addAnomaly(x, y) {
        if (state.anomalies.length >= MAX_ITEMS) fail(`На карте уже ${MAX_ITEMS} аномалий.`);
        const number = state.nextAnomalyNumber;
        const item = {id: newId('anomaly', number), number, kind: 'anomaly', type: 'anomaly', x: coordinate(x, 'x'), y: coordinate(y, 'y'), category: 'Аномалия', title: `Аномалия ${number}`, subtitle: '', description: '', tag: '', icon: 'anomaly', note: ''};
        const draft = clone(state);
        draft.nextAnomalyNumber = nextNumber(number);
        draft.anomalies.push(item);
        commit(draft);
        return clone(item);
      },
      move(id, x, y) {
        return api.update(id, {x, y});
      },
      update(id, patch) {
        const draft = clone(state);
        const item = locate(draft, id);
        const isPoint = item.kind !== 'anomaly';
        const allowed = isPoint ? ['kind', 'x', 'y', 'note', 'title', 'icon'] : ['x', 'y', ...Object.keys(TEXT_LIMITS)];
        object(patch, 'Изменение метки', allowed);
        Object.assign(item, patch);
        commit(draft);
        return clone(locate(state, id));
      },
      remove(id) {
        identifier(id, 'Идентификатор метки');
        const draft = clone(state);
        draft.points = draft.points.filter(item => item.id !== id);
        draft.anomalies = draft.anomalies.filter(item => item.id !== id);
        return commit(draft);
      },
      undo() {
        if (!undoStack.length) return false;
        remember(redoStack, state);
        state = preserveNumbers(undoStack.pop());
        state.updatedAt = new Date().toISOString();
        notify();
        return true;
      },
      redo() {
        if (!redoStack.length) return false;
        remember(undoStack, state);
        state = preserveNumbers(redoStack.pop());
        state.updatedAt = new Date().toISOString();
        notify();
        return true;
      },
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      replace(data) {
        return commit(validate(data));
      }
    };
    return api;
  };
})();
