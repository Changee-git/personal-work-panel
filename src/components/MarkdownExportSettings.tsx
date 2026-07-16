import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FolderOpen,
  FolderOutput,
  RotateCcw
} from 'lucide-react';
import {
  chooseMarkdownExportDirectory,
  exportProjectsMarkdown,
  getDefaultExportDirectory
} from '../lib/backend';
import { flushPendingSaves, useAppStore } from '../store';

interface ExportMessage {
  kind: 'success' | 'error';
  text: string;
}

export function MarkdownExportSettings() {
  const tasks = useAppStore((state) => state.db.tasks);
  const orderedTasks = useMemo(
    () => [...tasks].sort((left, right) => left.task_no - right.task_no),
    [tasks]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() => tasks.map((task) => task.id));
  const [defaultPath, setDefaultPath] = useState('项目根目录\\export');
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [pathBusy, setPathBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [message, setMessage] = useState<ExportMessage | null>(null);

  useEffect(() => {
    void getDefaultExportDirectory()
      .then(setDefaultPath)
      .catch((error) => setMessage({ kind: 'error', text: `读取默认导出路径失败：${String(error)}` }));
  }, []);

  const allSelected = orderedTasks.length > 0 && selectedIds.length === orderedTasks.length;
  const selectedPath = customPath ?? defaultPath;

  const toggleTask = (taskId: string) => {
    setMessage(null);
    setSelectedIds((current) => current.includes(taskId)
      ? current.filter((id) => id !== taskId)
      : [...current, taskId]);
  };

  const toggleAll = () => {
    setMessage(null);
    setSelectedIds(allSelected ? [] : orderedTasks.map((task) => task.id));
  };

  const choosePath = async () => {
    setPathBusy(true);
    setMessage(null);
    try {
      const selected = await chooseMarkdownExportDirectory(selectedPath);
      if (selected) setCustomPath(selected);
    } catch (error) {
      setMessage({ kind: 'error', text: `选择导出路径失败：${String(error)}` });
    } finally {
      setPathBusy(false);
    }
  };

  const exportSelected = async () => {
    if (!selectedIds.length || exportBusy) return;
    setExportBusy(true);
    setMessage(null);
    try {
      await flushPendingSaves();
      const result = await exportProjectsMarkdown(selectedIds, customPath ?? undefined);
      setMessage({
        kind: 'success',
        text: `已导出 ${result.fileCount} 个 Markdown 文件到：${result.directory}`
      });
    } catch (error) {
      setMessage({ kind: 'error', text: `导出失败：${String(error)}` });
    } finally {
      setExportBusy(false);
    }
  };

  return <section className="setting-row export-setting">
    <header className="export-setting-header">
      <div className="setting-icon"><FolderOutput size={18} /></div>
      <div className="setting-copy">
        <strong>导出 Markdown</strong>
        <span>将全部或指定项目导出为便于归档、迁移和阅读的 Markdown 文件。</span>
      </div>
      <span className="export-count">{selectedIds.length}/{orderedTasks.length} 已选</span>
    </header>

    <div className="export-projects" aria-label="选择要导出的项目">
      <div className="export-projects-toolbar">
        <span>选择项目</span>
        <button type="button" className="text-button" onClick={toggleAll} disabled={!orderedTasks.length}>
          <span className={`export-mini-check ${allSelected ? 'is-checked' : ''}`}>
            {allSelected && <Check size={12} />}
          </span>
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      {orderedTasks.length ? <div className="export-project-list">
        {orderedTasks.map((task) => {
          const selected = selectedIds.includes(task.id);
          return <button
            type="button"
            key={task.id}
            className={`export-project-item ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            onClick={() => toggleTask(task.id)}
          >
            <span className="export-project-check">{selected && <Check size={14} />}</span>
            <b>No.{String(task.task_no).padStart(2, '0')}</b>
            <span className="export-project-name">{task.name}</span>
            <span className={`export-project-status ${task.status}`}>
              {task.status === 'completed' && <CheckCircle2 size={12} />}
              {task.status === 'completed' ? '已完成' : '进行中'}
            </span>
          </button>;
        })}
      </div> : <p className="export-empty">暂无可导出的项目，请先在项目空间创建项目。</p>}
    </div>

    <div className={`export-path-card ${customPath ? 'is-custom' : ''}`}>
      <FolderOpen size={18} />
      <div className="export-path-copy">
        <span>{customPath ? '自定义路径' : '默认路径 · 项目根目录'}</span>
        <strong title={selectedPath}>{selectedPath}</strong>
      </div>
      <div className="export-path-actions">
        {customPath && <button
          type="button"
          className="icon-button"
          title="恢复默认路径"
          aria-label="恢复默认路径"
          onClick={() => { setCustomPath(null); setMessage(null); }}
        ><RotateCcw size={15} /></button>}
        <button type="button" className="ghost-button" disabled={pathBusy} onClick={() => void choosePath()}>
          <FolderOpen size={15} />
          {pathBusy ? '选择中…' : '自定义'}
        </button>
      </div>
    </div>

    {message && <p className={`settings-message ${message.kind}`} role="status" aria-live="polite">
      {message.kind === 'success' && <CheckCircle2 size={14} />}
      {message.text}
    </p>}

    <div className="export-action-row">
      <span>每个项目生成独立文件；已完成待办使用 √ 标记。</span>
      <button
        type="button"
        className="primary-button export-button"
        disabled={!selectedIds.length || exportBusy}
        onClick={() => void exportSelected()}
      >
        <Download size={16} />
        {exportBusy ? '正在导出…' : `导出 ${selectedIds.length || ''} 个项目`.trim()}
      </button>
    </div>
  </section>;
}
