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
  useDraggable,
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
  horizontalListSortingStrategy,
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
  Settings,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "next-themes";
import {
  applyInitialScreen,
  clearSettingsLocalStorage,
  DEFAULT_USER_SETTINGS,
  loadOrCreateUserSettings,
  syncSettingsToLocalStorage,
  upsertUserSettings,
  type AppTheme,
  type InitialScreen,
  type ShowCompletedMode,
} from "@/src/lib/user-settings";

const DEFAULT_CATEGORIES = ["Work", "Life"];
const CATEGORIES_STORAGE_KEY = "todo-categories";
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

const SURFACE_FORM =
  "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/40 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 transition-all";
const SURFACE_CARD =
  "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800";
const INPUT_SURFACE =
  "rounded-xl bg-slate-50/80 dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none border-0";
const DATE_BTN =
  "relative flex flex-col items-center justify-center px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0";

function sidebarNavItemClass(isActive: boolean) {
  return `w-auto md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 ${
    isActive
      ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100"
  }`;
}

function categoryTabInactiveClass() {
  return "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-slate-100";
}

function categoryTabActiveClass() {
  return "bg-white dark:bg-slate-700 text-black dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-600";
}

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

/** 월간 캘린더: 앞뒤 빈칸 + 해당 월 날짜 (7열 그리드용) */
function buildCalendarMonthDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = first.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function getMicroBarCategoryClass(category: string | null) {
  const n = (category || "").trim().toLowerCase();
  if (n === "work") return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300";
  if (n === "life") return "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

const MICRO_BAR_COMPLETED_CLASS =
  "bg-slate-100 text-slate-400 line-through opacity-70 dark:bg-slate-800/50 dark:text-slate-500 hover:bg-slate-100 hover:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-500";

/** 미완료 우선, 완료 항목은 목록 하단으로 */
function sortTodosByCompletion(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => Number(a.is_done) - Number(b.is_done));
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

/** M.D(요일) — 예: 5.29(금), 5.2(토) */
function formatHumanDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayString = WEEKDAY_KO[date.getDay()];
  return `${date.getMonth() + 1}.${date.getDate()}(${dayString})`;
}

