"use client";

import Image from "next/image";

export default function LogoNav() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/OCTOPILOT.png"
        alt="Octopilot"
        width={40}
        height={40}
        className="rounded-lg"
      />
      <Image
        src="/logoText.png"
        alt="OctoPilot AI"
        width={180}
        height={36}
        style={{ width: "auto", height: 34 }}
      />
    </div>
  );
}
