"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");

  const handleSendCode = () => {
    if (!phone || phone.length < 11) {
      setError("请输入有效的手机号");
      return;
    }
    setError("");
    setCodeSent(true);
    setCountdown(60);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError("请输入手机号");
      return;
    }
    if (!code) {
      setError("请输入验证码");
      return;
    }
    setError("");
    // Mock login - save to localStorage
    localStorage.setItem("user_phone", phone);
    localStorage.setItem("is_logged_in", "true");
    router.push("/dashboard");
  };

  return (
    <div className="w-full max-w-[340px]">
      <h2 className="text-[28px] font-bold tracking-tight text-slate-800 mb-1.5" style={{ fontFamily: "'DM Sans', 'Noto Sans SC', sans-serif" }}>
        手机号登陆
      </h2>
      <p className="text-[13px] text-slate-400 mb-9 leading-relaxed">
        欢迎登录以继续使用 I Love 财务表单。
      </p>

      <form onSubmit={handleLogin}>
        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide">
            名称
          </label>
          <input
            type="tel"
            placeholder="电话号码"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3.5 py-[11px] border-[1.5px] border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-[3px] focus:ring-blue-600/10 placeholder:text-slate-300"
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-500 mb-1.5 tracking-wide">
            密码
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="请输入验证码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 px-3.5 py-[11px] border-[1.5px] border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-800 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-[3px] focus:ring-blue-600/10 placeholder:text-slate-300"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={countdown > 0}
              className="whitespace-nowrap px-3.5 border-[1.5px] border-blue-600 rounded-lg text-blue-600 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {countdown > 0 ? `${countdown}s` : codeSent ? "重新获取" : "获取验证码"}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-3 animate-fade-in">{error}</p>
        )}

        <button
          type="submit"
          className="w-full py-[13px] bg-blue-600 text-white text-[15px] font-semibold rounded-lg shadow-md shadow-blue-600/25 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 hover:-translate-y-0.5 transition-all mt-2"
        >
          登录
        </button>
      </form>

      <p className="text-center mt-6 text-[13px] text-slate-400">
        还没有账户？{" "}
        <button
          onClick={() => {
            localStorage.setItem("is_logged_in", "true");
            localStorage.setItem("user_phone", "13800000000");
            router.push("/dashboard");
          }}
          className="text-blue-600 font-semibold hover:underline"
        >
          立即注册
        </button>
      </p>
    </div>
  );
}