// ——— 뷰 상단 제목 + 설명 헤더 (Next 탭과 동일 스타일) ———
function ViewPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
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
  const doDisplayValue =
    !executionDate || executionDate === getTodayISO()
      ? "오늘"
      : formatHumanDate(executionDate);

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

  const openDatePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
    if (input) {
      try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.focus();
      } catch {
        input.focus();
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-wrap items-end gap-2 sm:gap-3 p-2 ${SURFACE_FORM}`}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`flex-1 min-w-[140px] px-5 py-4 ${INPUT_SURFACE} text-base`}
      />
      <button type="button" onClick={openDatePicker} className={DATE_BTN}>
        <input
          type="date"
          value={executionDate}
          onChange={(e) => onExecutionDateChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          aria-label="실행일 선택"
        />
        <span className="flex items-center justify-center gap-1 w-full pointer-events-none">
          <Play className="w-3.5 h-3.5 text-indigo-500 shrink-0 pointer-events-none" aria-hidden />
          <span className="text-xs text-indigo-500 font-semibold pointer-events-none">Do</span>
        </span>
        <span className="text-sm text-slate-800 dark:text-slate-200 font-bold pointer-events-none mt-0.5 text-center w-full">
          {doDisplayValue}
        </span>
      </button>
      <button type="button" onClick={openDatePicker} className={DATE_BTN}>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onDueDateChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          aria-label="마감일 선택"
        />
        <span className="flex items-center justify-center gap-1 w-full pointer-events-none">
          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0 pointer-events-none" aria-hidden />
          <span className="text-xs text-amber-500 font-semibold pointer-events-none">Goal</span>
        </span>
        <span
          className={`text-sm font-bold pointer-events-none mt-0.5 text-center w-full ${
            dueDate ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {dueDate ? formatHumanDate(dueDate) : "None"}
        </span>
      </button>
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

// ——— 할 일 종합 수정 모달 ———
function TodoEditModal({
  editTitle,
  onEditTitleChange,
  editExecutionDate,
  onEditExecutionDateChange,
  editDueDate,
  onEditDueDateChange,
  onSave,
  onCancel,
}: {
  editTitle: string;
  onEditTitleChange: (v: string) => void;
  editExecutionDate: string;
  onEditExecutionDateChange: (v: string) => void;
  editDueDate: string;
  onEditDueDateChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const doDisplayDate =
    !editExecutionDate || editExecutionDate === getTodayISO()
      ? "오늘"
      : formatHumanDate(editExecutionDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSave();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onCancel();
  };

  const openDatePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
    if (input) {
      try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.focus();
      } catch {
        input.focus();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 w-full max-w-lg mx-4 border border-transparent dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="할 일 수정"
      >
        <form
          onSubmit={handleSubmit}
          className={`flex flex-col gap-3 p-2 ${SURFACE_FORM}`}
        >
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="할 일 제목..."
            autoFocus
            className={`w-full px-5 py-3.5 ${INPUT_SURFACE} text-base`}
            aria-label="제목 수정"
          />
          <div className="flex items-end gap-3 w-full">
            <button type="button" onClick={openDatePicker} className={DATE_BTN}>
              <input
                type="date"
                value={editExecutionDate}
                onChange={(e) => onEditExecutionDateChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="실행일 선택"
              />
              <span className="flex items-center justify-center gap-1 w-full pointer-events-none">
                <Play className="w-3.5 h-3.5 text-indigo-500 shrink-0 pointer-events-none" aria-hidden />
                <span className="text-xs text-indigo-500 font-semibold pointer-events-none">Do</span>
              </span>
              <span className="text-sm text-slate-800 dark:text-slate-200 font-bold pointer-events-none mt-0.5 text-center w-full">
                {doDisplayDate}
              </span>
            </button>
            <button type="button" onClick={openDatePicker} className={DATE_BTN}>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => onEditDueDateChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="마감일 선택"
              />
              <span className="flex items-center justify-center gap-1 w-full pointer-events-none">
                <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0 pointer-events-none" aria-hidden />
                <span className="text-xs text-amber-500 font-semibold pointer-events-none">Goal</span>
              </span>
              <span
                className={`text-sm font-bold pointer-events-none mt-0.5 text-center w-full ${
                  editDueDate ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {editDueDate ? formatHumanDate(editDueDate) : "None"}
              </span>
            </button>
            <button
              type="submit"
              className="shrink-0 ml-auto flex items-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Check className="w-5 h-5" />
              <span>수정</span>
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [editExecutionDate, setEditExecutionDate] = useState(todo.execution_date ?? "");
  const [editDueDate, setEditDueDate] = useState(todo.due_date ?? "");

  useEffect(() => {
    if (isEditingTitle) {
      setEditExecutionDate(todo.execution_date ?? "");
      setEditDueDate(todo.due_date ?? "");
    }
  }, [isEditingTitle, todo.execution_date, todo.due_date]);

  useEffect(() => {
    if (!isEditingTitle) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelEditTitle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isEditingTitle, onCancelEditTitle]);

  const handleModalSave = async () => {
    if (!editTitle.trim()) return;
    await onSaveEditTitle();
    await onExecutionDateChange(todo.id, editExecutionDate || null);
    await onDueDateChange(todo.id, editDueDate || null);
  };

  const editModal = isEditingTitle ? (
    <TodoEditModal
      editTitle={editTitle}
      onEditTitleChange={onEditTitleChange}
      editExecutionDate={editExecutionDate}
      onEditExecutionDateChange={setEditExecutionDate}
      editDueDate={editDueDate}
      onEditDueDateChange={setEditDueDate}
      onSave={handleModalSave}
      onCancel={onCancelEditTitle}
    />
  ) : null;

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
            onClick={(e) => {
              e.stopPropagation();
              onToggle(todo.id);
            }}
            className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
              todo.is_done
                ? isWork
                  ? "bg-indigo-500 border-indigo-500 text-white"
                  : "bg-emerald-500 border-emerald-500 text-white"
                : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
            }`}
          >
            {todo.is_done && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </button>
          <div className="min-w-0 flex-1">
            <span
              className={`block break-words whitespace-normal text-sm select-none ${
                todo.is_done ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"
              }`}
              title={todo.title}
            >
              {todo.title}
            </span>
          </div>
        </div>

        {/* 우측: 마감일/카테고리/휴지통 (세로 정렬) */}
        <div className="flex flex-col items-end justify-start gap-1.5 shrink-0 text-xs text-slate-500 dark:text-slate-400">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 whitespace-nowrap ${
              isOverdue ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
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
                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                : displayCategory.toLowerCase() === "life"
                  ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                  : "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
            title={displayCategory}
          >
            {displayCategory}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(todo.id);
            }}
            className="p-1.5 rounded-xl text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            aria-label="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {editModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(todo.id);
        }}
        className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
          todo.is_done
            ? isWork
              ? "bg-indigo-500 border-indigo-500 text-white"
              : "bg-emerald-500 border-emerald-500 text-white"
            : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
        }`}
      >
        {todo.is_done && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      </button>
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span
          className={`break-words text-sm select-none transition-colors duration-200 ${
            todo.is_done ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"
          }`}
        >
          {todo.title}
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 whitespace-nowrap">
            <Play className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
            {todo.execution_date ? (
              <span>{formatShortDate(todo.execution_date)} 실행</span>
            ) : (
              <span>실행일 설정</span>
            )}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${
              isOverdue ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            }`}
          >
            <Flag className="w-3 h-3 shrink-0" />
            {todo.due_date ? (
              <span>{formatShortDate(todo.due_date)} 마감</span>
            ) : (
              <span>마감일 설정</span>
            )}
          </span>
        </span>
      </span>
      <span
        className={`shrink-0 text-xs rounded-md px-2 py-0.5 font-medium capitalize ${
          displayCategory.toLowerCase() === "work"
            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
            : displayCategory.toLowerCase() === "life"
              ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
              : "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300"
        }`}
        title={displayCategory}
      >
        {displayCategory}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(todo.id);
        }}
        className="shrink-0 p-1.5 rounded-xl text-slate-300 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900"
        aria-label="삭제"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      {editModal}
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
      onClick={() => {
        if (editingTodoId === todo.id) return;
        onStartEditTitle(todo.id);
      }}
      className={
        compact
          ? `flex flex-row items-center justify-between w-full py-1.5 px-3 ${SURFACE_CARD} rounded-xl shadow-sm transition-all duration-200 ease-out ${
              isDragging ? "opacity-30 cursor-grabbing" : "cursor-pointer"
            }`
          : `group flex items-center gap-2.5 px-4 py-2.5 ${SURFACE_CARD} rounded-2xl shadow-sm hover:shadow-md dark:hover:shadow-slate-950/50 transition-all duration-200 ease-out ${
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
    <li
      onClick={() => {
        if (editingTodoId === todo.id) return;
        onStartEditTitle(todo.id);
      }}
      className={`group flex items-center gap-2.5 px-4 py-2.5 ${SURFACE_CARD} rounded-2xl shadow-sm hover:shadow-md dark:hover:shadow-slate-950/50 transition-all duration-200 ease-out cursor-pointer`}
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
          ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-200 dark:ring-indigo-800"
          : "bg-slate-50/60 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-700"
      }`}
    >
      <header className="flex items-baseline justify-between mb-2">
        <div>
          <p
            className={`text-sm font-semibold ${
              isToday ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200"
            }`}
          >
            {formatMonthDay(date)} ({weekdayLabel})
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isToday ? "오늘" : "실행 예정"}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

