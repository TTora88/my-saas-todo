"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
};

type SidebarMenu = "inbox" | "today" | "next" | "calendar";

function mapRowToTodo(row: {
  id: string;
  title: string;
  is_done: boolean;
  category: string;
  created_at?: string;
}): Todo {
  return {
    id: row.id,
    title: row.title,
    is_done: row.is_done ?? false,
    category: row.category === "life" ? "life" : "work",
    created_at: row.created_at,
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

  const isWork = category === "work";
  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 p-2 rounded-xl bg-white border border-slate-200/80 shadow-sm focus-within:ring-2 focus-within:ring-slate-300/50 focus-within:border-slate-300 transition-all"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-4 py-2.5 rounded-lg bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none border-0"
      />
      <button
        type="submit"
        className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-medium text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          isWork
            ? "bg-blue-500 hover:bg-blue-600 focus:ring-blue-400"
            : "bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-400"
        }`}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">추가</span>
      </button>
    </form>
  );
}

// ——— 할 일 한 줄 (체크, 텍스트, 삭제) ———
function TodoRow({
  todo,
  onToggle,
  onRemove,
}: {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isWork = todo.category === "work";
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50/80 transition-colors">
      <button
        type="button"
        onClick={() => onToggle(todo.id)}
        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          todo.is_done
            ? isWork
              ? "bg-blue-500 border-blue-500 text-white"
              : "bg-emerald-500 border-emerald-500 text-white"
            : "border-slate-300 hover:border-slate-400 focus:ring-slate-300"
        }`}
      >
        {todo.is_done && <Check className="w-3 h-3 stroke-[3]" />}
      </button>
      <span
        className={`flex-1 min-w-0 text-slate-700 break-words ${
          todo.is_done ? "line-through text-slate-400" : ""
        }`}
      >
        {todo.title}
      </span>
      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
          isWork
            ? "bg-blue-100 text-blue-700"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        {isWork ? "Work" : "Life"}
      </span>
      <button
        type="button"
        onClick={() => onRemove(todo.id)}
        className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all focus:outline-none focus:ring-2 focus:ring-red-200"
        aria-label="삭제"
      >
        <Trash2 className="w-4 h-4" />
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
      .select("id, title, is_done, category, created_at");
    if (error) {
      const msg = error.message ?? String(error);
      const code = error.code ?? "";
      console.error("todos fetch error:", { message: msg, code, details: error.details });
      setFetchError(msg);
      return;
    }
    setTodos((data ?? []).map(mapRowToTodo));
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchTodos().finally(() => setLoading(false));
  }, [authChecked]);

  const addTodo = async (text: string, category: Category) => {
    const { error } = await supabase
      .from("todos")
      .insert({ title: text, is_done: false, category });
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

  const filterByCategory = (list: Todo[], tab: TabFilter) => {
    if (tab === "all") return list;
    return list.filter((t) => t.category === tab);
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
        <div className="p-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main 80% */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {loading && (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            로딩 중...
          </div>
        )}
        {!loading && fetchError && (
          <div className="mx-6 mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <p className="font-medium">할 일 목록을 불러올 수 없습니다</p>
            <p className="mt-1 text-amber-700">{fetchError}</p>
            <p className="mt-2 text-amber-600 text-xs">
              Supabase에 <code className="bg-amber-100 px-1 rounded">todos</code> 테이블이 있는지, RLS 정책에서 anon 사용자의 SELECT가 허용되는지 확인해 주세요.
            </p>
          </div>
        )}
        {!loading && menu === "inbox" && (
          <>
            <div className="p-6 pb-4 border-b border-slate-200/80 bg-white/50">
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
            <div className="p-6 flex flex-col flex-1 min-h-0">
              <div className="mb-4">
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
              <ul className="flex-1 overflow-y-auto space-y-0.5 rounded-xl border border-slate-200/80 bg-white/80 p-2 min-h-[200px]">
                {filterByCategory(todos, inboxTab).length === 0 ? (
                  <li className="py-12 text-center text-slate-400 text-sm">
                    할 일을 입력하고 추가해 보세요
                  </li>
                ) : (
                  filterByCategory(todos, inboxTab).map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={toggleTodo}
                      onRemove={removeTodo}
                    />
                  ))
                )}
              </ul>
            </div>
          </>
        )}

        {!loading && menu === "today" && (
          <>
            <div className="p-6 pb-4 border-b border-slate-200/80 bg-white/50">
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
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ul className="flex-1 overflow-y-auto p-6 space-y-0.5 min-h-0">
                {filterByCategory(todos, todayTab).length === 0 ? (
                  <li className="py-12 text-center text-slate-400 text-sm rounded-xl border border-dashed border-slate-200 bg-white/50">
                    할 일이 없습니다
                  </li>
                ) : (
                  filterByCategory(todos, todayTab).map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={toggleTodo}
                      onRemove={removeTodo}
                    />
                  ))
                )}
              </ul>
              <div className="shrink-0 p-4 pt-2 pb-6 border-t border-slate-200/80 bg-white/80">
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
            </div>
          </>
        )}

        {!loading && (menu === "next" || menu === "calendar") && (
          <div className="flex-1 flex items-center justify-center p-6 text-slate-400 text-sm">
            {menu === "next" ? "Next" : "Calendar"} 화면은 준비 중입니다.
          </div>
        )}
      </main>
    </div>
  );
}
