"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import OctoIdle from "@/Assets/OCTOPILOT.png";
import OctoConfused from "@/Assets/OCTOPILOT_confused.png";
import OctoSad from "@/Assets/OCTOPILOT_sad.png";
import { AuthService } from "@/services/AuthService";
import { OctoService } from "@/services/OctoService";

interface OctoAssistantProps {
    currentPage: string;
}

type OctoStatus = "idle" | "loading" | "error";

interface ExchangeState {
    question: string;
    answer: string;
}

export default function OctoAssistant({ currentPage }: OctoAssistantProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<OctoStatus>("idle");
    const [question, setQuestion] = useState("");
    const [activeExchange, setActiveExchange] = useState<ExchangeState | null>(null);
    const [displayedAnswer, setDisplayedAnswer] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [user, setUser] = useState<User | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, []);

    useEffect(() => {
        setUser(AuthService.getCurrentUser());
        return AuthService.subscribe(setUser);
    }, []);

    const mascot = useMemo(() => {
        if (status === "loading") return OctoConfused;
        if (status === "error") return OctoSad;
        return OctoIdle;
    }, [status]);

    useEffect(() => {
        if (!activeExchange?.answer) {
            return;
        }

        let index = 0;
        const timer = window.setInterval(() => {
            index += Math.max(1, Math.ceil(activeExchange.answer.length / 80));
            setDisplayedAnswer(activeExchange.answer.slice(0, index));
            if (index >= activeExchange.answer.length) {
                window.clearInterval(timer);
            }
        }, 24);

        return () => window.clearInterval(timer);
    }, [activeExchange]);

    const userAvatar = user?.photoURL || user?.providerData.find((provider) => provider.photoURL)?.photoURL || "";

    const handleAsk = async () => {
        const trimmed = question.trim();
        if (!trimmed || status === "loading") return;

        setQuestion("");
        setStatus("loading");
        setActiveExchange({ question: trimmed, answer: "" });
        setDisplayedAnswer("");
        setErrorMessage("");
        try {
            const nextAnswer = await OctoService.ask(trimmed, currentPage);
            setActiveExchange({ question: trimmed, answer: nextAnswer });
            setStatus("idle");
        } catch (error) {
            setActiveExchange({ question: trimmed, answer: "" });
            setErrorMessage(error instanceof Error ? error.message : "Octo could not answer right now.");
            setStatus("error");
        }
    };

    return (
        <div ref={containerRef} className="pointer-events-none fixed bottom-1 left-4 z-[80] flex flex-col items-start">
            {isOpen && (
                <div className="pointer-events-auto mb-3 w-[368px] rounded-[28px] border border-[#f59e0b]/18 bg-[linear-gradient(180deg,rgba(11,17,30,0.98),rgba(8,12,22,0.96))] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.52)] backdrop-blur-xl animate-[octoPanelIn_260ms_cubic-bezier(0.22,1,0.36,1)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f59e0b]/18 bg-[#111826] shadow-[0_0_24px_rgba(245,158,11,0.08)]">
                            <Image src={OctoIdle} alt="Octo assistant" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
                        </div>
                        <div>
                            <p className="text-[15px] font-semibold text-white">Ask Octo</p>
                            <p className="text-[12px] leading-5 text-white/45">Quick guidance for the screen you are on.</p>
                        </div>
                    </div>

                    <div className="mt-4 min-h-[162px] rounded-[24px] border border-white/8 bg-white/[0.02] px-3 py-3">
                        {!activeExchange && status !== "loading" ? (
                            <div className="flex h-full min-h-[136px] items-center justify-center text-center text-[13px] leading-6 text-white/42 animate-[octoFadeIn_220ms_ease-out]">
                                Ask one question. Octo will answer with a single focused reply.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {activeExchange?.question && (
                                    <div className="flex items-end justify-end gap-2 animate-[octoBubbleIn_280ms_cubic-bezier(0.22,1,0.36,1)]">
                                        <div className="max-w-[248px] rounded-[22px] rounded-br-[10px] border border-white/10 bg-[#1a2231] px-4 py-3 text-[13px] leading-6 text-white/92 shadow-[0_10px_22px_rgba(0,0,0,0.22)]">
                                            {activeExchange.question}
                                        </div>
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.05]">
                                            {userAvatar ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={userAvatar} alt="User avatar" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
                                                    {(user?.displayName || user?.email || "U").slice(0, 1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(status === "loading" || displayedAnswer || errorMessage) && (
                                    <div className="flex items-end gap-2 animate-[octoBubbleIn_320ms_cubic-bezier(0.22,1,0.36,1)]">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f59e0b]/18 bg-[#111826] shadow-[0_0_18px_rgba(245,158,11,0.08)]">
                                            <Image src={mascot} alt="Octo assistant" width={28} height={28} className={`h-7 w-7 object-contain ${status === "loading" ? "animate-pulse" : ""}`} />
                                        </div>
                                        <div className={`max-w-[258px] rounded-[22px] rounded-bl-[10px] border px-4 py-3 text-[13px] leading-6 shadow-[0_10px_22px_rgba(0,0,0,0.2)] ${errorMessage ? "border-[#ef4444]/24 bg-[#2b1114] text-[#fca5a5]" : "border-[#f59e0b]/10 bg-[#141c2a] text-white/90"}`}>
                                            {errorMessage ? (
                                                errorMessage
                                            ) : status === "loading" ? (
                                                <span className="flex items-center gap-1.5 text-white/70">
                                                    <span>Thinking</span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#f5d17a] animate-[octoDot_1.1s_ease-in-out_infinite]" />
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#f5d17a] animate-[octoDot_1.1s_ease-in-out_infinite]" style={{ animationDelay: "120ms" }} />
                                                        <span className="h-1.5 w-1.5 rounded-full bg-[#f5d17a] animate-[octoDot_1.1s_ease-in-out_infinite]" style={{ animationDelay: "240ms" }} />
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="animate-[octoFadeIn_220ms_ease-out]">{displayedAnswer}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 flex items-end gap-2">
                        <div className="flex-1 rounded-[22px] border border-[#f59e0b]/24 bg-[#111826] px-3 py-3 transition focus-within:border-[#f5d17a]/55 focus-within:shadow-[0_0_0_1px_rgba(245,209,122,0.12)]">
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void handleAsk();
                                    }
                                }}
                                rows={2}
                                placeholder="Ask Octo about this page..."
                                className="h-[56px] w-full resize-none bg-transparent text-[13px] leading-6 text-white outline-none placeholder:text-white/28"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleAsk()}
                            disabled={status === "loading" || !question.trim()}
                            className="rounded-full bg-[#ea4335] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_12px_26px_rgba(234,67,53,0.2)] transition duration-200 hover:scale-[1.01] hover:bg-[#f04d3f] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            Ask
                        </button>
                    </div>
                </div>
            )}

            <div className="relative h-[64px] w-[64px]">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#fb923c]/18 animate-[ping_3.6s_ease-out_infinite]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[54px] w-[54px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f97316]/20 animate-[ping_2.8s_ease-out_infinite]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[78px] w-[78px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,_rgba(251,146,60,0.0),_rgba(251,146,60,0.16),_rgba(234,67,53,0.0),_rgba(251,146,60,0.08),_rgba(251,146,60,0.0))] blur-md animate-[spin_10s_linear_infinite]" />

                <button
                    type="button"
                    onClick={() => {
                        setIsOpen((prev) => !prev);
                        if (status === "error") {
                            setStatus("idle");
                            setErrorMessage("");
                        }
                    }}
                    className="pointer-events-auto relative flex h-[64px] w-[64px] items-center justify-center transition duration-300 hover:scale-[1.03]"
                    title="Open Octo assistant"
                >
                    <Image
                        src={mascot}
                        alt="Octo assistant"
                        width={56}
                        height={56}
                        className={`relative z-10 h-[56px] w-[56px] object-contain ${status === "loading" ? "animate-pulse" : ""}`}
                        priority
                    />
                </button>
            </div>
            <style jsx>{`
                @keyframes octoPanelIn {
                    from {
                        opacity: 0;
                        transform: translateY(16px) scale(0.97);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                @keyframes octoBubbleIn {
                    from {
                        opacity: 0;
                        transform: translateY(12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes octoFadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes octoDot {
                    0%, 80%, 100% {
                        opacity: 0.35;
                        transform: translateY(0);
                    }
                    40% {
                        opacity: 1;
                        transform: translateY(-2px);
                    }
                }
            `}</style>
        </div>
    );
}
