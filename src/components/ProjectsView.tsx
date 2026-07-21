import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import { useAppStore } from '../store';
import type { Task } from '../types';
import { EmptyState, formatDate, Modal } from './Common';
import { TaskDetail } from './TaskDetail';
import { EditableTaskName } from './EditableTaskName';

type TaskSortOrder = 'asc' | 'desc';

export function ProjectsView() {
  const { db, filter, setFilter, selectedTaskId, createTask, openTask, deleteTask } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<TaskSortOrder>('asc');
  const activeCount = db.tasks.filter((t) => t.status === 'active').length;
  const completedCount = db.tasks.length - activeCount;
  const tasks = useMemo(
    () =>
      db.tasks
        .filter((t) => filter === 'all' || t.status === filter)
        .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (sortOrder === 'asc' ? a.task_no - b.task_no : b.task_no - a.task_no)),
    [db.tasks, filter, query, sortOrder]
  );

  if (selectedTaskId) return <TaskDetail taskId={selectedTaskId} />;

  const submit = () => {
    if (!name.trim()) return;
    createTask(name);
    setName('');
    setCreating(false);
  };

  return (
    <section className="view projects-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">PROJECT LEDGER</span>
          <h1>项目空间</h1>
          <p>让每一次推进都留下清晰的时间刻度。</p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> 新建项目
        </button>
      </div>

      <div className="project-stats">
        <div>
          <span>进行中</span>
          <strong>{String(activeCount).padStart(2, '0')}</strong>
          <i className="active-dot" />
        </div>
        <div>
          <span>已完成</span>
          <strong>{String(completedCount).padStart(2, '0')}</strong>
          <CheckCircle2 />
        </div>
      </div>

      <div className="project-toolbar">
        <div className="project-toolbar-left">
          <div className="segmented">
            {(['active', 'completed', 'all'] as const).map((value) => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value === 'active' ? '进行中' : value === 'completed' ? '已完成' : '全部'}
              </button>
            ))}
          </div>
          <div className="segmented sort-segmented" role="group" aria-label="按序号排序">
            <button
              type="button"
              className={sortOrder === 'asc' ? 'active' : ''}
              onClick={() => setSortOrder('asc')}
              title="按序号正序：01 → 更大"
            >
              <ArrowUp size={14} /> 正序
            </button>
            <button
              type="button"
              className={sortOrder === 'desc' ? 'active' : ''}
              onClick={() => setSortOrder('desc')}
              title="按序号倒序：更大 → 01"
            >
              <ArrowDown size={14} /> 倒序
            </button>
          </div>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索项目"
          />
        </label>
      </div>

      {!tasks.length ? (
        <EmptyState
          icon={<FolderKanban />}
          title={query ? '没有匹配的项目' : '还没有项目'}
          description={query ? '试试其他关键词。' : '创建项目后，可以在其中拆分待办、问题与总结。'}
          action={
            !query ? (
              <button className="primary-button" onClick={() => setCreating(true)}>
                <Plus size={17} /> 新建项目
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="project-grid">
          {tasks.map((task) => (
            <ProjectCard key={task.id} task={task} onOpen={openTask} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {creating && (
        <Modal title="新建项目" onClose={() => setCreating(false)}>
          <div className="form-stack">
            <label>
              项目名称
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="例如：MES 系统对接"
              />
            </label>
          </div>
          <footer className="modal-actions">
            <button className="ghost-button" onClick={() => setCreating(false)}>
              取消
            </button>
            <button className="primary-button" onClick={submit}>
              创建项目
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}

function ProjectCard({
  task,
  onOpen,
  onDelete
}: {
  task: Task;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { db } = useAppStore();
  const openTodos = db.todos.filter((x) => x.task_id === task.id && x.status === 'open').length;
  const openIssues = db.issues.filter((x) => x.task_id === task.id && x.status === 'open').length;

  return (
    <article
      className={`project-card ${task.status === 'completed' ? 'is-completed' : ''}`}
      onClick={() => onOpen(task.id)}
    >
      <header>
        <span className="project-number">NO. {String(task.task_no).padStart(2, '0')}</span>
        <button
          className="icon-button danger"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`确定删除“${task.name}”及其全部内容吗？`)) onDelete(task.id);
          }}
        >
          <Trash2 size={15} />
        </button>
      </header>
      <h2>
        <EditableTaskName task={task} />
      </h2>
      {task.status === 'completed' && task.summary && (
        <p className="summary-preview">
          {task.summary.slice(0, 40)}
          {task.summary.length > 40 ? '…' : ''}
        </p>
      )}
      <div className="card-metrics">
        <span>
          <CheckCircle2 size={15} />
          <b>{openTodos}</b> 待办
        </span>
        <span>
          <AlertCircle size={15} />
          <b>{openIssues}</b> 问题
        </span>
      </div>
      <footer>
        <span>
          {task.status === 'active' ? <CalendarClock size={14} /> : <Archive size={14} />}{' '}
          {formatDate(task.status === 'active' ? task.last_progress_at : task.completed_at)}
        </span>
        <ArrowRight size={17} />
      </footer>
    </article>
  );
}
