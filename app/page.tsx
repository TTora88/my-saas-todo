"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Inbox,
  Calendar,
  Sun,
  ListTodo,
  Briefcase,
  Heart,
  Trash2,
  Check,
  Plus,
  GripVertical,
  Play,
  Flag,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";

type Category = "work" | "life";
type TabFilter = "work" | "life" | "all";

type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  category: Category;
  created_at?: string;
  order_index: number;
  due_date?: string | null;
  execution_date?: string | null;
};

type SortBy = "execution_date" | "due_date" | "created_at" | "title" | "manual";

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

type SidebarMenu = "inbox" | "today" | "next" | "calendar";

function mapRowToTodo(
  row: {
    id: string;
    title: string;
    is_done: boolean;
    category: string;
    created_at?: string;
    order_index?: number | null;
    due_date?: string | null;
    execution_date?: string | null;
  },
  index: number
): Todo {
  return {
    id: row.id,
    title: row.title,
    is_done: row.is_done ?? false,
    category: row.category === "life" ? "life" : "work",
    created_at: row.created_at,
    order_index: row.order_index ?? index,
    due_date: row.due_date ?? null,
    execution_date: row.execution_date ?? null,
  };
}

function formatDueDateDisplay(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  const month = parseInt(m!, 10);
  const day = parseInt(d!, 10);
  return `${month}월 ${day}일`;
}

