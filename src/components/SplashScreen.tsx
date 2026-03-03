"use client";

import { useEffect, useRef, useState } from "react";

interface SplashScreenProps {
  onFinished: () => void;
}

export default function SplashScreen({ onFinished }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFadeOut(true);
    setTimeout(onFinished, 900);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      finish();
      return;
    }

    video.muted = true;
    video.addEventListener("ended", finish);

    video.play().catch(() => {
      finish();
    });

    const timeout = setTimeout(finish, 10000);

    return () => {
      video.removeEventListener("ended", finish);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0a0a0a] transition-opacity duration-800 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        playsInline
        className="h-full w-full object-cover"
      >
        <source
          src="/App_Logo_Entrance_Animation_Video.mov"
          type="video/quicktime"
        />
      </video>
    </div>
  );
}
