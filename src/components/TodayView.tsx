import { useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, FolderPlus, Minus, Plus, X } from 'lucide-react';
import { useAppStore } from '../store';
import { EmptyState, Modal } from './Common';

export function TodayView() {
  const { db, todayTaskIds, todayCompletedIds, setTodayTasks, removeTodayTask, toggleTodo, showTodayFinish } = useAppStore();
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const activeTasks = db.tasks.filter((t) => t.status === 'active');
  const groups = useMemo(() => todayTaskIds.map((id) => db.tasks.find((t) => t.id === id)).filter(Boolean), [todayTaskIds, db.tasks]);
  const visibleTodos = (taskId: string) => db.todos.filter((todo) => todo.task_id === taskId && (todo.status === 'open' || todayCompletedIds.includes(todo.id))).sort((a, b) => a.order - b.order);
  const openPicker = () => { setDraft(todayTaskIds); setPicker(true); };

  return <section className="view today-view">
    <div className="view-heading">
      <div><span className="eyebrow">FOCUS SESSION</span><h1>今日待办</h1><p>把今天真正要推进的项目放到眼前。</p></div>
      <button className="primary-button" onClick={openPicker}><FolderPlus size={17} /> 添加项目</button>
    </div>
    {!groups.length ? <EmptyState icon={<CheckCircle2 />} title="今天从一件重要的事开始" description="添加项目后，这里会实时汇总其中尚未完成的待办。" action={<button className="primary-button" onClick={openPicker}><Plus size={17}/> 添加第一个项目</button>} /> :
      <div className="today-groups">{groups.map((task) => task && <article className="today-group" key={task.id}>
        <header><div><span className="number-label">PROJECT {String(task.task_no).padStart(2, '0')}</span><h2>{task.name}</h2></div><button className="icon-button subtle" onClick={() => removeTodayTask(task.id)} title="移出今日待办"><Minus size={17}/></button></header>
        <div className="today-list">{visibleTodos(task.id).length ? visibleTodos(task.id).map((todo) => <button key={todo.id} className={`today-todo ${todo.status === 'done' ? 'is-done' : ''}`} onClick={() => toggleTodo(todo.id)}>
          <span className="check-box">{todo.status === 'done' && <Check size={14}/>}</span><span className="todo-no">{String(todo.todo_no).padStart(2, '0')}</span><span className="todo-content">{todo.content}</span><ChevronRight className="todo-arrow" size={15}/>
        </button>) : <p className="group-empty">这个项目目前没有未完成待办。</p>}</div>
      </article>)}</div>}
    {!!groups.length && <div className="finish-bar"><span>今天的项目已就位</span><button className="finish-button" onClick={showTodayFinish}><CheckCircle2 size={18}/> 结束今天的工作</button></div>}
    {picker && <Modal title="添加到今日待办" onClose={() => setPicker(false)}>
      <div className="project-picker">{activeTasks.length ? activeTasks.map((task) => <label key={task.id} className={draft.includes(task.id) ? 'selected' : ''}>
        <input type="checkbox" checked={draft.includes(task.id)} onChange={() => setDraft((ids) => ids.includes(task.id) ? ids.filter((id) => id !== task.id) : [...ids, task.id])}/>
        <span className="picker-check">{draft.includes(task.id) && <Check size={14}/>}</span><span><b>No.{String(task.task_no).padStart(2, '0')}</b>{task.name}</span>
      </label>) : <p className="muted">项目空间中暂无进行中的项目。</p>}</div>
      <footer className="modal-actions"><button className="ghost-button" onClick={() => setPicker(false)}>取消</button><button className="primary-button" onClick={() => { setTodayTasks(draft); setPicker(false); }}>应用选择</button></footer>
    </Modal>}
  </section>;
}

export function TodayFinishedModal() {
  const { todayFinished, confirmTodayFinish, dismissTodayFinish } = useAppStore();
  if (!todayFinished) return null;
  return <div className="modal-backdrop"><section className="completion-card"><button className="icon-button completion-close" onClick={dismissTodayFinish}><X size={18}/></button><div className="completion-mark"><Check size={34}/></div><span>SESSION COMPLETE</span><h2>今日工作已完成</h2><p>收起今天，把注意力留给明天。</p><button className="primary-button" onClick={confirmTodayFinish}>确认并清空今日会话</button></section></div>;
}
