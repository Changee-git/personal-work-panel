import { create } from 'zustand';
import type { AppDatabase, AppTab, Idea, Issue, Task, Todo, WindowMode } from './types';
import { emptyDatabase, nowIso, uid } from './types';
import {
  loadDatabase,
  readAutostartEnabled,
  saveDatabase,
  setAutostartEnabled,
  setNativeWindowMode
} from './lib/backend';

export type ProjectFilter = 'active' | 'completed' | 'all';

interface Store {
  db: AppDatabase;
  ready: boolean;
  tab: AppTab;
  filter: ProjectFilter;
  selectedTaskId: string | null;
  todayTaskIds: string[];
  todayCompletedIds: string[];
  todayFinished: boolean;
  initialize: () => Promise<void>;
  setTab: (tab: AppTab) => void;
  setFilter: (filter: ProjectFilter) => void;
  openTask: (id: string) => void;
  closeTask: () => void;
  handleWindowShown: () => void;
  setWindowMode: (mode: WindowMode) => Promise<void>;
  setAutostart: (enabled: boolean) => Promise<void>;
  createTask: (name: string) => void;
  renameTask: (id: string, name: string) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string, summary: string, summaryImages: string[]) => void;
  updateSummary: (id: string, summary: string, images: string[]) => void;
  addTodo: (taskId: string, content: string, images?: string[]) => void;
  updateTodo: (id: string, content: string, images?: string[]) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  reorderTodos: (taskId: string, ids: string[]) => void;
  addIssue: (taskId: string, title: string, detail: string, images?: string[]) => void;
  updateIssue: (id: string, patch: Partial<Pick<Issue, 'title' | 'detail' | 'images'>>) => void;
  toggleIssue: (id: string) => void;
  deleteIssue: (id: string) => void;
  addIdea: (content: string, images?: string[]) => void;
  updateIdea: (id: string, content: string, images: string[]) => void;
  deleteIdea: (id: string) => void;
  setTodayTasks: (ids: string[]) => void;
  removeTodayTask: (id: string) => void;
  showTodayFinish: () => void;
  confirmTodayFinish: () => void;
  dismissTodayFinish: () => void;
}

let saveQueue = Promise.resolve();

const persist = (db: AppDatabase) => {
  const snapshot = structuredClone(db);
  saveQueue = saveQueue
    .then(() => saveDatabase(snapshot))
    .catch((error) => console.error('保存工作面板数据失败', error));
};

export const flushPendingSaves = () => saveQueue;

const progressed = (tasks: Task[], taskId: string, timestamp = nowIso()) =>
  tasks.map((task) =>
    task.id === taskId ? { ...task, last_progress_at: timestamp } : task
  );

const todoIdsForTask = (db: AppDatabase, taskId: string) =>
  new Set(db.todos.filter((todo) => todo.task_id === taskId).map((todo) => todo.id));

/** 将项目序号整理为连续 1..n，并同步 next_task_no */
const normalizeTaskNumbers = (db: AppDatabase): AppDatabase => {
  const ordered = [...db.tasks].sort((left, right) => left.task_no - right.task_no);
  let changed = ordered.length !== db.tasks.length;
  const tasks = ordered.map((task, index) => {
    const taskNo = index + 1;
    if (task.task_no !== taskNo) changed = true;
    return task.task_no === taskNo ? task : { ...task, task_no: taskNo };
  });
  const nextTaskNo = tasks.length + 1;
  if (db.counters.next_task_no !== nextTaskNo) changed = true;
  if (!changed) return db;
  return {
    ...db,
    counters: { ...db.counters, next_task_no: nextTaskNo },
    tasks
  };
};

