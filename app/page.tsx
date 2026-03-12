"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
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
  Trash2,
  Check,
  Plus,
  Play,
  Flag,
  Briefcase,
  Heart,
  Folder,
  X,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";

const DEFAULT_CATEGORIES = ["Work", "Life"];
const CATEGORIES_STORAGE_KEY = "todo-categories";
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function getCategoryIcon(name: string, className = "w-4 h-4"): React.ReactNode {
  const n = (name || "").trim().toLowerCase();
  if (n === "inbox") return <Inbox className={className} />;
  if (n === "work") return <Briefcase className={className} />;
  if (n === "life") return <Heart className={className} />;
  return <Folder className={className} />;
}

function loadCategories(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_CATEGORIES];
  try {
    const s = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        const filtered = (parsed as string[]).filter((c) => c.trim().toLowerCase() !== "inbox");
        return filtered.length > 0 ? filtered : [...DEFAULT_CATEGORIES];
      }
    }
  } catch {}
  return [...DEFAULT_CATEGORIES];
}

type Todo = {
  id: string;
  title: string;
  is_done: boolean;
  category: string | null;
  created_at?: string;
  completed_at?: string | null;
  order_index: number;
  due_date?: string | null;
  execution_date?: string | null;
};

type SortBy = "execution_date" | "due_date" | "created_at" | "title";

function toLocalDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayISO() {
  return toLocalDateString(new Date());
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 주말 여부 (토=6, 일=0) */
function isWeekend(date: Date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

/** 공휴일 목록 (YYYY-MM-DD). 필요 시 확장 */
const HOLIDAYS_ISO: string[] = [];

type SidebarMenu = "inbox" | "today" | "next" | "calendar";

function mapRowToTodo(
  row: {
    id: string;
    title: string;
    is_done: boolean;
    category?: string | null;
    created_at?: string;
    completed_at?: string | null;
    order_index?: number | null;
    due_date?: string | null;
    execution_date?: string | null;
  },
  index: number
): Todo {
  const category =
    row.category != null && String(row.category).trim() !== ""
      ? String(row.category).trim()
      : null;
  return {
    id: row.id,
    title: row.title,
    is_done: row.is_done ?? false,
    category,
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
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
}: {
  value: string;
  onChange: (v: string) => void;
  executionDate: string;
  onExecutionDateChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
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

// ——— 할 일 카드 공통 내용 (뱃지 1클릭 → 네이티브 달력 즉시 오픈 + 제목 인라인 편집) ———
function TodoRowContent({
  todo,
  onToggle,
  onRemove,
  onExecutionDateChange,
  onDueDateChange,
  isEditingTitle,
  editTitle,
  onEditTitleChange,
  onStartEditTitle,
  onSaveEditTitle,
  onCancelEditTitle,
  compact = false,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, v: string | null) => void;
  isEditingTitle: boolean;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEditTitle: () => void;
  onSaveEditTitle: () => void;
  onCancelEditTitle: () => void;
  compact?: boolean;
}) {
  const displayCategory =
    !todo.category ||
    !todo.category.trim() ||
    (todo.category || "").toLowerCase() === "general"
      ? "Inbox"
      : todo.category;
  const isWork = displayCategory.toLowerCase() === "work";
  const today = getTodayISO();
  const isOverdue = todo.due_date && todo.due_date < today;

  // Next 뷰 등에서 사용하는 초슬림 콤팩트 모드
  if (compact) {
    return (
      <>
        {/* 좌측: 체크박스 + 제목 (여러 줄 허용, 자연스러운 줄바꿈) */}
        <div className="flex items-start gap-2 flex-1 min-w-0">
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
            {todo.is_done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </button>
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => onEditTitleChange(e.target.value)}
                onBlur={onSaveEditTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSaveEditTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEditTitle();
                  }
                }}
                autoFocus
                className="w-full min-w-0 bg-black/5 outline-none border-0 rounded-sm text-sm leading-snug px-1 py-0.5 text-slate-700 focus:ring-0 break-words whitespace-normal"
                aria-label="제목 수정"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={onStartEditTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStartEditTitle();
                  }
                }}
                className={`block break-words whitespace-normal text-sm cursor-text ${
                  todo.is_done ? "line-through text-slate-400" : "text-slate-700"
                }`}
                title={todo.title}
              >
                {todo.title}
              </span>
            )}
          </div>
        </div>

        {/* 우측: 마감일/카테고리/휴지통 (세로 정렬) */}
        <div className="flex flex-col items-end justify-start gap-1.5 shrink-0 text-xs text-slate-500">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 whitespace-nowrap ${
              isOverdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
            }`}
            title="마감일"
          >
            <Flag className="w-2.5 h-2.5" />
            {todo.due_date ? (
              <span>{formatShortDate(todo.due_date)} 마감</span>
            ) : (
              <span>마감일 설정</span>
            )}
          </span>
          <span
            className={`hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
              displayCategory.toLowerCase() === "work"
                ? "bg-blue-100 text-blue-700"
                : displayCategory.toLowerCase() === "life"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
            }`}
            title={displayCategory}
          >
            {displayCategory}
          </span>
          <button
            type="button"
            onClick={() => onRemove(todo.id)}
            className="p-1.5 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            aria-label="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
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
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        {isEditingTitle ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onBlur={onSaveEditTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveEditTitle();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEditTitle();
              }
            }}
            autoFocus
            className="w-full min-w-0 bg-black/10 outline-none border-0 rounded-md break-words text-inherit px-1.5 py-0.5 text-slate-700 focus:ring-0 transition-colors duration-200"
            aria-label="제목 수정"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={onStartEditTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onStartEditTitle();
              }
            }}
            className={`break-words transition-colors duration-200 cursor-text hover:bg-slate-50/80 rounded px-0.5 -mx-0.5 ${
              todo.is_done ? "line-through text-slate-400" : "text-slate-700"
            }`}
          >
            {todo.title}
          </span>
        )}
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
        className={`shrink-0 text-xs rounded-md px-2 py-0.5 font-medium capitalize ${
          displayCategory.toLowerCase() === "work"
            ? "bg-blue-100 text-blue-700"
            : displayCategory.toLowerCase() === "life"
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-700"
        }`}
        title={displayCategory}
      >
        {displayCategory}
      </span>
      <button
        type="button"
        onClick={() => onRemove(todo.id)}
        className="shrink-0 p-1.5 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-200"
        aria-label="삭제"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </>
  );
}

// ——— 정렬 가능한 할 일 카드 (카드 전체 Long Press 드래그 + 드래그 중 스타일) ———
function SortableTodoRow({
  todo,
  onToggle,
  onRemove,
  onExecutionDateChange,
  onDueDateChange,
  editingTodoId,
  editTitle,
  onEditTitleChange,
  onStartEditTitle,
  onSaveEditTitle,
  onCancelEditTitle,
  compact = false,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, dueDate: string | null) => void;
  editingTodoId: string | null;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEditTitle: (id: string) => void;
  onSaveEditTitle: () => void;
  onCancelEditTitle: () => void;
  compact?: boolean;
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
      {...attributes}
      {...listeners}
      className={
        compact
          ? `flex flex-row items-center justify-between w-full py-1.5 px-3 rounded-xl bg-white border border-slate-200/80 shadow-sm transition-all duration-200 ease-out ${
              isDragging ? "opacity-30 cursor-grabbing" : "cursor-pointer"
            }`
          : `group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 ease-out ${
              isDragging
                ? "scale-105 shadow-2xl z-50 ring-2 ring-blue-400 opacity-95 cursor-grabbing"
                : "cursor-pointer"
            }`
      }
    >
      <TodoRowContent
        todo={todo}
        onToggle={onToggle}
        onRemove={onRemove}
        onExecutionDateChange={onExecutionDateChange}
        onDueDateChange={onDueDateChange}
        isEditingTitle={editingTodoId === todo.id}
        editTitle={editTitle}
        onEditTitleChange={onEditTitleChange}
        onStartEditTitle={() => onStartEditTitle(todo.id)}
        onSaveEditTitle={onSaveEditTitle}
        onCancelEditTitle={onCancelEditTitle}
        compact={compact}
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
  editingTodoId,
  editTitle,
  onEditTitleChange,
  onStartEditTitle,
  onSaveEditTitle,
  onCancelEditTitle,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onExecutionDateChange: (id: string, v: string | null) => void;
  onDueDateChange: (id: string, v: string | null) => void;
  editingTodoId: string | null;
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  onStartEditTitle: (id: string) => void;
  onSaveEditTitle: () => void;
  onCancelEditTitle: () => void;
}) {
  return (
    <li className="group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 ease-out">
      <TodoRowContent
        todo={todo}
        onToggle={onToggle}
        onRemove={onRemove}
        onExecutionDateChange={onExecutionDateChange}
        onDueDateChange={onDueDateChange}
        isEditingTitle={editingTodoId === todo.id}
        editTitle={editTitle}
        onEditTitleChange={onEditTitleChange}
        onStartEditTitle={() => onStartEditTitle(todo.id)}
        onSaveEditTitle={onSaveEditTitle}
        onCancelEditTitle={onCancelEditTitle}
      />
    </li>
  );
}

// ——— Next 뷰: 날짜 컬럼(드롭 가능 영역)
function DroppableDayColumn({
  id,
  isToday,
  date,
  weekdayLabel,
  dayTodos,
  children,
}: {
  id: string;
  isToday: boolean;
  date: Date;
  weekdayLabel: string;
  dayTodos: Todo[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { over } = useDndContext();
  const isOverColumn =
    isOver ||
    (!!over && dayTodos.some((t) => String(t.id) === String(over.id)));
  return (
    <section
      ref={setNodeRef}
      className={`min-w-[280px] w-72 snap-center rounded-xl border p-4 flex flex-col transition-colors ${
        isOverColumn
          ? "bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200"
          : "bg-slate-50/60 border-slate-200/70"
      }`}
    >
      <header className="flex items-baseline justify-between mb-2">
        <div>
          <p
            className={`text-sm font-semibold ${
              isToday ? "text-indigo-600" : "text-slate-800"
            }`}
          >
            {formatMonthDay(date)} ({weekdayLabel})
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {isToday ? "오늘" : "실행 예정"}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

// ——— 동적 카테고리 탭
function CategoryTabs({
  categories,
  active,
  onSelect,
  onAddCategory,
  onRemoveCategory,
  showAllOption = false,
}: {
  categories: string[];
  active: string;
  onSelect: (id: string) => void;
  onAddCategory: (name: string) => void;
  onRemoveCategory?: (name: string) => void;
  showAllOption?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (trimmed && !categories.includes(trimmed) && trimmed.toLowerCase() !== "inbox") {
      onAddCategory(trimmed);
      setNewName("");
      setIsAdding(false);
    } else {
      setIsAdding(false);
      setNewName("");
    }
  };

  const getTabActiveClass = (cat: string) => {
    if (active !== cat) return "bg-gray-100 text-gray-600 hover:bg-white/70 hover:text-gray-800";
    return "bg-white text-black shadow-sm border border-slate-200/80";
  };

  const getTabIconColorClass = (cat: string) => {
    if (cat === "Work") return "text-blue-500";
    if (cat === "Life") return "text-green-500";
    return "text-gray-500";
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100/80 border border-slate-200/80 w-fit">
      {showAllOption && (
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1 ${
            active === "all"
              ? "bg-white text-black shadow-sm border border-slate-200/80"
              : "bg-gray-100 text-gray-600 hover:bg-white/70 hover:text-gray-800"
          }`}
        >
          <ListTodo className="w-4 h-4 text-slate-500" />
          All
        </button>
      )}
      {categories.map((cat) => (
        <span key={cat} className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onSelect(cat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1 ${getTabActiveClass(cat)}`}
          >
            <span className={getTabIconColorClass(cat)}>{getCategoryIcon(cat)}</span>
            {cat}
          </button>
          {onRemoveCategory && cat !== "Work" && cat !== "Life" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("이 카테고리를 삭제하시겠습니까?")) onRemoveCategory(cat);
              }}
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200"
              aria-label={`${cat} 카테고리 삭제`}
            >
              <X size={14} />
            </button>
          )}
        </span>
      ))}
      {isAdding ? (
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200/80 shadow-sm">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
              if (e.key === "Escape") {
                setNewName("");
                setIsAdding(false);
              }
            }}
            placeholder="카테고리 이름"
            className="w-24 min-w-0 px-2 py-1 text-sm rounded border-0 outline-none focus:ring-0 bg-transparent"
            autoFocus
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
          aria-label="카테고리 추가"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);

  // 정렬: 실행일 | 마감일 | 추가한 날짜 | 이름
  const [sortBy, setSortBy] = useState<SortBy>("execution_date");

  // 동적 카테고리 (localStorage 연동)
  const [categories, setCategories] = useState<string[]>(() => loadCategories());
  useEffect(() => {
    try {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.toLowerCase() === "inbox" || categories.includes(trimmed)) return;
    setCategories((prev) => [...prev, trimmed]);
  };

  const removeCategory = (name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    if (activeInboxTab === name) setActiveInboxTab("Work");
    if (todayTab === name) setTodayTab("all");
  };

  // Inbox 화면: 상단 탭 = Work, Life, ... (Inbox 탭 없음), 기본 선택 Work
  const [activeInboxTab, setActiveInboxTab] = useState<string>("Work");
  const [inboxInput, setInboxInput] = useState("");
  const [inboxExecutionDate, setInboxExecutionDate] = useState(() => getTodayISO());
  const [inboxDueDate, setInboxDueDate] = useState("");

  // Today: all | 카테고리명
  const [todayTab, setTodayTab] = useState<string>("all");
  const [todayInput, setTodayInput] = useState("");
  const [todayExecutionDate, setTodayExecutionDate] = useState(() => getTodayISO());
  const [todayDueDate, setTodayDueDate] = useState("");

  // Next 뷰: 표시 일수(3|5|7), 주말/공휴일 제외 토글, 카테고리 탭
  const [viewDays, setViewDays] = useState<3 | 5 | 7>(7);
  const [excludeHolidays, setExcludeHolidays] = useState(false);
  const [nextTab, setNextTab] = useState<string>("all");

  // 카테고리 목록 변경 시 선택 탭 유효성 (상단 탭만; 사이드바 Inbox는 미사용)
  useEffect(() => {
    if (categories.length && !categories.includes(activeInboxTab)) setActiveInboxTab("Work");
  }, [categories, activeInboxTab]);
  useEffect(() => {
    if (todayTab !== "all" && categories.length && !categories.includes(todayTab)) setTodayTab("all");
  }, [categories, todayTab]);

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
      .select("id, title, is_done, category, created_at, completed_at, order_index, due_date, execution_date")
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
    category: string,
    executionDate?: string | null,
    dueDate?: string | null
  ) => {
    const nextOrder =
      todos.length === 0 ? 0 : Math.max(...todos.map((t) => t.order_index)) + 100;
    const execDate = executionDate || getTodayISO();
    const categoryValue = category === "Inbox" ? null : category;
    const { error } = await supabase.from("todos").insert({
      title: text,
      is_done: false,
      category: categoryValue,
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
    const nextDone = !todo.is_done;
    const completedAt = nextDone ? new Date().toISOString() : null;
    const nextExecutionDate = nextDone ? getTodayISO() : todo.execution_date ?? null;
    const { error } = await supabase
      .from("todos")
      .update({ is_done: nextDone, completed_at: completedAt, execution_date: nextExecutionDate })
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

  const updateTodoTitle = async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("todos").update({ title: trimmed }).eq("id", id);
    if (error) {
      console.error("todos update title error:", { message: error.message, code: error.code });
      return;
    }
    await fetchTodos();
  };

  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEditTitle = (id: string) => {
    const t = todos.find((x) => x.id === id);
    if (t) {
      setEditingTodoId(id);
      setEditTitle(t.title);
    }
  };

  const handleSaveEditTitle = async () => {
    if (!editingTodoId) return;
    const trimmed = editTitle.trim();
    if (trimmed) await updateTodoTitle(editingTodoId, trimmed);
    setEditingTodoId(null);
    setEditTitle("");
  };

  const handleCancelEditTitle = () => {
    setEditingTodoId(null);
    setEditTitle("");
  };

  const sortedTodos = useMemo(
    () => [...todos].sort((a, b) => a.order_index - b.order_index),
    [todos]
  );

  const displaySortedTodos = useMemo(() => {
    const list = [...sortedTodos];
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

  const filterByCategory = (list: Todo[], selectedTab: string) => {
    if (selectedTab === "all") return list;
    if (selectedTab === "Inbox") {
      return list.filter((t) => {
        const c = (t.category || "").trim().toLowerCase();
        return !t.category || c === "" || c === "general" || c === "inbox";
      });
    }
    return list.filter(
      (t) => t.category && t.category.toLowerCase() === selectedTab.toLowerCase()
    );
  };

  /** Today 메뉴일 때: execution_date가 오늘인 항목만 먼저 필터 */
  const todayFilteredTodos = useMemo(() => {
    const todayStr = getTodayISO();
    return displaySortedTodos.filter((t) => t.execution_date === todayStr);
  }, [displaySortedTodos]);

  // Today 메뉴일 때: execution_date가 오늘 이전이면서 아직 완료되지 않은(미완료) 항목
  const todayOverdueTodos = useMemo(() => {
    const todayStr = getTodayISO();
    return displaySortedTodos.filter(
      (t) => t.execution_date && t.execution_date < todayStr && !t.is_done
    );
  }, [displaySortedTodos]);

  const handleMoveOverdueToToday = async () => {
    const overdue = filterByCategory(todayOverdueTodos, todayTab);
    if (overdue.length === 0) return;
    if (
      !confirm(
        "기한이 지난 모든 할 일을 오늘 일정으로 가져오시겠습니까?"
      )
    )
      return;
    const todayStr = getTodayISO();
    const ids = overdue.map((t) => t.id);
    const { error } = await supabase
      .from("todos")
      .update({ execution_date: todayStr })
      .in("id", ids);
    if (error) {
      console.error("todos bulk update execution_date error:", {
        message: error.message,
        code: error.code,
      });
      return;
    }
    await fetchTodos();
  };

  const nextViewDays = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const result: { date: Date; iso: string }[] = [];
    let d = new Date(base);
    while (result.length < viewDays) {
      const iso = toLocalDateString(d);
      const skip =
        excludeHolidays &&
        (isWeekend(d) || HOLIDAYS_ISO.includes(iso));
      if (!skip) {
        result.push({ date: new Date(d), iso });
      }
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [viewDays, excludeHolidays]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    const found = todos.find((t) => String(t.id) === id) ?? null;
    setActiveTodo(found);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveId(null);
      setActiveTodo(null);
      return;
    }

    const overIdStr = String(over.id);
    const isDateColumn = /^\d{4}-\d{2}-\d{2}$/.test(overIdStr);

    // Next 뷰: 다른 날짜 컬럼(또는 해당 컬럼의 카드)에 드롭 → execution_date 변경
    if (menu === "next") {
      let targetDate: string | null = null;
      if (isDateColumn) {
        targetDate = overIdStr;
      } else {
        const overTodo = displaySortedTodos.find((t) => t.id === over.id);
        if (overTodo?.execution_date) targetDate = overTodo.execution_date;
      }
      if (targetDate) {
        const todo = displaySortedTodos.find((t) => t.id === active.id);
        if (todo && todo.execution_date !== targetDate) {
          const nextTodos = displaySortedTodos.map((t) =>
            t.id === active.id ? { ...t, execution_date: targetDate! } : t
          );
          setTodos(nextTodos);
          const { error } = await supabase
            .from("todos")
            .update({ execution_date: targetDate })
            .eq("id", active.id);
          if (error) {
            console.error("todo execution_date update error:", error);
            fetchTodos();
          }
          setActiveId(null);
          setActiveTodo(null);
          return;
        }
      }
    }

    const tab =
      menu === "inbox" ? activeInboxTab : menu === "today" ? todayTab : "all";
    const baseList =
      menu === "today" ? todayFilteredTodos : displaySortedTodos;
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

    setActiveId(null);
    setActiveTodo(null);

    await Promise.all(
      withNewOrder.map((t) =>
        supabase.from("todos").update({ order_index: t.order_index }).eq("id", t.id)
      )
    );
  };

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
            <button
              type="button"
              onClick={() => setMenu("inbox")}
              className={`w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                menu === "inbox" ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Inbox className="w-5 h-5" />
              Inbox
            </button>
            <button
              type="button"
              onClick={() => { setMenu("today"); setTodayTab("all"); }}
              className={`w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                menu === "today"
                  ? "bg-slate-200 text-slate-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Sun className="w-5 h-5" />
              Today
            </button>
            <button
              type="button"
              onClick={() => setMenu("next")}
              className={`w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                menu === "next" ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <ListTodo className="w-5 h-5" />
              Next
            </button>
            <button
              type="button"
              onClick={() => setMenu("calendar")}
              className={`w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                menu === "calendar" ? "bg-slate-200 text-slate-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Calendar className="w-5 h-5" />
              Calendar
            </button>
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
                  <CategoryTabs
                    categories={categories}
                    active={activeInboxTab}
                    onSelect={setActiveInboxTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
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
                      addTodo(inboxInput.trim(), activeInboxTab, inboxExecutionDate || null, inboxDueDate || null);
                      setInboxInput("");
                      setInboxExecutionDate(getTodayISO());
                      setInboxDueDate("");
                    }}
                    placeholder="할 일 추가..."
                  />
                </div>
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={filterByCategory(displaySortedTodos, activeInboxTab).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                      {(() => {
                        const filtered = filterByCategory(displaySortedTodos, activeInboxTab);
                        if (filtered.length === 0) {
                          return (
                            <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                              할 일을 입력하고 추가해 보세요
                            </li>
                          );
                        }
                        const activeList = filtered.filter((t) => !t.is_done);
                        const completedList = filtered
                          .filter((t) => t.is_done)
                          .slice()
                          .sort((a, b) => {
                            const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
                            const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
                            return bT - aT;
                          });
                        return (
                          <>
                            {activeList.map((todo) => (
                              <SortableTodoRow
                                key={todo.id}
                                todo={todo}
                                onToggle={toggleTodo}
                                onRemove={removeTodo}
                                onExecutionDateChange={updateTodoExecutionDate}
                                onDueDateChange={updateTodoDueDate}
                                editingTodoId={editingTodoId}
                                editTitle={editTitle}
                                onEditTitleChange={setEditTitle}
                                onStartEditTitle={handleStartEditTitle}
                                onSaveEditTitle={handleSaveEditTitle}
                                onCancelEditTitle={handleCancelEditTitle}
                              />
                            ))}
                            {completedList.length > 0 && (
                              <li>
                                <div className="flex items-center my-2 text-xs">
                                  <div className="flex-grow border-t border-gray-200" />
                                  <span className="px-2 text-gray-400 text-xs font-medium">
                                    완료된 할일
                                  </span>
                                  <div className="flex-grow border-t border-gray-200" />
                                </div>
                              </li>
                            )}
                            {completedList.map((todo) => (
                              <SortableTodoRow
                                key={todo.id}
                                todo={todo}
                                onToggle={toggleTodo}
                                onRemove={removeTodo}
                                onExecutionDateChange={updateTodoExecutionDate}
                                onDueDateChange={updateTodoDueDate}
                                editingTodoId={editingTodoId}
                                editTitle={editTitle}
                                onEditTitleChange={setEditTitle}
                                onStartEditTitle={handleStartEditTitle}
                                onSaveEditTitle={handleSaveEditTitle}
                                onCancelEditTitle={handleCancelEditTitle}
                              />
                            ))}
                          </>
                        );
                      })()}
                    </ul>
                  </SortableContext>
                </DndContext>
              </>
            )}

            {menu === "today" && (
              <>
                <div className="mb-6">
                  <CategoryTabs
                    categories={categories}
                    active={todayTab}
                    onSelect={setTodayTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
                    showAllOption
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
                    </select>
                  </label>
                </div>
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={filterByCategory(todayFilteredTodos, todayTab).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-6">
                      {(() => {
                        const overdue = filterByCategory(todayOverdueTodos, todayTab);
                        const todayList = filterByCategory(todayFilteredTodos, todayTab);
                        if (overdue.length === 0 && todayList.length === 0) {
                          return (
                            <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                              오늘 실행할 일이 없습니다
                            </li>
                          );
                        }
                        return (
                          <>
                            {overdue.length > 0 && (
                              <li>
                                <div className="flex items-center my-3 text-xs md:text-base">
                                  <div className="flex-grow border-t border-gray-200" />
                                  <div className="flex items-center gap-2 px-3">
                                    <span className="font-medium text-gray-400 opacity-70 tracking-tight">
                                      기한이 지난
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleMoveOverdueToToday}
                                      className="px-3 py-1 rounded-full border border-gray-300 bg-gray-50 text-[11px] text-gray-500 hover:bg-gray-100 transition-colors"
                                    >
                                      🔄 모두 오늘로
                                    </button>
                                  </div>
                                  <div className="flex-grow border-t border-gray-200" />
                                </div>
                              </li>
                            )}
                            {overdue.map((todo) => (
                              <TodoRow
                                key={todo.id}
                                todo={todo}
                                onToggle={toggleTodo}
                                onRemove={removeTodo}
                                onExecutionDateChange={updateTodoExecutionDate}
                                onDueDateChange={updateTodoDueDate}
                                editingTodoId={editingTodoId}
                                editTitle={editTitle}
                                onEditTitleChange={setEditTitle}
                                onStartEditTitle={handleStartEditTitle}
                                onSaveEditTitle={handleSaveEditTitle}
                                onCancelEditTitle={handleCancelEditTitle}
                              />
                            ))}
                            {overdue.length > 0 && (
                              <li>
                                <div className="flex items-center my-4 md:my-6 text-xs md:text-base">
                                  <div className="flex-grow border-t border-gray-200" />
                                  <span className="px-3 font-medium text-red-500 opacity-70 tracking-tight">
                                    오늘
                                  </span>
                                  <div className="flex-grow border-t border-gray-200" />
                                </div>
                              </li>
                            )}
                            {(() => {
                              const activeList = todayList.filter((t) => !t.is_done);
                              const completedList = todayList
                                .filter((t) => t.is_done)
                                .slice()
                                .sort((a, b) => {
                                  const aT = a.completed_at ? new Date(a.completed_at).getTime() : 0;
                                  const bT = b.completed_at ? new Date(b.completed_at).getTime() : 0;
                                  return bT - aT;
                                });
                              return (
                                <>
                                  {activeList.map((todo) => (
                                    <SortableTodoRow
                                      key={todo.id}
                                      todo={todo}
                                      onToggle={toggleTodo}
                                      onRemove={removeTodo}
                                      onExecutionDateChange={updateTodoExecutionDate}
                                      onDueDateChange={updateTodoDueDate}
                                      editingTodoId={editingTodoId}
                                      editTitle={editTitle}
                                      onEditTitleChange={setEditTitle}
                                      onStartEditTitle={handleStartEditTitle}
                                      onSaveEditTitle={handleSaveEditTitle}
                                      onCancelEditTitle={handleCancelEditTitle}
                                    />
                                  ))}
                                  {completedList.length > 0 && (
                                    <li>
                                      <div className="flex items-center my-2 text-xs">
                                        <div className="flex-grow border-t border-gray-200" />
                                        <span className="px-2 text-gray-400 text-xs font-medium">
                                          완료된 할일
                                        </span>
                                        <div className="flex-grow border-t border-gray-200" />
                                      </div>
                                    </li>
                                  )}
                                  {completedList.map((todo) => (
                                    <TodoRow
                                      key={todo.id}
                                      todo={todo}
                                      onToggle={toggleTodo}
                                      onRemove={removeTodo}
                                      onExecutionDateChange={updateTodoExecutionDate}
                                      onDueDateChange={updateTodoDueDate}
                                      editingTodoId={editingTodoId}
                                      editTitle={editTitle}
                                      onEditTitleChange={setEditTitle}
                                      onStartEditTitle={handleStartEditTitle}
                                      onSaveEditTitle={handleSaveEditTitle}
                                      onCancelEditTitle={handleCancelEditTitle}
                                    />
                                  ))}
                                </>
                              );
                            })()}
                          </>
                        );
                      })()}
                    </ul>
                  </SortableContext>
                </DndContext>
                <div className="rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 p-2">
                  <TodoInput
                    value={todayInput}
                    onChange={setTodayInput}
                    executionDate={todayExecutionDate}
                    onExecutionDateChange={setTodayExecutionDate}
                    dueDate={todayDueDate}
                    onDueDateChange={setTodayDueDate}
                    onSubmit={() => {
                      const category = todayTab === "all" ? "Work" : todayTab;
                      addTodo(todayInput.trim(), category, todayExecutionDate || null, todayDueDate || null);
                      setTodayInput("");
                      setTodayExecutionDate(getTodayISO());
                      setTodayDueDate("");
                    }}
                    placeholder="할 일 추가..."
                  />
                </div>
              </>
            )}

            {menu === "next" && (
              <div className="flex-1 flex flex-col min-w-0">
                <div className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      다가오는 {viewDays}일
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      오늘부터 실행 예정 할 일을 한눈에 확인하세요.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 border border-slate-200/80">
                      {([3, 5, 7] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setViewDays(n)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1 ${
                            viewDays === n
                              ? "bg-white text-indigo-700 shadow-sm border border-slate-200/80"
                              : "text-slate-600 hover:bg-white/60 hover:text-slate-800"
                          }`}
                        >
                          {n}일
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-sm text-slate-600">주말/공휴일 제외</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={excludeHolidays}
                        onClick={() => setExcludeHolidays((v) => !v)}
                        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 ${
                          excludeHolidays
                            ? "bg-indigo-600 border-indigo-600"
                            : "bg-slate-200 border-slate-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
                            excludeHolidays ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
                <div className="mb-3">
                  <CategoryTabs
                    categories={categories}
                    active={nextTab}
                    onSelect={setNextTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
                    showAllOption
                  />
                </div>
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  modifiers={[]}
                >
                  <div className="flex flex-row gap-4 pb-4 overflow-x-auto snap-x snap-mandatory next-timeline-scroll">
                    {nextViewDays.map(({ date, iso }) => {
                      const baseForNext = filterByCategory(displaySortedTodos, nextTab);
                      const dayTodos = baseForNext.filter(
                        (t) => t.execution_date === iso
                      );
                      const isToday = iso === getTodayISO();
                      const weekdayLabel = WEEKDAY_KO[date.getDay()];
                      return (
                        <DroppableDayColumn
                          key={iso}
                          id={iso}
                          isToday={isToday}
                          date={date}
                          weekdayLabel={weekdayLabel}
                          dayTodos={dayTodos}
                        >
                          <SortableContext
                            items={dayTodos.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul className="mt-3 space-y-2 flex-1 min-h-[80px]">
                              {dayTodos.length === 0 ? (
                                <li className="h-full flex items-center justify-center py-6">
                                  <p className="text-sm text-slate-400 text-center">
                                    예정된 할 일이 없습니다
                                  </p>
                                </li>
                              ) : (
                                dayTodos.map((todo) => (
                                  <SortableTodoRow
                                    key={todo.id}
                                    todo={todo}
                                    onToggle={toggleTodo}
                                    onRemove={removeTodo}
                                    onExecutionDateChange={updateTodoExecutionDate}
                                    onDueDateChange={updateTodoDueDate}
                                    editingTodoId={editingTodoId}
                                    editTitle={editTitle}
                                    onEditTitleChange={setEditTitle}
                                    onStartEditTitle={handleStartEditTitle}
                                    onSaveEditTitle={handleSaveEditTitle}
                                    onCancelEditTitle={handleCancelEditTitle}
                                    compact
                                  />
                                ))
                              )}
                            </ul>
                          </SortableContext>
                        </DroppableDayColumn>
                      );
                    })}
                  </div>
                  {menu === "next" && (
                    <DragOverlay zIndex={9999}>
                      {activeId && activeTodo && (
                        <div className="flex flex-row items-center justify-between w-[260px] py-1.5 px-3 rounded-xl bg-white border border-slate-200/80 shadow-2xl scale-105 cursor-grabbing opacity-100">
                          <TodoRowContent
                            todo={activeTodo}
                            onToggle={toggleTodo}
                            onRemove={removeTodo}
                            onExecutionDateChange={updateTodoExecutionDate}
                            onDueDateChange={updateTodoDueDate}
                            isEditingTitle={editingTodoId === activeTodo.id}
                            editTitle={editTitle}
                            onEditTitleChange={setEditTitle}
                            onStartEditTitle={() => handleStartEditTitle(activeTodo.id)}
                            onSaveEditTitle={handleSaveEditTitle}
                            onCancelEditTitle={handleCancelEditTitle}
                            compact={menu === "next"}
                          />
                        </div>
                      )}
                    </DragOverlay>
                  )}
                </DndContext>
              </div>
            )}

            {menu === "calendar" && (
              <div className="flex-1 flex items-center justify-center py-16 text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                Calendar 화면은 준비 중입니다.
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
