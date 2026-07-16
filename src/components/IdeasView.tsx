import { useState } from 'react';
import { Lightbulb, Plus, Save, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { EmptyState, formatDate, ImageStrip } from './Common';

export function IdeasView() {
  const { db, addIdea, updateIdea, deleteIdea } = useAppStore();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const save = () => { if (!content.trim() && !images.length) return; addIdea(content, images); setContent(''); setImages([]); };
  return <section className="view ideas-view">
    <div className="view-heading"><div><span className="eyebrow">CAPTURE STREAM</span><h1>灵感</h1><p>先记下来，稍后再决定它属于哪里。</p></div></div>
    <div className="idea-composer glass-panel"><textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="记录一个突然出现的想法……" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save(); }}/><ImageStrip images={images} onChange={setImages}/><div className="composer-footer"><span>Ctrl + Enter 保存</span><button className="primary-button" onClick={save}><Plus size={17}/> 保存灵感</button></div></div>
    {!db.ideas.length ? <EmptyState icon={<Lightbulb/>} title="这里还很安静" description="粘贴文字或图片，建立你的灵感流。"/> : <div className="idea-grid">{db.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onSave={updateIdea} onDelete={deleteIdea}/>)}</div>}
  </section>;
}

function IdeaCard({ idea, onSave, onDelete }: { idea: import('../types').Idea; onSave: (id:string, content:string, images:string[])=>void; onDelete:(id:string)=>void }) {
  const [content, setContent] = useState(idea.content); const [images, setImages] = useState(idea.images);
  const dirty = content !== idea.content || images.join('|') !== idea.images.join('|');
  return <article className="idea-card glass-panel"><time>{formatDate(idea.created_at, true)}</time><textarea value={content} onChange={(e) => setContent(e.target.value)}/><ImageStrip images={images} onChange={setImages}/><footer>{dirty ? <button className="text-button" onClick={() => onSave(idea.id, content, images)}><Save size={14}/> 保存修改</button> : <span>已保存</span>}<button className="icon-button danger" onClick={() => confirm('确定删除这条灵感吗？') && onDelete(idea.id)}><Trash2 size={15}/></button></footer></article>;
}
