"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import OctoIdle from "@/Assets/OCTOPILOT.png";
import OctoConfused from "@/Assets/OCTOPILOT_confused.png";
import OctoSad from "@/Assets/OCTOPILOT_sad.png";
import { OctoService } from "@/services/OctoService";

interface OctoAssistantProps {
    currentPage: string;
}

type OctoStatus = "idle" | "loading" | "error";

export default function OctoAssistant({ currentPage }: OctoAssistantProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<OctoStatus>("idle");
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
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

    const mascot = useMemo(() => {
        if (status === "loading") return OctoConfused;
        if (status === "error") return OctoSad;
        return OctoIdle;
    }, [status]);

    const handleAsk = async () => {
        const trimmed = question.trim();
        if (!trimmed || status === "loading") return;

        setStatus("loading");
        setErrorMessage("");
        try {
            const nextAnswer = await OctoService.ask(trimmed, currentPage);
            setAnswer(nextAnswer);
            setStatus("idle");
        } catch (error) {
            setAnswer("");
            setErrorMessage(error instanceof Error ? error.message : "Octo could not answer right now.");
            setStatus("error");
        }
    };

    return (
        <div ref={containerRef} className="pointer-events-none fixed bottom-4 left-4 z-[80]">
            {isOpen && (
                <div className="pointer-events-auto mb-4 w-[340px] rounded-[24px] border border-[#f97316]/20 bg-[#0f141c]/95 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl">
                    <p className="text-[16px] font-semibold text-white">Hi. I am Octo. Your Assistant. How can I help you?</p>
                    <p className="mt-1 text-[12px] leading-5 text-white/45">I can help you navigate Octopilot AI and explain what each screen or button does.</p>

                    {(answer || errorMessage) && (
                        <div className={`mt-4 rounded-[18px] border px-3 py-2.5 text-[13px] leading-6 ${errorMessage ? "border-[#ef4444]/25 bg-[#2b1114] text-[#fca5a5]" : "border-white/10 bg-[#161c25] text-white/86"}`}>
                            {errorMessage || answer}
                        </div>
                    )}

                    <div className="mt-4 flex items-end gap-2">
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void handleAsk();
                                }
                            }}
                            rows={3}
                            placeholder="Ask Octo about Octopilot AI..."
                            className="min-h-[92px] flex-1 resize-none rounded-[18px] border border-white/10 bg-[#161c25] px-3 py-3 text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#fb923c]/55"
                        />
                        <button
                            type="button"
                            onClick={() => void handleAsk()}
                            disabled={status === "loading" || !question.trim()}
                            className="rounded-[18px] bg-[#ea4335] px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-[#d33426] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            {status === "loading" ? "..." : "Ask"}
                        </button>
                    </div>
                </div>
            )}

            <div className="relative flex items-end">
                <div className="pointer-events-none absolute inset-0 -translate-x-1 translate-y-1 rounded-full bg-[radial-gradient(circle,_rgba(251,146,60,0.42)_0%,_rgba(234,67,53,0.18)_42%,_rgba(15,20,28,0)_72%)] blur-2xl" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[126px] w-[126px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#fb923c]/20 animate-[ping_3.8s_ease-out_infinite]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[106px] w-[106px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f97316]/25 animate-[ping_3.2s_ease-out_infinite]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,_rgba(251,146,60,0.0),_rgba(251,146,60,0.2),_rgba(234,67,53,0.0),_rgba(251,146,60,0.12),_rgba(251,146,60,0.0))] blur-xl animate-[spin_9s_linear_infinite]" />

                <button
                    type="button"
                    onClick={() => {
                        setIsOpen((prev) => !prev);
                        if (status === "error") {
                            setStatus("idle");
                            setErrorMessage("");
                        }
                    }}
                    className="pointer-events-auto relative flex h-[94px] w-[94px] items-center justify-center rounded-full border border-white/10 bg-[#10161f]/92 shadow-[0_18px_45px_rgba(0,0,0,0.45)] transition duration-300 hover:scale-[1.03] hover:border-[#fb923c]/35"
                    title="Open Octo assistant"
                >
                    <div className="absolute inset-[8px] rounded-full bg-[radial-gradient(circle,_rgba(251,146,60,0.18)_0%,_rgba(16,22,31,0.05)_65%,_rgba(16,22,31,0)_100%)]" />
                    <Image
                        src={mascot}
                        alt="Octo assistant"
                        width={74}
                        height={74}
                        className={`relative z-10 h-[74px] w-[74px] object-contain ${status === "loading" ? "animate-pulse" : ""}`}
                        priority
                    />
                </button>
            </div>
        </div>
    );
}