function formatShortDate(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${parseInt(m!, 10)}.${parseInt(d!, 10)}`;
}

// ——— 입력창 + 실행일/마감일 (Dynamic Date Pickers) ———
function TodoInput({
  value,
  onChange,
  executionDate,
  onExecutionDateChange,
  dueDate,
  onDueDateChange,
  onSubmit,
  placeholder = "할 일 추가...",
  category,
}: {
  value: string;
  onChange: (v: string) => void;
  executionDate: string;
  onExecutionDateChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  category: Category;
}) {
  const execInputRef = useRef<HTMLInputElement>(null);
  const dueInputRef = useRef<HTMLInputElement>(null);

  const addTodo = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit();
      onChange("");
      onExecutionDateChange(getTodayISO());
      onDueDateChange("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTodo();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addTodo();
    }
  };

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (ref.current) {
      if (typeof ref.current.showPicker === "function") ref.current.showPicker();
      else ref.current.click();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap gap-2 sm:gap-3 p-2 rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-300 transition-all"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-[140px] px-5 py-3.5 rounded-xl bg-slate-50/80 text-slate-800 placeholder:text-slate-400 focus:outline-none border-0 text-base"
      />
      {/* 실행일 */}
      <div className="flex items-center shrink-0 min-w-[44px] overflow-hidden transition-all duration-300 rounded-xl border border-slate-200 bg-slate-50/80 focus-within:ring-2 focus-within:ring-indigo-500/30">
        <button
          type="button"
          onClick={() => openPicker(execInputRef)}
          className="relative flex items-center gap-2 py-3.5 pl-3 pr-3 text-slate-600 focus:outline-none text-left w-full"
        >
          <input
            ref={execInputRef}
            type="date"
            value={executionDate}
            onChange={(e) => onExecutionDateChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="실행일 선택"
          />
          <Play className="w-4 h-4 text-indigo-500 shrink-0 pointer-events-none" aria-hidden />
          <span
            className={`whitespace-nowrap text-sm text-slate-700 pointer-events-none transition-all duration-300 ${
              executionDate ? "max-w-[80px] opacity-100" : "max-w-0 overflow-hidden opacity-0"
            }`}
          >
            {executionDate ? formatShortDate(executionDate) : ""}
          </span>
        </button>
      </div>
      {/* 마감일 */}
      <div className="flex items-center shrink-0 min-w-[44px] overflow-hidden transition-all duration-300 rounded-xl border border-slate-200 bg-slate-50/80 focus-within:ring-2 focus-within:ring-indigo-500/30">
        <button
          type="button"
          onClick={() => openPicker(dueInputRef)}
          className="relative flex items-center gap-2 py-3.5 pl-3 pr-3 text-slate-600 focus:outline-none text-left w-full"
        >
          <input
            ref={dueInputRef}
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="마감일 선택"
          />
          <Flag className="w-4 h-4 text-amber-500 shrink-0 pointer-events-none" aria-hidden />
          <span
            className={`whitespace-nowrap text-sm text-slate-700 pointer-events-none transition-all duration-300 ${
              dueDate ? "max-w-[80px] opacity-100" : "max-w-0 overflow-hidden opacity-0"
            }`}
          >
            {dueDate ? formatShortDate(dueDate) : ""}
          </span>
        </button>
      </div>
      <button
        type="submit"
        className="shrink-0 flex items-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        <Plus className="w-5 h-5" />
        <span>추가</span>
      </button>
    </form>
  );
}

// ——— 할 일 카드 공통 내용 (뱃지 1클릭 → 네이티브 달력 즉시 오픈) ———
function TodoRowContent({
  todo,
  onToggle,
  onRemove,
  onExecutionDateChange,
  onDueDateChange,
  showDragHandle,
  dragHandle,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, v: string | null) => void;
  showDragHandle: boolean;
  dragHandle: React.ReactNode;
}) {
  const isWork = todo.category === "work";
  const today = getTodayISO();
  const isOverdue = todo.due_date && todo.due_date < today;

  return (
    <>
      {showDragHandle ? dragHandle : <span className="w-8 shrink-0" aria-hidden />}
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
          todo.is_done
            ? isWork
              ? "bg-indigo-500 border-indigo-500 text-white"
              : "bg-emerald-500 border-emerald-500 text-white"
            : "border-slate-300 hover:border-slate-400"
        }`}
      >
        {todo.is_done && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      </button>
      <span className="flex-1 min-w-0 flex flex-col gap-1.5">
        <span
          className={`break-words transition-colors duration-200 ${
            todo.is_done ? "line-through text-slate-400" : "text-slate-700"
          }`}
        >
          {todo.title}
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          {/* 실행일 뱃지: 클릭 시 showPicker()로 달력 강제 오픈 */}
          <span
            className="relative inline-block cursor-pointer"
            onClick={(e) => {
              const el = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
              if (el) {
                try {
                  if (typeof el.showPicker === "function") el.showPicker();
                  else el.focus();
                } catch {
                  el.focus();
                }
              }
            }}
            role="button"
            aria-label="실행일 선택"
            title="실행일 변경"
          >
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 whitespace-nowrap"
              aria-hidden
            >
              <Play className="w-3 h-3 text-indigo-500 shrink-0" />
              {todo.execution_date ? (
                <span>{formatShortDate(todo.execution_date)} 실행</span>
              ) : (
                <span>실행일 설정</span>
              )}
            </span>
            <input
              type="date"
              value={todo.execution_date ?? ""}
              onChange={(e) => onExecutionDateChange(todo.id, e.target.value || null)}
              className="opacity-0 absolute w-0 h-0 overflow-hidden -z-10 pointer-events-none"
              aria-hidden
              tabIndex={-1}
            />
          </span>
          {/* 마감일 뱃지: 클릭 시 showPicker()로 달력 강제 오픈 */}
          <span
            className="relative inline-block cursor-pointer"
            onClick={(e) => {
              const el = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
              if (el) {
                try {
                  if (typeof el.showPicker === "function") el.showPicker();
                  else el.focus();
                } catch {
                  el.focus();
                }
              }
            }}
            role="button"
            aria-label="마감일 선택"
            title="마감일 변경"
          >
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${
                isOverdue
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
              }`}
              aria-hidden
            >
              <Flag className="w-3 h-3 shrink-0" />
              {todo.due_date ? (
                <span>{formatShortDate(todo.due_date)} 마감</span>
              ) : (
                <span>마감일 설정</span>
              )}
            </span>
            <input
              type="date"
              value={todo.due_date ?? ""}
              onChange={(e) => onDueDateChange(todo.id, e.target.value || null)}
              className="opacity-0 absolute w-0 h-0 overflow-hidden -z-10 pointer-events-none"
              aria-hidden
              tabIndex={-1}
            />
          </span>
        </span>
      </span>
      <span
        className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg ${
          isWork
            ? "bg-indigo-100 text-indigo-700"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {isWork ? "Work" : "Life"}
      </span>
      <button
        type="button"
        onClick={() => onRemove(todo.id)}
        className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-200"
        aria-label="삭제"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </>
  );
}

// ——— 정렬 가능한 할 일 카드 (드래그 핸들 + 드래그 중 스타일) ———
function SortableTodoRow({
  todo,
  onToggle,
  onRemove,
  onExecutionDateChange,
  onDueDateChange,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, dueDate: string | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 ease-out ${
        isDragging ? "opacity-80 shadow-xl ring-2 ring-indigo-500/30 z-10" : ""
      }`}
    >
      <TodoRowContent
        todo={todo}
        onToggle={onToggle}
        onRemove={onRemove}
        onExecutionDateChange={onExecutionDateChange}
        onDueDateChange={onDueDateChange}
        showDragHandle
        dragHandle={
          <button
            type="button"
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-none cursor-grab active:cursor-grabbing"
            aria-label="드래그"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-5 h-5" />
          </button>
        }
      />
    </li>
  );
}

