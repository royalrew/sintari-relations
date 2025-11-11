"use client";

import React from "react";
import { Button } from "@/components/ui/button";

type HandoffDialogProps = {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
  roomType: "coach" | "couples";
  summary: string;
};

export function HandoffDialog({ open, onClose, onAccept, onDecline, roomType, summary }: HandoffDialogProps) {
  if (!open) return null;

  const roomName = roomType === "coach" ? "AI-coachen" : "Par-terapi AI";
  const roomDescription = roomType === "coach" 
    ? "för att arbeta med dina personliga mål och utveckling"
    : "för att arbeta med er relation tillsammans";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-900">
            Vill du föra över vad vi pratat om?
          </h3>
          <p className="text-sm text-gray-600">
            Jag kan lotsa dig till <strong>{roomName}</strong> {roomDescription}.
          </p>
        </div>

        {summary && summary.trim().length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-purple-900 mb-2">Sammanfattning av vårt samtal:</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            <strong>Om du godkänner:</strong> {roomName} kommer att få kontext om vad vi pratat om och kan fortsätta därifrån.
          </p>
          <p className="text-sm text-gray-600">
            <strong>Om du inte godkänner:</strong> Du kan börja från början i det nya rummet utan att dela vad vi pratat om.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            onClick={onAccept}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            Ja, föra över kontext
          </Button>
          <Button
            onClick={onDecline}
            variant="outline"
            className="flex-1"
          >
            Nej, börja från början
          </Button>
        </div>
        <Button
          onClick={onClose}
          variant="ghost"
          className="w-full text-xs text-gray-500"
        >
          Stanna kvar här
        </Button>
      </div>
    </div>
  );
}

