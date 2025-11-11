"use client";

/**
 * KPI Dashboard för Reception
 * Visar metrics på "kravlöst"-känsla
 */
import { useEffect, useState } from "react";

type KPIData = {
  asked_question: number;
  chip_clicked: number;
  skip_pressed: number;
  repeat_rewrite: number;
  total_replies: number;
  total_user_messages: number;
};

export function ReceptionKPIDashboard() {
  const [kpi, setKpi] = useState<KPIData | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("reception_kpi_v1");
      if (raw) {
        const data = JSON.parse(raw);
        const totalReplies = data.asked_question || 0;
        const totalUserMessages = data.chip_clicked || 0;
        
        setKpi({
          asked_question: data.asked_question || 0,
          chip_clicked: data.chip_clicked || 0,
          skip_pressed: data.skip_pressed || 0,
          repeat_rewrite: data.repeat_rewrite || 0,
          total_replies: totalReplies,
          total_user_messages: totalUserMessages,
        });
      }
    } catch {
      // Ignore errors
    }
  }, []);

  if (!kpi) return null;

  const askedQuestionRate = kpi.total_replies > 0 ? (kpi.asked_question / kpi.total_replies) * 100 : 0;
  const skipPressedRate = kpi.total_user_messages > 0 ? (kpi.skip_pressed / kpi.total_user_messages) * 100 : 0;
  const repeatRewriteRate = kpi.total_replies > 0 ? (kpi.repeat_rewrite / kpi.total_replies) * 100 : 0;

  // Canary alerts
  const hasCanaryAlert = askedQuestionRate > 45 || repeatRewriteRate > 10;

  return (
    <div className="rounded-2xl border border-purple-200 bg-white/80 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Reception KPI Dashboard</h3>
      
      {hasCanaryAlert && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          ⚠️ Canary Alert: {askedQuestionRate > 45 ? "Frågerate för hög" : ""} {repeatRewriteRate > 10 ? "Repeat rewrite för hög" : ""}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-gray-600">Asked Question Rate</div>
          <div className={`text-lg font-bold ${askedQuestionRate > 40 ? "text-amber-600" : "text-emerald-600"}`}>
            {askedQuestionRate.toFixed(1)}%
          </div>
          <div className="text-gray-500">Target: ≤40%</div>
        </div>
        
        <div>
          <div className="text-gray-600">Skip Pressed Rate</div>
          <div className={`text-lg font-bold ${skipPressedRate < 5 ? "text-amber-600" : "text-emerald-600"}`}>
            {skipPressedRate.toFixed(1)}%
          </div>
          <div className="text-gray-500">Target: ≥5%</div>
        </div>
        
        <div>
          <div className="text-gray-600">Repeat Rewrite Rate</div>
          <div className={`text-lg font-bold ${repeatRewriteRate > 10 ? "text-amber-600" : "text-emerald-600"}`}>
            {repeatRewriteRate.toFixed(1)}%
          </div>
          <div className="text-gray-500">Target: &lt;10%</div>
        </div>
        
        <div>
          <div className="text-gray-600">Total Events</div>
          <div className="text-lg font-bold text-gray-900">
            {kpi.chip_clicked + kpi.asked_question}
          </div>
        </div>
      </div>
    </div>
  );
}