// ——— Calendar 뷰: 날짜 셀(드롭존)
function DroppableCalendarDayCell({
  id,
  date,
  dayTodos,
  children,
}: {
  id: string;
  date: Date;
  dayTodos: Todo[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { over } = useDndContext();
  const isOverCell =
    isOver ||
    (!!over && dayTodos.some((t) => String(t.id) === String(over.id)));
  const isoToday = getTodayISO();
  const iso = toLocalDateString(date);
  const isToday = iso === isoToday;

  return (
    <div
      ref={setNodeRef}
      className={`bg-white dark:bg-slate-900 min-h-[100px] p-1.5 flex flex-col transition-colors ${
        isOverCell ? "bg-indigo-50/90 dark:bg-indigo-950/50 ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700" : ""
      }`}
    >
      <span
        className={`text-xs font-medium mb-1 ${
          isToday
            ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white"
            : "text-slate-600 dark:text-slate-400"
        }`}
      >
        {date.getDate()}
      </span>
      <div className="flex-1 min-h-0 space-y-0">{children}</div>
    </div>
  );
}

// ——— Calendar 뷰: 할 일 마이크로 바(드래그 가능)
function DraggableMicroTodoBar({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-[10px] px-1.5 py-0.5 rounded-sm truncate w-full mb-0.5 cursor-grab active:cursor-grabbing touch-none transition-colors ${
        todo.is_done
          ? MICRO_BAR_COMPLETED_CLASS
          : getMicroBarCategoryClass(todo.category)
      } ${isDragging ? "opacity-40" : ""}`}
      title={todo.title}
    >
      {todo.title}
    </div>
  );
}

function categorySortableId(name: string) {
  return `category:${name}`;
}

// ——— 카테고리 탭: 드래그 가능한 개별 항목
function SortableCategoryTab({
  cat,
  active,
  onSelect,
  onRemoveCategory,
}: {
  cat: string;
  active: string;
  onSelect: (id: string) => void;
  onRemoveCategory?: (name: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: categorySortableId(cat) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getTabActiveClass = (c: string) => {
    if (active !== c) return categoryTabInactiveClass();
    return categoryTabActiveClass();
  };

  const getTabIconColorClass = (c: string) => {
    if (c === "Work") return "text-blue-500";
    if (c === "Life") return "text-green-500";
    return "text-gray-500";
  };

  return (
    <span
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-0.5 touch-none ${isDragging ? "opacity-60 z-10" : ""}`}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={() => onSelect(cat)}
        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:ring-offset-1 dark:focus:ring-offset-slate-900 cursor-grab active:cursor-grabbing ${getTabActiveClass(cat)}`}
      >
        <span className={getTabIconColorClass(cat)}>{getCategoryIcon(cat)}</span>
        {cat}
      </button>
      {onRemoveCategory && cat !== "Work" && cat !== "Life" && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("이 카테고리를 삭제하시겠습니까?")) onRemoveCategory(cat);
          }}
          className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900"
          aria-label={`${cat} 카테고리 삭제`}
        >
          <X size={14} />
        </button>
      )}
    </span>
  );
}

// ——— 동적 카테고리 탭 (커스텀 카테고리 DnD + All/+ 고정)
function CategoryTabs({
  categories,
  active,
  onSelect,
  onAddCategory,
  onRemoveCategory,
  onReorderCategories,
  showAllOption = false,
}: {
  categories: string[];
  active: string;
  onSelect: (id: string) => void;
  onAddCategory: (name: string) => void;
  onRemoveCategory?: (name: string) => void;
  onReorderCategories: (ordered: string[]) => void;
  showAllOption?: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const categorySensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

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

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;
    const oldIndex = categories.findIndex((c) => categorySortableId(c) === String(dragActive.id));
    const newIndex = categories.findIndex((c) => categorySortableId(c) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderCategories(arrayMove(categories, oldIndex, newIndex));
  };

  const sortableIds = categories.map(categorySortableId);

  return (
    <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 w-fit max-w-full">
      <DndContext sensors={categorySensors} onDragEnd={handleCategoryDragEnd}>
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap items-center gap-1">
            {categories.map((cat) => (
              <SortableCategoryTab
                key={cat}
                cat={cat}
                active={active}
                onSelect={onSelect}
                onRemoveCategory={onRemoveCategory}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {showAllOption && (
          <button
            type="button"
            onClick={() => onSelect("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600 focus:ring-offset-1 dark:focus:ring-offset-slate-900 ${
              active === "all" ? categoryTabActiveClass() : categoryTabInactiveClass()
            }`}
          >
            <ListTodo className="w-4 h-4 text-slate-500" />
            All
          </button>
        )}
        {isAdding ? (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 shadow-sm">
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
              className="w-24 min-w-0 px-2 py-1 text-sm rounded border-0 outline-none focus:ring-0 bg-transparent text-slate-800 dark:text-slate-100"
              autoFocus
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/80 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-600"
            aria-label="카테고리 추가"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "🇰🇷 한국어 (Korean)", enabled: true },
  { value: "en", label: "🇺🇸 English", enabled: false },
  { value: "zh", label: "🇨🇳 中文 (Chinese)", enabled: false },
  { value: "es", label: "🇪🇸 Español (Spanish)", enabled: false },
  { value: "ja", label: "🇯🇵 日本語 (Japanese)", enabled: false },
  { value: "hi", label: "🇮🇳 हिन्दी (Hindi)", enabled: false },
] as const;