// ——— 드래그 없는 할 일 카드 (정렬 모드가 수동이 아닐 때) ———
function TodoRow({
  todo,
  onToggle,
  onRemove,
  onExecutionDateChange,
  onDueDateChange,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, v: string | null) => void;
}) {
  return (
    <li className="group flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 ease-out">
      <TodoRowContent
        todo={todo}
        onToggle={onToggle}
        onRemove={onRemove}
        onExecutionDateChange={onExecutionDateChange}
        onDueDateChange={onDueDateChange}
        showDragHandle={false}
        dragHandle={null}
      />
    </li>
  );
}

// ——— 탭 버튼 (Work / Life / All) ———
function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: TabFilter; label: string; icon: React.ReactNode }[];
  active: TabFilter;
  onSelect: (id: TabFilter) => void;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-slate-100/80 border border-slate-200/80 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1 ${
            active === tab.id
              ? "bg-white text-slate-800 shadow-sm border border-slate-200/80"
              : "text-slate-600 hover:text-slate-800 hover:bg-white/50"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function TodoApp() {
  const router = useRouter();
  const [menu, setMenu] = useState<SidebarMenu>("inbox");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 정렬: 실행일 | 마감일 | 추가한 날짜 | 이름 | 수동
  const [sortBy, setSortBy] = useState<SortBy>("manual");

  // Inbox: work | life
  const [inboxTab, setInboxTab] = useState<"work" | "life">("work");
  const [inboxInput, setInboxInput] = useState("");
  const [inboxExecutionDate, setInboxExecutionDate] = useState(() => getTodayISO());
  const [inboxDueDate, setInboxDueDate] = useState("");

  // Today: all | work | life
  const [todayTab, setTodayTab] = useState<TabFilter>("all");
  const [todayInput, setTodayInput] = useState("");
  const [todayExecutionDate, setTodayExecutionDate] = useState(() => getTodayISO());
  const [todayDueDate, setTodayDueDate] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const fetchTodos = async () => {
    setFetchError(null);
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, is_done, category, created_at, order_index, due_date, execution_date")
      .order("order_index", { ascending: true });
    if (error) {
      const msg = error.message ?? String(error);
      const code = error.code ?? "";
      console.error("todos fetch error:", { message: msg, code, details: error.details });
      setFetchError(msg);
      return;
    }
    setTodos((data ?? []).map((row, i) => mapRowToTodo(row, i)));
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchTodos().finally(() => setLoading(false));
  }, [authChecked]);

  const addTodo = async (
    text: string,
    category: Category,
    executionDate?: string | null,
    dueDate?: string | null
  ) => {
    const nextOrder =
      todos.length === 0 ? 0 : Math.max(...todos.map((t) => t.order_index)) + 100;
    const execDate = executionDate || getTodayISO();
    const { error } = await supabase.from("todos").insert({
      title: text,
      is_done: false,
      category,
      order_index: nextOrder,
      execution_date: execDate,
      due_date: dueDate || null,
    });
    if (error) {
      console.error("todos insert error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const toggleTodo = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const { error } = await supabase
      .from("todos")
      .update({ is_done: !todo.is_done })
      .eq("id", id);
    if (error) {
      console.error("todos update error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const removeTodo = async (id: string) => {
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) {
      console.error("todos delete error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const updateTodoDueDate = async (id: string, dueDate: string | null) => {
    const { error } = await supabase
      .from("todos")
      .update({ due_date: dueDate || null })
      .eq("id", id);
    if (error) {
      console.error("todos update due_date error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const updateTodoExecutionDate = async (id: string, executionDate: string | null) => {
    const { error } = await supabase
      .from("todos")
      .update({ execution_date: executionDate || null })
      .eq("id", id);
    if (error) {
      console.error("todos update execution_date error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const sortedTodos = useMemo(
    () => [...todos].sort((a, b) => a.order_index - b.order_index),
    [todos]
  );

  const displaySortedTodos = useMemo(() => {
    const list = [...sortedTodos];
    if (sortBy === "manual") {
      return list;
    }
    return list.sort((a, b) => {
      if (sortBy === "execution_date") {
        const aEx = a.execution_date ?? "9999-99-99";
        const bEx = b.execution_date ?? "9999-99-99";
        if (aEx !== bEx) return aEx.localeCompare(bEx);
      } else if (sortBy === "due_date") {
        const aDue = a.due_date ?? "9999-99-99";
        const bDue = b.due_date ?? "9999-99-99";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
      } else if (sortBy === "created_at") {
        const aT = a.created_at ?? "";
        const bT = b.created_at ?? "";
        if (aT !== bT) return aT.localeCompare(bT);
      } else if (sortBy === "title") {
        const c = (a.title ?? "").localeCompare(b.title ?? "", "ko");
        if (c !== 0) return c;
      }
      return a.order_index - b.order_index;
    });
  }, [sortedTodos, sortBy]);

  const filterByCategory = (list: Todo[], tab: TabFilter) => {
    if (tab === "all") return list;
    return list.filter((t) => t.category === tab);
  };

  /** Today 메뉴일 때: execution_date가 오늘인 항목만 먼저 필터 */
  const todayFilteredTodos = useMemo(() => {
    const todayStr = getTodayISO();
    return displaySortedTodos.filter((t) => t.execution_date === todayStr);
  }, [displaySortedTodos]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const tab =
      menu === "inbox" ? inboxTab : menu === "today" ? todayTab : "all";
    const baseList = menu === "today" ? todayFilteredTodos : displaySortedTodos;
    const filtered = filterByCategory(baseList, tab);
    const oldIndex = filtered.findIndex((t) => t.id === active.id);
    const newIndex = filtered.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFiltered = arrayMove(filtered, oldIndex, newIndex);
    const filteredIds = new Set(reorderedFiltered.map((t) => t.id));
    const newDisplayOrder = [...displaySortedTodos];
    let reorderedIdx = 0;
    for (let i = 0; i < newDisplayOrder.length; i++) {
      if (filteredIds.has(newDisplayOrder[i].id)) {
        newDisplayOrder[i] = reorderedFiltered[reorderedIdx++];
      }
    }
    const withNewOrder: Todo[] = newDisplayOrder.map((t, i) => ({
      ...t,
      order_index: i,
    }));

    setTodos(withNewOrder);

    await Promise.all(
      withNewOrder.map((t) =>
        supabase.from("todos").update({ order_index: t.order_index }).eq("id", t.id)
      )
    );
  };

  const sidebarItems: { id: SidebarMenu; label: string; icon: React.ReactNode }[] = [
    { id: "inbox", label: "Inbox", icon: <Inbox className="w-5 h-5" /> },
    { id: "today", label: "Today", icon: <Sun className="w-5 h-5" /> },
    { id: "next", label: "Next", icon: <ListTodo className="w-5 h-5" /> },
    { id: "calendar", label: "Calendar", icon: <Calendar className="w-5 h-5" /> },
  ];

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/90 text-slate-500 text-sm">
        확인 중...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col md:flex-row text-slate-800 font-sans antialiased">
      {/* 좌측 사이드바 */}
      <aside className="w-full md:w-64 flex-shrink-0 flex flex-col justify-between p-6 bg-slate-50 border-r border-slate-200">
        <div>
          <h1 className="mb-8">
            <div className="flex items-center gap-1.5 px-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-full w-full p-1 text-white"
                  aria-hidden
                >
                  <path d="M2.5 12C2.5 7.5 6 4 10 4C13 4 15 6 17 9C18.5 11.5 20 12 21.5 12C22.3 12 23 11.3 23 10.5C23 12.5 21.5 16 18.5 16C15.5 16 13.5 14 11.5 11C10 8.5 8.5 8 7.5 8C6 8 5.5 10 5.5 12C5.5 15 8 17 10 17C10.5 17 11 17.5 11 18C11 18.5 10.5 19 10 19C7 19 2.5 16 2.5 12Z" />
                </svg>
              </div>
              <span className="text-2xl font-extrabold tracking-tighter text-slate-900">
                <span className="text-indigo-600">Do</span>Flow<span className="text-indigo-400">.</span>
              </span>
            </div>
          </h1>
          <nav className="flex flex-row md:flex-col gap-1 flex-wrap md:flex-nowrap">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMenu(item.id)}
                className={`w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                  menu === item.id
                    ? "bg-slate-200 text-slate-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200 mt-6 md:mt-0"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
            aria-hidden
          >
            <path
              d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          로그아웃
        </button>
      </aside>

      {/* 우측 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto bg-white p-8 md:p-12">
        {loading && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            로딩 중...
          </div>
        )}
        {!loading && (
          <div className="flex-1 flex flex-col min-w-0">
            {fetchError && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <p className="font-medium">할 일 목록을 불러올 수 없습니다</p>
                <p className="mt-1 text-amber-700">{fetchError}</p>
                <p className="mt-2 text-amber-600 text-xs">
                  Supabase에 <code className="bg-amber-100 px-1 rounded">todos</code> 테이블이 있는지, RLS 정책을 확인해 주세요.
                </p>
              </div>
            )}
            {menu === "inbox" && (
              <>
                <div className="mb-6">
                  <Tabs
                    tabs={[
                      {
                        id: "work",
                        label: "Work",
                        icon: <Briefcase className="w-4 h-4 text-blue-600" />,
                      },
                      {
                        id: "life",
                        label: "Life",
                        icon: <Heart className="w-4 h-4 text-emerald-600" />,
                      },
                    ]}
                    active={inboxTab}
                    onSelect={(id) => setInboxTab(id as "work" | "life")}
                  />
                </div>
                <div className="mb-2 flex justify-end">
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <span>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="execution_date">실행일</option>
                      <option value="due_date">마감일</option>
                      <option value="created_at">추가한 날짜</option>
                      <option value="title">이름</option>
                      <option value="manual">수동</option>
                    </select>
                  </label>
                </div>
                <div className="mb-6">
                  <TodoInput
                    value={inboxInput}
                    onChange={setInboxInput}
                    executionDate={inboxExecutionDate}
                    onExecutionDateChange={setInboxExecutionDate}
                    dueDate={inboxDueDate}
                    onDueDateChange={setInboxDueDate}
                    onSubmit={() => {
                      addTodo(inboxInput.trim(), inboxTab, inboxExecutionDate || null, inboxDueDate || null);
                      setInboxInput("");
                      setInboxExecutionDate(getTodayISO());
                      setInboxDueDate("");
                    }}
                    placeholder={`${inboxTab === "work" ? "Work" : "Life"} 할 일 추가...`}
                    category={inboxTab}
                  />
                </div>
                {sortBy === "manual" ? (
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={filterByCategory(displaySortedTodos, inboxTab).map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                        {filterByCategory(displaySortedTodos, inboxTab).length === 0 ? (
                          <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                            할 일을 입력하고 추가해 보세요
                          </li>
                        ) : (
                          filterByCategory(displaySortedTodos, inboxTab).map((todo) => (
                            <SortableTodoRow
                              key={todo.id}
                              todo={todo}
                              onToggle={toggleTodo}
                              onRemove={removeTodo}
                              onExecutionDateChange={updateTodoExecutionDate}
                              onDueDateChange={updateTodoDueDate}
                            />
                          ))
                        )}
                      </ul>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <ul className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                    {filterByCategory(displaySortedTodos, inboxTab).length === 0 ? (
                      <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                        할 일을 입력하고 추가해 보세요
                      </li>
                    ) : (
                      filterByCategory(displaySortedTodos, inboxTab).map((todo) => (
                        <TodoRow
                          key={todo.id}
                          todo={todo}
                          onToggle={toggleTodo}
                          onRemove={removeTodo}
                          onExecutionDateChange={updateTodoExecutionDate}
                          onDueDateChange={updateTodoDueDate}
                        />
                      ))
                    )}
                  </ul>
                )}
              </>
            )}

            {menu === "today" && (
              <>
                <div className="mb-6">
                  <Tabs
                    tabs={[
                      {
                        id: "all",
                        label: "All",
                        icon: <ListTodo className="w-4 h-4 text-slate-600" />,
                      },
                      {
                        id: "work",
                        label: "Work",
                        icon: <Briefcase className="w-4 h-4 text-blue-600" />,
                      },
                      {
                        id: "life",
                        label: "Life",
                        icon: <Heart className="w-4 h-4 text-emerald-600" />,
                      },
                    ]}
                    active={todayTab}
                    onSelect={setTodayTab}
                  />
                </div>
                <div className="mb-2 flex justify-end">
                  <label className="flex items-center gap-2 text-sm text-slate-500">
                    <span>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="execution_date">실행일</option>
                      <option value="due_date">마감일</option>
                      <option value="created_at">추가한 날짜</option>
                      <option value="title">이름</option>
                      <option value="manual">수동</option>
                    </select>
                  </label>
                </div>
                {sortBy === "manual" ? (
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext
                      items={filterByCategory(todayFilteredTodos, todayTab).map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-6">
                        {filterByCategory(todayFilteredTodos, todayTab).length === 0 ? (
                          <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                            오늘 실행할 일이 없습니다
                          </li>
                        ) : (
                          filterByCategory(todayFilteredTodos, todayTab).map((todo) => (
                            <SortableTodoRow
                              key={todo.id}
                              todo={todo}
                              onToggle={toggleTodo}
                              onRemove={removeTodo}
                              onExecutionDateChange={updateTodoExecutionDate}
                              onDueDateChange={updateTodoDueDate}
                            />
                          ))
                        )}
                      </ul>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <ul className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-6">
                    {filterByCategory(todayFilteredTodos, todayTab).length === 0 ? (
                      <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                        오늘 실행할 일이 없습니다
                      </li>
                    ) : (
                      filterByCategory(todayFilteredTodos, todayTab).map((todo) => (
                        <TodoRow
                          key={todo.id}
                          todo={todo}
                          onToggle={toggleTodo}
                          onRemove={removeTodo}
                          onExecutionDateChange={updateTodoExecutionDate}
                          onDueDateChange={updateTodoDueDate}
                        />
                      ))
                    )}
                  </ul>
                )}
                <div className="rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 p-2">
                  <TodoInput
                    value={todayInput}
                    onChange={setTodayInput}
                    executionDate={todayExecutionDate}
                    onExecutionDateChange={setTodayExecutionDate}
                    dueDate={todayDueDate}
                    onDueDateChange={setTodayDueDate}
                    onSubmit={() => {
                      const category: Category =
                        todayTab === "life" ? "life" : "work";
                      addTodo(todayInput.trim(), category, todayExecutionDate || null, todayDueDate || null);
                      setTodayInput("");
                      setTodayExecutionDate(getTodayISO());
                      setTodayDueDate("");
                    }}
                    placeholder={
                      todayTab === "all"
                        ? "할 일 추가 (기본: Work)"
                        : `${todayTab === "work" ? "Work" : "Life"} 할 일 추가...`
                    }
                    category={todayTab === "life" ? "life" : "work"}
                  />
                </div>
              </>
            )}

            {(menu === "next" || menu === "calendar") && (
              <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                {menu === "next" ? "Next" : "Calendar"} 화면은 준비 중입니다.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
