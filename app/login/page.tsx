"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabase";

type OAuthProvider = "kakao" | "apple" | "google";

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError(null);
    setLoadingProvider(provider);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Local / Vercel 등 현재 접속 도메인을 동적으로 감지해 OAuth 후 복귀
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (authError) {
      setError(authError.message ?? "소셜 로그인에 실패했습니다.");
      setLoadingProvider(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4 transition-colors duration-200">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 transition-colors duration-200">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 mb-2 text-center">
          <span className="text-indigo-600">Do</span>Flow
          <span className="text-indigo-400">.</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-10">
          일과 삶의 리듬을 시작하세요
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => handleOAuthLogin("kakao")}
            className="w-full flex items-center justify-center py-4 px-4 rounded-xl font-semibold text-[#000000] bg-[#FEE500] hover:bg-[#FEE500]/90 disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-[#FEE500]/60 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 shrink-0"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9 2C4.029 2 0 4.698 0 8.026C0 10.16 1.487 12.035 3.75 13.067C3.513 13.882 2.85 16.275 2.802 16.486C2.742 16.753 3.033 16.714 3.208 16.592C3.411 16.452 5.568 14.975 6.786 14.159C7.498 14.305 8.238 14.385 9 14.385C13.971 14.385 18 11.688 18 8.359C18 5.031 13.971 2 9 2Z"
                fill="#000000"
              />
            </svg>
            <span>{loadingProvider === "kakao" ? "연결 중..." : "카카오 로그인"}</span>
          </button>

          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => handleOAuthLogin("apple")}
            className="w-full flex items-center justify-center gap-3 py-4 px-4 rounded-xl font-semibold bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200 disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <AppleIcon className="w-5 h-5 shrink-0" />
            <span>{loadingProvider === "apple" ? "연결 중..." : "Apple로 계속하기"}</span>
          </button>

          <button
            type="button"
            disabled={loadingProvider !== null}
            onClick={() => handleOAuthLogin("google")}
            className="w-full flex items-center justify-center gap-3 py-4 px-4 rounded-xl font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            <GoogleIcon className="w-5 h-5 shrink-0" />
            <span>{loadingProvider === "google" ? "연결 중..." : "Google로 계속하기"}</span>
          </button>
        </div>

        {error && (
          <p className="mt-6 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-4 py-2.5 text-center">
            {error}
          </p>
        )}

        <p className="mt-8 text-xs text-center text-slate-400 dark:text-slate-500 leading-relaxed">
          로그인 시 DoFlow의 서비스 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </div>
    </div>
  );
}