function SettingsModal({
  onClose,
  onLogout,
  showCompleted,
  onShowCompletedChange,
  defaultScreen,
  onDefaultScreenChange,
  onThemeChange,
}: {
  onClose: () => void;
  onLogout: () => void;
  showCompleted: boolean;
  onShowCompletedChange: (mode: ShowCompletedMode) => void;
  defaultScreen: InitialScreen;
  onDefaultScreenChange: (screen: InitialScreen) => void;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const { theme } = useTheme();
  const [language, setLanguage] = useState<string>("ko");
  const [mounted, setMounted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "ko") {
      setLanguage("ko");
      return;
    }
    setToastMessage("글로벌 업데이트 준비 중입니다! 🌍");
  };

  const themeOptions = [
    { id: "light", label: "라이트" },
    { id: "dark", label: "다크" },
    { id: "system", label: "시스템" },
  ] as const;

  const startupScreenOptions = [
    { id: "inbox", label: "Inbox" },
    { id: "today", label: "Today" },
    { id: "next", label: "Next" },
    { id: "calendar", label: "Calendar" },
  ] as const;

  const completedTasksOptions = [
    { id: "open", label: "보이기 (Open)" },
    { id: "close", label: "숨기기 (Close)" },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md relative border border-transparent dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="설정"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 pb-4 border-b border-slate-200 dark:border-slate-700 pr-8">
          설정
        </h2>

        <div className="flex flex-col gap-6 py-6">
          <section>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
              화면 테마
            </h3>
            {mounted ? (
              <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                {themeOptions.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onThemeChange(id as AppTheme)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                      theme === id
                        ? "bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
              언어 설정
            </h3>
            <select
              value={language}
              onChange={handleLanguageChange}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              aria-label="언어 선택"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {!opt.enabled ? " — 준비 중" : ""}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              현재 한국어만 지원됩니다. 다른 언어는 곧 업데이트될 예정이에요.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
              최초 화면 (Startup Screen)
            </h3>
            <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              {startupScreenOptions.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onDefaultScreenChange(id as InitialScreen)}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                    defaultScreen === id
                      ? "bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              앱 실행 시 처음 표시할 화면을 선택합니다.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
              완료된 할 일 (Completed Tasks)
            </h3>
            <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              {completedTasksOptions.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onShowCompletedChange(id)}
                  className={`flex-1 px-2 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                    (id === "open" && showCompleted) || (id === "close" && !showCompleted)
                      ? "bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              완료된 항목을 리스트에 표시할지 선택합니다.
            </p>
          </section>
        </div>

        {toastMessage && (
          <div
            role="status"
            className="mb-4 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-sm font-medium text-indigo-700 dark:text-indigo-300 text-center animate-in fade-in duration-200"
          >
            {toastMessage}
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900"
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
        </div>
      </div>
    </div>
  );
}

export default function TodoApp() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [menu, setMenu] = useState<SidebarMenu>("today");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTodo, setActiveTodo] = useState<Todo | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [defaultScreen, setDefaultScreen] = useState<InitialScreen>("today");

  const filterVisibleTodos = (list: Todo[]) =>
    showCompleted ? list : list.filter((t) => !t.is_done);

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
    if (activeInboxTab === name) setActiveInboxTab("all");
    if (todayTab === name) setTodayTab("all");
    if (nextTab === name) setNextTab("all");
    if (calendarTab === name) setCalendarTab("all");
  };

  // Inbox 화면: 카테고리 필터 (Today와 동일 — All 기본)
  const [activeInboxTab, setActiveInboxTab] = useState<string>("all");
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

  const [calendarTab, setCalendarTab] = useState<string>("all");

  const [calendarDate, setCalendarDate] = useState(() => new Date());

  const persistUserSettings = async (patch: {
    theme?: AppTheme;
    initial_screen?: InitialScreen;
    show_completed?: ShowCompletedMode;
  }) => {
    if (!userId) return;
    await upsertUserSettings(userId, patch);
  };

  const handleThemeChange = async (theme: AppTheme) => {
    setTheme(theme);
    syncSettingsToLocalStorage({
      theme,
      initial_screen: defaultScreen,
      show_completed: showCompleted ? "open" : "close",
    });
    await persistUserSettings({ theme });
  };

  const handleDefaultScreenChange = async (screen: InitialScreen) => {
    setDefaultScreen(screen);
    applyInitialScreen(screen, setMenu, setTodayTab);
    syncSettingsToLocalStorage({
      theme: DEFAULT_USER_SETTINGS.theme,
      initial_screen: screen,
      show_completed: showCompleted ? "open" : "close",
    });
    await persistUserSettings({ initial_screen: screen });
  };

  const handleShowCompletedChange = async (mode: ShowCompletedMode) => {
    const next = mode === "open";
    setShowCompleted(next);
    syncSettingsToLocalStorage({
      theme: DEFAULT_USER_SETTINGS.theme,
      initial_screen: defaultScreen,
      show_completed: mode,
    });
    await persistUserSettings({ show_completed: mode });
  };

  // 카테고리 목록 변경 시 선택 탭 유효성
  useEffect(() => {
    if (
      activeInboxTab !== "all" &&
      categories.length &&
      !categories.includes(activeInboxTab)
    ) {
      setActiveInboxTab("all");
    }
  }, [categories, activeInboxTab]);
  useEffect(() => {
    if (todayTab !== "all" && categories.length && !categories.includes(todayTab)) setTodayTab("all");
  }, [categories, todayTab]);
  useEffect(() => {
    if (nextTab !== "all" && categories.length && !categories.includes(nextTab)) setNextTab("all");
  }, [categories, nextTab]);
  useEffect(() => {
    if (calendarTab !== "all" && categories.length && !categories.includes(calendarTab)) {
      setCalendarTab("all");
    }
  }, [categories, calendarTab]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserId(session.user.id);
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authChecked || !userId || settingsHydrated) return;

    const uid = userId;
    let cancelled = false;

    async function hydrateSettings() {
      const settings = await loadOrCreateUserSettings(uid);
      if (cancelled) return;

      setTheme(settings.theme);
      setDefaultScreen(settings.initial_screen);
      setShowCompleted(settings.show_completed === "open");
      applyInitialScreen(settings.initial_screen, setMenu, setTodayTab);
      syncSettingsToLocalStorage(settings);
      setSettingsHydrated(true);
    }

    hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, [authChecked, userId, settingsHydrated, setTheme]);

  const handleLogout = async () => {
    setTheme("system");
    clearSettingsLocalStorage();
    setShowCompleted(true);
    setDefaultScreen("today");
    setMenu("today");
    setTodayTab("all");
    setSettingsHydrated(false);
    setUserId(null);
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
    if (!authChecked || !settingsHydrated) return;
    fetchTodos().finally(() => setLoading(false));
  }, [authChecked, settingsHydrated]);

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

  const calendarFilteredTodos = useMemo(
    () => filterVisibleTodos(filterByCategory(displaySortedTodos, calendarTab)),
    [displaySortedTodos, calendarTab, showCompleted]
  );

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

  const calendarMonthDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    return buildCalendarMonthDays(year, month);
  }, [calendarDate]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
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

    // Next / Calendar 뷰: 날짜 셀(또는 해당 날짜의 카드)에 드롭 → execution_date 변경
    if (menu === "next" || menu === "calendar") {
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
      menu === "inbox"
        ? activeInboxTab
        : menu === "today"
          ? todayTab
          : menu === "next"
            ? nextTab
            : menu === "calendar"
              ? calendarTab
              : "all";
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
      <div className="flex h-screen items-center justify-center bg-slate-50/90 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-sm">
        확인 중...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col md:flex-row text-slate-800 dark:text-slate-200 font-sans antialiased transition-colors duration-200">
      {/* 좌측 사이드바 */}
      <aside className="w-full md:w-64 flex-shrink-0 flex flex-col justify-between p-6 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-colors duration-200">
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
              <span className="text-2xl font-extrabold tracking-tighter text-slate-900 dark:text-slate-100">
                <span className="text-indigo-600">Do</span>Flow<span className="text-indigo-400">.</span>
              </span>
            </div>
          </h1>
          <nav className="flex flex-row md:flex-col gap-1 flex-wrap md:flex-nowrap">
            <button
              type="button"
              onClick={() => setMenu("inbox")}
              className={sidebarNavItemClass(menu === "inbox")}
            >
              <Inbox className="w-5 h-5" />
              Inbox
            </button>
            <button
              type="button"
              onClick={() => { setMenu("today"); setTodayTab("all"); }}
              className={sidebarNavItemClass(menu === "today")}
            >
              <Sun className="w-5 h-5" />
              Today
            </button>
            <button
              type="button"
              onClick={() => setMenu("next")}
              className={sidebarNavItemClass(menu === "next")}
            >
              <ListTodo className="w-5 h-5" />
              Next
            </button>
            <button
              type="button"
              onClick={() => setMenu("calendar")}
              className={sidebarNavItemClass(menu === "calendar")}
            >
              <Calendar className="w-5 h-5" />
              Calendar
            </button>
          </nav>
        </div>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className={`${sidebarNavItemClass(false)} mt-6 md:mt-0`}
        >
          <Settings className="w-5 h-5" />
          설정
        </button>
      </aside>

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          onLogout={handleLogout}
          showCompleted={showCompleted}
          onShowCompletedChange={handleShowCompletedChange}
          defaultScreen={defaultScreen}
          onDefaultScreenChange={handleDefaultScreenChange}
          onThemeChange={handleThemeChange}
        />
      )}

      {/* 우측 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto bg-white dark:bg-slate-950 p-8 md:p-12 transition-colors duration-200">
        {loading && (
          <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
            로딩 중...
          </div>
        )}
        {!loading && (
          <div className="flex-1 flex flex-col min-w-0">
            {fetchError && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
                <p className="font-medium">할 일 목록을 불러올 수 없습니다</p>
                <p className="mt-1 text-amber-700 dark:text-amber-300">{fetchError}</p>
                <p className="mt-2 text-amber-600 dark:text-amber-400 text-xs">
                  Supabase에 <code className="bg-amber-100 dark:bg-amber-900/60 px-1 rounded">todos</code> 테이블이 있는지, RLS 정책을 확인해 주세요.
                </p>
              </div>
            )}
            {menu === "inbox" && (
              <>
                <ViewPageHeader
                  title="Inbox"
                  description="아직 날짜가 지정되지 않은 모든 아이디어와 할 일의 대기소입니다."
                />
                <div className="mb-6">
                  <CategoryTabs
                    categories={categories}
                    active={activeInboxTab}
                    onSelect={setActiveInboxTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
                    onReorderCategories={setCategories}
                    showAllOption
                  />
                </div>
                <div className="mb-2 flex justify-end">
                  <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                      const category = activeInboxTab === "all" ? "Work" : activeInboxTab;
                      addTodo(inboxInput.trim(), category, inboxExecutionDate || null, inboxDueDate || null);
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
                    items={filterVisibleTodos(
                      filterByCategory(displaySortedTodos, activeInboxTab)
                    ).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                      {(() => {
                        const filtered = filterVisibleTodos(
                          filterByCategory(displaySortedTodos, activeInboxTab)
                        );
                        if (filtered.length === 0) {
                          return (
                            <li className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700">
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
                            {showCompleted && completedList.length > 0 && (
                              <li>
                                <div className="flex items-center my-2 text-xs">
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                  <span className="px-2 text-gray-400 dark:text-slate-500 text-xs font-medium">
                                    완료된 할일
                                  </span>
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                </div>
                              </li>
                            )}
                            {showCompleted &&
                              completedList.map((todo) => (
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
                <ViewPageHeader
                  title="Today"
                  description="오늘 반드시 집중해서 처리해야 할 최우선 미션입니다."
                />
                <div className="mb-6">
                  <CategoryTabs
                    categories={categories}
                    active={todayTab}
                    onSelect={setTodayTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
                    onReorderCategories={setCategories}
                    showAllOption
                  />
                </div>
                <div className="mb-2 flex justify-end">
                  <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                    items={filterVisibleTodos(
                      filterByCategory(todayFilteredTodos, todayTab)
                    ).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-6">
                      {(() => {
                        const overdue = filterByCategory(todayOverdueTodos, todayTab);
                        const todayList = filterVisibleTodos(
                          filterByCategory(todayFilteredTodos, todayTab)
                        );
                        if (overdue.length === 0 && todayList.length === 0) {
                          return (
                            <li className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm rounded-2xl bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-700">
                              오늘 실행할 일이 없습니다
                            </li>
                          );
                        }
                        return (
                          <>
                            {overdue.length > 0 && (
                              <li>
                                <div className="flex items-center my-3 text-xs md:text-base">
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                  <div className="flex items-center gap-2 px-3">
                                    <span className="font-medium text-gray-400 dark:text-slate-500 opacity-70 tracking-tight">
                                      기한이 지난
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleMoveOverdueToToday}
                                      className="px-3 py-1 rounded-full border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-[11px] text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                                    >
                                      🔄 모두 오늘로
                                    </button>
                                  </div>
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
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
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                  <span className="px-3 font-medium text-red-500 opacity-70 tracking-tight">
                                    오늘
                                  </span>
                                  <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
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
                                  {showCompleted && completedList.length > 0 && (
                                    <li>
                                      <div className="flex items-center my-2 text-xs">
                                        <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                        <span className="px-2 text-gray-400 dark:text-slate-500 text-xs font-medium">
                                          완료된 할일
                                        </span>
                                        <div className="flex-grow border-t border-gray-200 dark:border-slate-700" />
                                      </div>
                                    </li>
                                  )}
                                  {showCompleted &&
                              completedList.map((todo) => (
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
                <div className={`${SURFACE_FORM} p-2`}>
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
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      다가오는 {viewDays}일
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      오늘부터 실행 예정 할 일을 한눈에 확인하세요.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
                      {([3, 5, 7] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setViewDays(n)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 focus:ring-offset-1 dark:focus:ring-offset-slate-900 ${
                            viewDays === n
                              ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm border border-slate-200/80 dark:border-slate-600"
                              : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200"
                          }`}
                        >
                          {n}일
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-sm text-slate-600 dark:text-slate-400">주말/공휴일 제외</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={excludeHolidays}
                        onClick={() => setExcludeHolidays((v) => !v)}
                        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                          excludeHolidays
                            ? "bg-indigo-600 border-indigo-600"
                            : "bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600"
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
                <div className="mb-6">
                  <CategoryTabs
                    categories={categories}
                    active={nextTab}
                    onSelect={setNextTab}
                    onAddCategory={addCategory}
                    onRemoveCategory={removeCategory}
                    onReorderCategories={setCategories}
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
                      const baseForNext = filterVisibleTodos(
                        filterByCategory(displaySortedTodos, nextTab)
                      );
                      const dayTodos = sortTodosByCompletion(
                        baseForNext.filter((t) => t.execution_date === iso)
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
                                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
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
                        <div className={`flex flex-row items-center justify-between w-[260px] py-1.5 px-3 rounded-xl ${SURFACE_CARD} shadow-2xl scale-105 cursor-grabbing opacity-100`}>
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
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex flex-row justify-between items-center mb-6 w-full gap-4 flex-wrap">
                  <div className="flex items-center gap-8 flex-wrap min-w-0">
                    <div className="shrink-0">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Calendar</h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        전체 일정을 한눈에 조망하고 드래그하여 시공간을 재배치하세요.
                      </p>
                    </div>
                    <CategoryTabs
                      categories={categories}
                      active={calendarTab}
                      onSelect={setCalendarTab}
                      onAddCategory={addCategory}
                      onRemoveCategory={removeCategory}
                      onReorderCategories={setCategories}
                      showAllOption
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarDate(
                          (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors border border-slate-200/80 dark:border-slate-700"
                      aria-label="이전 달"
                    >
                      &lt;
                    </button>
                    <span className="text-base font-semibold text-slate-800 dark:text-slate-200 min-w-[7.5rem] text-center tabular-nums">
                      {calendarDate.getFullYear()}년 {calendarDate.getMonth() + 1}월
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarDate(
                          (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors border border-slate-200/80 dark:border-slate-700"
                      aria-label="다음 달"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/40 overflow-hidden transition-colors duration-200">
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  modifiers={[]}
                >
                  <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700">
                    {WEEKDAY_KO.map((label) => (
                      <div
                        key={label}
                        className="bg-slate-50 dark:bg-slate-800 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700">
                      {calendarMonthDays.map((date, index) => {
                        if (!date) {
                          return (
                            <div
                              key={`empty-${index}`}
                              className="bg-slate-50/50 dark:bg-slate-900/50 min-h-[100px]"
                              aria-hidden
                            />
                          );
                        }
                        const iso = toLocalDateString(date);
                        const dayTodos = sortTodosByCompletion(
                          calendarFilteredTodos.filter((t) => t.execution_date === iso)
                        );
                        const visible = dayTodos.slice(0, 3);
                        const overflow = dayTodos.length - 3;

                        return (
                          <DroppableCalendarDayCell
                            key={iso}
                            id={iso}
                            date={date}
                            dayTodos={dayTodos}
                          >
                            {visible.map((todo) => (
                              <DraggableMicroTodoBar key={todo.id} todo={todo} />
                            ))}
                            {overflow > 0 && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 px-0.5">
                                +{overflow}개 더보기
                              </p>
                            )}
                          </DroppableCalendarDayCell>
                        );
                      })}
                    </div>
                  </div>
                </DndContext>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