export const useAppStore = create<Store>((set, get) => ({
  db: emptyDatabase(),
  ready: false,
  tab: 'today',
  filter: 'active',
  selectedTaskId: null,
  todayTaskIds: [],
  todayCompletedIds: [],
  todayFinished: false,

  initialize: async () => {
    const loaded = await loadDatabase();
    const nativeAutostart = await readAutostartEnabled().catch(() => null);
    const withAutostart = nativeAutostart === null || nativeAutostart === loaded.settings.autostart
      ? loaded
      : {
          ...loaded,
          settings: { ...loaded.settings, autostart: nativeAutostart }
        };
    // 启动时修正历史数据中的序号空隙（例如删除后未重排的 1,2,4）
    const db = normalizeTaskNumbers(withAutostart);
    if (db !== loaded) persist(db);
    set({
      db,
      ready: true,
      tab: db.settings.window_mode === 'compact' ? 'today' : db.settings.last_main_tab
    });
    await setNativeWindowMode(db.settings.window_mode).catch((error) =>
      console.error('恢复窗口尺寸失败', error)
    );
  },

  setTab: (tab) => set((state) => {
    const db = state.db.settings.window_mode === 'main'
      ? { ...state.db, settings: { ...state.db.settings, last_main_tab: tab } }
      : state.db;
    if (db !== state.db) persist(db);
    return {
      tab,
      db,
      selectedTaskId: tab === 'projects' ? state.selectedTaskId : null
    };
  }),

  setFilter: (filter) => set({ filter }),
  openTask: (id) => set({ selectedTaskId: id, tab: 'projects' }),
  closeTask: () => set({ selectedTaskId: null }),

  handleWindowShown: () => set((state) =>
    state.db.settings.window_mode === 'compact'
      ? { tab: 'today', selectedTaskId: null }
      : {}
  ),

  setWindowMode: async (mode) => {
    const state = get();
    const db = {
      ...state.db,
      settings: { ...state.db.settings, window_mode: mode }
    };
    persist(db);
    set({
      db,
      tab: mode === 'compact' ? 'today' : db.settings.last_main_tab,
      selectedTaskId: null
    });
    await setNativeWindowMode(mode);
  },

  setAutostart: async (enabled) => {
    await setAutostartEnabled(enabled);
    set((state) => {
      const db = {
        ...state.db,
        settings: { ...state.db.settings, autostart: enabled }
      };
      persist(db);
      return { db };
    });
  },


  createTask: (name) => set((state) => {
    const timestamp = nowIso();
    const task: Task = {
      id: uid(),
      task_no: state.db.counters.next_task_no,
      name: name.trim(),
      status: 'active',
      created_at: timestamp,
      last_progress_at: timestamp,
      completed_at: null,
      summary: '',
      summary_images: []
    };
    const db = {
      ...state.db,
      counters: {
        ...state.db.counters,
        next_task_no: task.task_no + 1
      },
      tasks: [...state.db.tasks, task]
    };
    persist(db);
    return { db };
  }),

  renameTask: (id, name) => {
    const trimmedName = name.trim();
    const currentTask = get().db.tasks.find((task) => task.id === id);
    if (!trimmedName || !currentTask || currentTask.status !== 'active' || currentTask.name === trimmedName) return;
    set((state) => {
      const db = {
        ...state.db,
        tasks: state.db.tasks.map((task) =>
          task.id === id ? { ...task, name: trimmedName } : task
        )
      };
      persist(db);
      return { db };
    });
  },

  deleteTask: (id) => set((state) => {
    const deletedTodoIds = todoIdsForTask(state.db, id);
    const nextTodoNo = { ...state.db.counters.next_todo_no };
    delete nextTodoNo[id];
    const db = normalizeTaskNumbers({
      ...state.db,
      counters: {
        ...state.db.counters,
        next_todo_no: nextTodoNo
      },
      tasks: state.db.tasks.filter((task) => task.id !== id),
      todos: state.db.todos.filter((todo) => todo.task_id !== id),
      issues: state.db.issues.filter((issue) => issue.task_id !== id)
    });
    persist(db);
    return {
      db,
      selectedTaskId: null,
      todayTaskIds: state.todayTaskIds.filter((taskId) => taskId !== id),
      todayCompletedIds: state.todayCompletedIds.filter((todoId) => !deletedTodoIds.has(todoId))
    };
  }),

  completeTask: (id, summary, summaryImages) => set((state) => {
    const timestamp = nowIso();
    const taskTodoIds = todoIdsForTask(state.db, id);
    const db = {
      ...state.db,
      tasks: state.db.tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              status: 'completed' as const,
              summary,
              summary_images: summaryImages,
              completed_at: timestamp,
              last_progress_at: timestamp
            }
          : task
      )
    };
    persist(db);
    return {
      db,
      todayTaskIds: state.todayTaskIds.filter((taskId) => taskId !== id),
      todayCompletedIds: state.todayCompletedIds.filter((todoId) => !taskTodoIds.has(todoId))
    };
  }),

  updateSummary: (id, summary, images) => set((state) => {
    const db = {
      ...state.db,
      tasks: progressed(
        state.db.tasks.map((task) =>
          task.id === id
            ? { ...task, summary, summary_images: images }
            : task
        ),
        id
      )
    };
    persist(db);
    return { db };
  }),

  addTodo: (taskId, content, images = []) => set((state) => {
    const timestamp = nowIso();
    const nextNo = state.db.counters.next_todo_no[taskId] ?? 1;
    const todo: Todo = {
      id: uid(),
      todo_no: nextNo,
      task_id: taskId,
      content: content.trim(),
      images,
      status: 'open',
      created_at: timestamp,
      completed_at: null,
      order: Math.max(-1, ...state.db.todos.filter((item) => item.task_id === taskId).map((item) => item.order)) + 1
    };
    const db = {
      ...state.db,
      counters: {
        ...state.db.counters,
        next_todo_no: {
          ...state.db.counters.next_todo_no,
          [taskId]: nextNo + 1
        }
      },
      tasks: progressed(state.db.tasks, taskId, timestamp),
      todos: [...state.db.todos, todo]
    };
    persist(db);
    return { db };
  }),

  updateTodo: (id, content, images) => set((state) => {
    const todo = state.db.todos.find((item) => item.id === id);
    if (!todo) return {};
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, todo.task_id),
      todos: state.db.todos.map((item) =>
        item.id === id
          ? { ...item, content: content.trim(), images: images ?? item.images }
          : item
      )
    };
    persist(db);
    return { db };
  }),

  toggleTodo: (id) => set((state) => {
    const todo = state.db.todos.find((item) => item.id === id);
    if (!todo) return {};
    const timestamp = nowIso();
    const done = todo.status === 'open';
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, todo.task_id, timestamp),
      todos: state.db.todos.map((item) =>
        item.id === id
          ? {
              ...item,
              status: done ? 'done' as const : 'open' as const,
              completed_at: done ? timestamp : null
            }
          : item
      )
    };
    persist(db);
    return {
      db,
      todayCompletedIds: state.todayTaskIds.includes(todo.task_id) && done
        ? [...new Set([...state.todayCompletedIds, id])]
        : state.todayCompletedIds.filter((todoId) => todoId !== id)
    };
  }),

  deleteTodo: (id) => set((state) => {
    const todo = state.db.todos.find((item) => item.id === id);
    if (!todo) return {};
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, todo.task_id),
      todos: state.db.todos.filter((item) => item.id !== id)
    };
    persist(db);
    return {
      db,
      todayCompletedIds: state.todayCompletedIds.filter((todoId) => todoId !== id)
    };
  }),

  reorderTodos: (taskId, ids) => set((state) => {
    const order = new Map(ids.map((id, index) => [id, index]));
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, taskId),
      todos: state.db.todos.map((todo) =>
        todo.task_id === taskId
          ? { ...todo, order: order.get(todo.id) ?? todo.order }
          : todo
      )
    };
    persist(db);
    return { db };
  }),

  addIssue: (taskId, title, detail, images = []) => set((state) => {
    const timestamp = nowIso();
    const issue: Issue = {
      id: uid(),
      task_id: taskId,
      title: title.trim(),
      detail: detail.trim(),
      images,
      status: 'open',
      created_at: timestamp,
      resolved_at: null
    };
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, taskId, timestamp),
      issues: [...state.db.issues, issue]
    };
    persist(db);
    return { db };
  }),

  updateIssue: (id, patch) => set((state) => {
    const issue = state.db.issues.find((item) => item.id === id);
    if (!issue) return {};
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, issue.task_id),
      issues: state.db.issues.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    };
    persist(db);
    return { db };
  }),

  toggleIssue: (id) => set((state) => {
    const issue = state.db.issues.find((item) => item.id === id);
    if (!issue) return {};
    const timestamp = nowIso();
    const resolved = issue.status === 'open';
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, issue.task_id, timestamp),
      issues: state.db.issues.map((item) =>
        item.id === id
          ? {
              ...item,
              status: resolved ? 'resolved' as const : 'open' as const,
              resolved_at: resolved ? timestamp : null
            }
          : item
      )
    };
    persist(db);
    return { db };
  }),

  deleteIssue: (id) => set((state) => {
    const issue = state.db.issues.find((item) => item.id === id);
    if (!issue) return {};
    const db = {
      ...state.db,
      tasks: progressed(state.db.tasks, issue.task_id),
      issues: state.db.issues.filter((item) => item.id !== id)
    };
    persist(db);
    return { db };
  }),

  addIdea: (content, images = []) => set((state) => {
    const idea: Idea = {
      id: uid(),
      content: content.trim(),
      images,
      created_at: nowIso()
    };
    const db = { ...state.db, ideas: [idea, ...state.db.ideas] };
    persist(db);
    return { db };
  }),

  updateIdea: (id, content, images) => set((state) => {
    const db = {
      ...state.db,
      ideas: state.db.ideas.map((idea) =>
        idea.id === id ? { ...idea, content: content.trim(), images } : idea
      )
    };
    persist(db);
    return { db };
  }),

  deleteIdea: (id) => set((state) => {
    const db = {
      ...state.db,
      ideas: state.db.ideas.filter((idea) => idea.id !== id)
    };
    persist(db);
    return { db };
  }),

  setTodayTasks: (ids) => set((state) => {
    const activeIds = new Set(
      state.db.tasks.filter((task) => task.status === 'active').map((task) => task.id)
    );
    const todayTaskIds = [...new Set(ids)].filter((id) => activeIds.has(id));
    const retainedTaskIds = new Set(todayTaskIds);
    return {
      todayTaskIds,
      todayCompletedIds: state.todayCompletedIds.filter((todoId) => {
        const todo = state.db.todos.find((item) => item.id === todoId);
        return todo ? retainedTaskIds.has(todo.task_id) : false;
      })
    };
  }),

  removeTodayTask: (id) => set((state) => {
    const taskTodoIds = todoIdsForTask(state.db, id);
    return {
      todayTaskIds: state.todayTaskIds.filter((taskId) => taskId !== id),
      todayCompletedIds: state.todayCompletedIds.filter((todoId) => !taskTodoIds.has(todoId))
    };
  }),

  showTodayFinish: () => set({ todayFinished: true }),
  confirmTodayFinish: () => set({
    todayTaskIds: [],
    todayCompletedIds: [],
    todayFinished: false
  }),
  dismissTodayFinish: () => set({ todayFinished: false })
}));
