import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const STORAGE_KEY = "ksyunya_task_tracker_v4";
const OLD_KEYS = ["ksyunya_task_tracker_v3", "ksyunya_task_tracker_v2", "ksyunya_task_tracker_v1"];

const projectTree = [
  { id: "yandex", name: "Яндекс", color: "tag-yellow", children: [
    { id: "yandex-books", name: "Яндекс Книги", color: "tag-amber" },
    { id: "yandex-music", name: "Яндекс Музыка", color: "tag-pink" },
    { id: "allplay", name: "Allplay", color: "tag-sky" },
    { id: "yandex-common", name: "Общие задачи", color: "tag-lime" },
  ]},
  { id: "arammeem", name: "AramMeem", color: "tag-emerald", children: [
    { id: "toyou", name: "ToYou", color: "tag-green" },
    { id: "cocolime", name: "Cocolime", color: "tag-rose" },
  ]},
  { id: "pulsend", name: "Pulsend", color: "tag-orange", children: [] },
  { id: "ovva", name: "OVVA", color: "tag-violet", children: [] },
];

const flatProjects = projectTree.flatMap((project) => [project, ...(project.children || []).map((child) => ({ ...child, parentId: project.id, parentName: project.name }))]);
const statuses = [
  { id: "new", label: "Новая", color: "status-new", card: "card-new" },
  { id: "in_progress", label: "В работе", color: "status-progress", card: "card-progress" },
  { id: "waiting", label: "Жду ответа", color: "status-waiting", card: "card-waiting" },
  { id: "done", label: "Выполнено", color: "status-done", card: "card-done" },
];
const priorityLabels = {
  pinned: { label: "Важное", color: "priority-pinned", icon: "★" },
  low: { label: "Можно позже", color: "priority-low", icon: "☁" },
};

