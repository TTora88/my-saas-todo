"use client";

import { useState, useEffect, useMemo } from "react";
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
  LogOut,
  GripVertical,
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
};

type SidebarMenu = "inbox" | "today" | "next" | "calendar";

function mapRowToTodo(
  row: {
    id: string;
    title: string;
    is_done: boolean;
    category: string;
    created_at?: string;
    order_index?: number | null;
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
  };
}

// ——— 입력창 (공통 스타일) ———
function TodoInput({
  value,
  onChange,
  onSubmit,
  placeholder = "할 일 추가...",
  category,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  category: Category;
}) {
  const addTodo = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit();
      onChange("");
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 p-2 rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-300 transition-all"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-5 py-3.5 rounded-xl bg-slate-50/80 text-slate-800 placeholder:text-slate-400 focus:outline-none border-0 text-base"
      />
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

// ——— 정렬 가능한 할 일 카드 (드래그 핸들 + 드래그 중 스타일) ———
function SortableTodoRow({
  todo,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
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

  const isWork = todo.category === "work";
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 ease-out ${
        isDragging ? "opacity-80 shadow-xl ring-2 ring-indigo-500/30 z-10" : ""
      }`}
    >
      <button
        type="button"
        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 touch-none cursor-grab active:cursor-grabbing"
        aria-label="드래그"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </button>
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
      <span
        className={`flex-1 min-w-0 break-words transition-colors duration-200 ${
          todo.is_done ? "line-through text-slate-400" : "text-slate-700"
        }`}
      >
        {todo.title}
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

  // Inbox: work | life
  const [inboxTab, setInboxTab] = useState<"work" | "life">("work");
  const [inboxInput, setInboxInput] = useState("");

  // Today: all | work | life
  const [todayTab, setTodayTab] = useState<TabFilter>("all");
  const [todayInput, setTodayInput] = useState("");

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
      .select("id, title, is_done, category, created_at, order_index")
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

  const addTodo = async (text: string, category: Category) => {
    const nextOrder =
      todos.length === 0 ? 0 : Math.max(...todos.map((t) => t.order_index)) + 100;
    const { error } = await supabase
      .from("todos")
      .insert({ title: text, is_done: false, category, order_index: nextOrder });
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

  const sortedTodos = useMemo(
    () => [...todos].sort((a, b) => a.order_index - b.order_index),
    [todos]
  );

  const filterByCategory = (list: Todo[], tab: TabFilter) => {
    if (tab === "all") return list;
    return list.filter((t) => t.category === tab);
  };

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
    const filtered = filterByCategory(sortedTodos, tab);
    const oldIndex = filtered.findIndex((t) => t.id === active.id);
    const newIndex = filtered.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedFiltered = arrayMove(filtered, oldIndex, newIndex);
    const filteredIds = new Set(reorderedFiltered.map((t) => t.id));
    const newSorted = [...sortedTodos];
    let reorderedIdx = 0;
    for (let i = 0; i < newSorted.length; i++) {
      if (filteredIds.has(newSorted[i].id)) {
        newSorted[i] = reorderedFiltered[reorderedIdx++];
      }
    }
    const withNewOrder: Todo[] = newSorted.map((t, i) => ({
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
    <div className="flex h-screen bg-slate-50/90 text-slate-800 font-sans antialiased">
      {/* Sidebar 20% */}
      <aside className="w-[20%] min-w-[180px] max-w-[240px] flex flex-col border-r border-slate-200/80 bg-white/80">
        <div className="p-4 border-b border-slate-100">
          <h1 className="text-lg font-semibold text-slate-800 tracking-tight">
            Todo
          </h1>
        </div>
        <nav className="flex-1 p-2">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMenu(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                menu === item.id
                  ? "bg-slate-100 text-slate-800"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main: 중앙 컨테이너 + 헤더 */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100/80">
        {loading && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            로딩 중...
          </div>
        )}
        {!loading && (
          <div className="flex-1 flex flex-col min-w-0 w-full max-w-2xl mx-auto px-6 py-8">
            <header className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                나의 목표
              </h1>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            </header>
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
                <div className="mb-6">
                  <TodoInput
                    value={inboxInput}
                    onChange={setInboxInput}
                    onSubmit={() => {
                      addTodo(inboxInput.trim(), inboxTab);
                      setInboxInput("");
                    }}
                    placeholder={`${inboxTab === "work" ? "Work" : "Life"} 할 일 추가...`}
                    category={inboxTab}
                  />
                </div>
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={filterByCategory(sortedTodos, inboxTab).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                      {filterByCategory(sortedTodos, inboxTab).length === 0 ? (
                        <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                          할 일을 입력하고 추가해 보세요
                        </li>
                      ) : (
                        filterByCategory(sortedTodos, inboxTab).map((todo) => (
                          <SortableTodoRow
                            key={todo.id}
                            todo={todo}
                            onToggle={toggleTodo}
                            onRemove={removeTodo}
                          />
                        ))
                      )}
                    </ul>
                  </SortableContext>
                </DndContext>
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
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={filterByCategory(sortedTodos, todayTab).map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="flex-1 overflow-y-auto space-y-3 min-h-0 mb-6">
                      {filterByCategory(sortedTodos, todayTab).length === 0 ? (
                        <li className="py-16 text-center text-slate-400 text-sm rounded-2xl bg-white/60 border border-dashed border-slate-200">
                          할 일이 없습니다
                        </li>
                      ) : (
                        filterByCategory(sortedTodos, todayTab).map((todo) => (
                          <SortableTodoRow
                            key={todo.id}
                            todo={todo}
                            onToggle={toggleTodo}
                            onRemove={removeTodo}
                          />
                        ))
                      )}
                    </ul>
                  </SortableContext>
                </DndContext>
                <div className="rounded-2xl bg-white border border-slate-200/80 shadow-lg shadow-slate-200/50 p-2">
                  <TodoInput
                    value={todayInput}
                    onChange={setTodayInput}
                    onSubmit={() => {
                      const category: Category =
                        todayTab === "life" ? "life" : "work";
                      addTodo(todayInput.trim(), category);
                      setTodayInput("");
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
