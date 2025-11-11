"use client";

import { useState } from "react";

import { useWarmCopy } from "@/lib/hooks/useWarmCopy";

export default function WarmDemo() {
  const [name, setName] = useState("Anna");
  const [tod, setTod] = useState<"morgon" | "eftermiddag" | "kväll">("kväll");
  const [mode, setMode] = useState<"personal" | "hr">("personal");
  const [risk, setRisk] = useState<"SAFE" | "RED">("SAFE");

  const { greeting, farewell, turn } = useWarmCopy({ name, tod, mode, risk });

  return (
    <div className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Warm Copy Demo</h1>
      <div className="grid grid-cols-2 gap-3">
        <input
          className="border rounded px-2 py-1"
          placeholder="namn"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="border rounded px-2 py-1"
          value={tod}
          onChange={(e) => setTod(e.target.value as any)}
        >
          <option value="morgon">morgon</option>
          <option value="eftermiddag">eftermiddag</option>
          <option value="kväll">kväll</option>
        </select>
        <select
          className="border rounded px-2 py-1"
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
        >
          <option value="personal">personal</option>
          <option value="hr">hr</option>
        </select>
        <select
          className="border rounded px-2 py-1"
          value={risk}
          onChange={(e) => setRisk(e.target.value as any)}
        >
          <option value="SAFE">SAFE</option>
          <option value="RED">RED</option>
        </select>
      </div>

      <div className="space-x-3">
        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={() => alert(greeting())}
        >
          Visa greeting (turn {turn()})
        </button>
        <button className="px-4 py-2 rounded border" onClick={() => alert(farewell())}>
          Visa farewell
        </button>
      </div>

      <p className="text-sm text-gray-500">Interjektion infogas högst var 6:e tur.</p>
    </div>
  );
}