const initialData = { tasks: [], notes: [] };
function createId(){ return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nowIso(){ return new Date().toISOString(); }
function parsePossibleDate(value){
  if(!value) return new Date();
  const parsed = new Date(value);
  if(!Number.isNaN(parsed.getTime())) return parsed;
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2})?:(\d{2})?/);
  if(match){ const [,d,m,y,h="00",min="00"] = match; return new Date(Number(y), Number(m)-1, Number(d), Number(h), Number(min)); }
  return new Date();
}
function formatDateTime(value){ return parsePossibleDate(value).toLocaleString("ru-RU", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
function formatShortDate(date){ return `${date.getDate()}.${date.getMonth()+1}`; }
function getWeekNumber(date){ const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate()+4-day); const start = new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil(((d-start)/86400000+1)/7); }
function getSprintBadge(value){ const date = parsePossibleDate(value); const start = new Date(date); const day = start.getDay() || 7; start.setDate(start.getDate()-day+1); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(start.getDate()+6); return `week ${getWeekNumber(date)} (${formatShortDate(start)} - ${formatShortDate(end)})`; }
function getProject(id){ return flatProjects.find((p)=>p.id===id) || flatProjects[0]; }
function getStatus(id){ return statuses.find((s)=>s.id===id) || statuses[0]; }
function normalizeTask(task){ return { id:createId(), title:"", comment:"", projectId:"yandex-music", status:"new", priority:"normal", createdAt:nowIso(), completedAt:null, ...task }; }
function normalizeNote(note){ return { id:createId(), text:"", createdAt:nowIso(), ...note }; }
function dedupeById(items){ const seen = new Set(); return items.filter((item)=>{ if(!item?.id || seen.has(item.id)) return false; seen.add(item.id); return true; }); }
function safeParseStorage(key){ try{ const raw = localStorage.getItem(key); if(!raw) return null; const parsed = JSON.parse(raw); return { tasks:Array.isArray(parsed?.tasks)?parsed.tasks.map(normalizeTask):[], notes:Array.isArray(parsed?.notes)?parsed.notes.map(normalizeNote):[] }; }catch{return null;} }
function loadInitialData(){ const current = safeParseStorage(STORAGE_KEY); if(current) return current; const merged={tasks:[],notes:[]}; let found=false; for(const key of OLD_KEYS){ const oldData=safeParseStorage(key); if(oldData){ merged.tasks.push(...oldData.tasks); merged.notes.push(...oldData.notes); found=true; } } return found ? {tasks:dedupeById(merged.tasks),notes:dedupeById(merged.notes)} : initialData; }
function filterTasks(tasks, projectFilter, statusFilter, search){ const q=search.trim().toLowerCase(); return tasks.filter((task)=>{ const p=getProject(task.projectId); const projectOk=projectFilter==="all"||task.projectId===projectFilter||p.parentId===projectFilter; const statusOk=statusFilter==="all"||(statusFilter==="active"&&task.status!=="done")||task.status===statusFilter; const text=`${task.title} ${task.comment||""} ${p.name} ${p.parentName||""} ${getSprintBadge(task.createdAt)} ${task.priority}`.toLowerCase(); return projectOk && statusOk && (!q || text.includes(q)); }); }
function sortTasks(tasks){ const score={pinned:0,normal:1,low:2}; return [...tasks].sort((a,b)=>{ if(a.status==="done"&&b.status!=="done") return 1; if(a.status!=="done"&&b.status==="done") return -1; const pr=(score[a.priority||"normal"]??1)-(score[b.priority||"normal"]??1); if(pr!==0) return pr; return parsePossibleDate(b.createdAt).getTime()-parsePossibleDate(a.createdAt).getTime(); }); }
function getStats(tasks){ return { active:tasks.filter(t=>t.status!=="done").length, inProgress:tasks.filter(t=>t.status==="in_progress").length, waiting:tasks.filter(t=>t.status==="waiting").length, pinned:tasks.filter(t=>t.priority==="pinned"&&t.status!=="done").length, done:tasks.filter(t=>t.status==="done").length }; }

function App(){
  const [data,setData]=useState(loadInitialData); const [activeTab,setActiveTab]=useState("tasks"); const [editingId,setEditingId]=useState(null); const [projectFilter,setProjectFilter]=useState("all"); const [statusFilter,setStatusFilter]=useState("active"); const [search,setSearch]=useState(""); const [noteDraft,setNoteDraft]=useState(""); const [taskDraft,setTaskDraft]=useState({title:"",comment:"",projectId:"yandex-music",priority:"normal"});
  useEffect(()=>{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); },[data]);
  const normalizedTasks=useMemo(()=>data.tasks.map(normalizeTask),[data.tasks]); const normalizedNotes=useMemo(()=>data.notes.map(normalizeNote),[data.notes]); const filteredTasks=useMemo(()=>sortTasks(filterTasks(normalizedTasks,projectFilter,statusFilter,search)),[normalizedTasks,projectFilter,statusFilter,search]); const stats=useMemo(()=>getStats(normalizedTasks),[normalizedTasks]);
  function addTask(){ const title=taskDraft.title.trim(); const id=createId(); setData(prev=>({...prev,tasks:[{id,title,comment:taskDraft.comment.trim(),projectId:taskDraft.projectId,priority:taskDraft.priority,status:"new",createdAt:nowIso(),completedAt:null},...prev.tasks]})); setTaskDraft(prev=>({...prev,title:"",comment:"",priority:"normal"})); setEditingId(title?null:id); setActiveTab("tasks"); }
  function updateTask(id,patch){ setData(prev=>({...prev,tasks:prev.tasks.map(raw=>{ const task=normalizeTask(raw); if(task.id!==id) return task; const nextStatus=patch.status??task.status; const completedAt=nextStatus==="done"&&task.status!=="done"?nowIso():nextStatus!=="done"?null:task.completedAt; return {...task,...patch,completedAt}; })})); }
  function togglePriority(id,priority){ setData(prev=>({...prev,tasks:prev.tasks.map(raw=>{ const task=normalizeTask(raw); return task.id===id ? {...task,priority:task.priority===priority?"normal":priority} : task; })})); }
  function deleteTask(id){ setData(prev=>({...prev,tasks:prev.tasks.filter(t=>t.id!==id)})); }
  function addNote(){ if(!noteDraft.trim()) return; setData(prev=>({...prev,notes:[{id:createId(),text:noteDraft.trim(),createdAt:nowIso()},...prev.notes]})); setNoteDraft(""); }
  function deleteNote(id){ setData(prev=>({...prev,notes:prev.notes.filter(n=>n.id!==id)})); }
  function noteToTask(note){ const id=createId(); setData(prev=>({notes:prev.notes.filter(n=>n.id!==note.id),tasks:[{id,title:note.text,comment:"Создано из заметки",projectId:"yandex-music",priority:"normal",status:"new",createdAt:nowIso(),completedAt:null},...prev.tasks]})); setEditingId(id); setActiveTab("tasks"); }
  function exportData(){ const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="task-tracker-backup.json"; a.click(); URL.revokeObjectURL(url); }
  function importData(event){ const file=event.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const parsed=JSON.parse(String(reader.result)); setData({tasks:Array.isArray(parsed.tasks)?parsed.tasks.map(normalizeTask):[], notes:Array.isArray(parsed.notes)?parsed.notes.map(normalizeNote):[]}); }catch{ alert("Не получилось импортировать файл"); } }; reader.readAsText(file); }
  return <div className="page"><div className="container"><header className="header"><div><div className="pill muted">личный тасктрекер</div><h1>Задачи как заметки</h1><p>Простой список с проектами, цветными статусами, комментариями, неделями и отдельными заметками.</p></div><div className="stats"><Stat label="Активные" value={stats.active}/><Stat label="В работе" value={stats.inProgress}/><Stat label="Жду" value={stats.waiting}/><Stat label="Важные" value={stats.pinned}/><Stat label="Готово" value={stats.done}/></div></header><div className="tabs"><button className={activeTab==="tasks"?"active":""} onClick={()=>setActiveTab("tasks")}>Задачи</button><button className={activeTab==="notes"?"active":""} onClick={()=>setActiveTab("notes")}>Заметки / не забыть</button><button onClick={exportData}>Скачать backup</button><label className="button-like">Загрузить backup<input type="file" accept="application/json" onChange={importData}/></label></div>{activeTab==="tasks" ? <div className="layout"><aside className="panel"><h2>Новая задача</h2><textarea value={taskDraft.title} onChange={e=>setTaskDraft(p=>({...p,title:e.target.value}))} placeholder="Что нужно сделать?"/><textarea value={taskDraft.comment} onChange={e=>setTaskDraft(p=>({...p,comment:e.target.value}))} placeholder="Комментарий, если нужен" className="small"/><ProjectSelect value={taskDraft.projectId} onChange={value=>setTaskDraft(p=>({...p,projectId:value}))}/><div className="two"><button onClick={()=>setTaskDraft(p=>({...p,priority:p.priority==="pinned"?"normal":"pinned"}))} className={taskDraft.priority==="pinned"?"priority-pinned":""}>★ Важное</button><button onClick={()=>setTaskDraft(p=>({...p,priority:p.priority==="low"?"normal":"low"}))} className={taskDraft.priority==="low"?"priority-low":""}>☁ Можно позже</button></div><button className="primary" onClick={addTask}>+ Добавить задачу</button><hr/><h2>Фильтры</h2><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по задачам"/><ProjectSelect value={projectFilter} onChange={setProjectFilter} includeAll/><div className="filter-buttons">{[{id:"active",label:"Активные"},{id:"all",label:"Все"},...statuses].map(s=><button key={s.id} onClick={()=>setStatusFilter(s.id)} className={statusFilter===s.id?"dark":""}>{s.label}</button>)}</div></aside><main className="task-list">{filteredTasks.length===0?<div className="empty">Пока задач нет. Добавь первую задачу в блоке слева.</div>:filteredTasks.map(task=><TaskCard key={task.id} task={task} editingId={editingId} setEditingId={setEditingId} updateTask={updateTask} togglePriority={togglePriority} deleteTask={deleteTask}/>)}</main></div> : <div className="layout"><aside className="panel"><h2>Быстрая заметка</h2><textarea className="notearea" value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Мысль, ссылка, идея, что обсудить, что не забыть..."/><button className="primary" onClick={addNote}>Сохранить заметку</button></aside><main className="notes">{normalizedNotes.length===0?<div className="empty">Пока заметок нет.</div>:normalizedNotes.map(note=><div className="note" key={note.id}><p>{note.text}</p><span>Создано: {formatDateTime(note.createdAt)}</span><div><button onClick={()=>noteToTask(note)}>Сделать задачей</button><button onClick={()=>deleteNote(note.id)}>Удалить</button></div></div>)}</main></div>}</div></div>;
}
function Stat({label,value}){ return <div className="stat"><b>{value}</b><span>{label}</span></div>; }
function ProjectSelect({value,onChange,includeAll=false}){ return <select value={value} onChange={e=>onChange(e.target.value)}>{includeAll&&<option value="all">Все проекты</option>}{projectTree.map(p=><React.Fragment key={p.id}><option value={p.id}>{p.name}</option>{p.children.map(c=><option key={c.id} value={c.id}>— {c.name}</option>)}</React.Fragment>)}</select>; }
function TaskCard({task,editingId,setEditingId,updateTask,togglePriority,deleteTask}){ const t=normalizeTask(task); const p=getProject(t.projectId); const s=getStatus(t.status); const isEditing=editingId===t.id; const priority=priorityLabels[t.priority]; return <div className={`task ${s.card} ${t.priority==="low"?"low-opacity":""}`}><div className="badges"><div><span className={`pill ${p.color}`}>{p.parentName?`${p.parentName} / ${p.name}`:p.name}</span><span className="pill sprint">{getSprintBadge(t.createdAt)}</span>{priority&&<span className={`pill ${priority.color}`}>{priority.icon} {priority.label}</span>}</div><span className={`pill ${s.color}`}>{s.label}</span></div>{isEditing?<div className="edit"><textarea value={t.title} onChange={e=>updateTask(t.id,{title:e.target.value})} placeholder="Название задачи" autoFocus/><textarea className="small" value={t.comment} onChange={e=>updateTask(t.id,{comment:e.target.value})} placeholder="Комментарий мелким текстом"/><ProjectSelect value={t.projectId} onChange={value=>updateTask(t.id,{projectId:value})}/></div>:<div><h3 className={t.status==="done"?"done-title":""}>{t.title||"Без названия"}</h3>{t.comment&&<p className="comment">{t.comment}</p>}</div>}<div className="footer"><div className="time"><span>Создано: {formatDateTime(t.createdAt)}</span>{t.completedAt&&<span>Выполнено: {formatDateTime(t.completedAt)}</span>}</div><div className="actions"><button onClick={()=>togglePriority(t.id,"pinned")} className={t.priority==="pinned"?"priority-pinned":""}>★</button><button onClick={()=>togglePriority(t.id,"low")} className={t.priority==="low"?"priority-low":""}>☁</button><select value={t.status} onChange={e=>updateTask(t.id,{status:e.target.value})} className={s.color}>{statuses.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select><button onClick={()=>setEditingId(isEditing?null:t.id)}>{isEditing?"Сохранить":"Редактировать"}</button><button onClick={()=>deleteTask(t.id)}>Удалить</button></div></div></div>; }
createRoot(document.getElementById("root")).render(<App/>);
