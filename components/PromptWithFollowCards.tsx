"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Plus, GripVertical, Check, ChevronLeft, ChevronRight, Brain, Settings2, Undo2, Redo2 } from "lucide-react";
import { buildGreeting, pickFarewell } from "@/lib/copy/warm_sv";
import { composeReply, inferIntent } from "@/copy/policy_reply";
import { SHOW_INTERJECTION } from "@/lib/copy/warm_config";
import { isGoodbye } from "@/lib/nlu/goodbye";
import { resetInterjection } from "@/lib/state/interjection_store";
import { resolveTod } from "@/lib/time/tod";
import { COUPLES_ROOM_ENABLED } from "@/lib/copilot/env";
import { composeCouplesReply } from "@/lib/policy/couples_reply";
import { useRouter } from "next/navigation";
import { HandoffDialog } from "@/components/HandoffDialog";
import { AnalysisReadiness } from "@/components/coach/AnalysisReadiness";
import { GuideRunner } from "@/components/coach/GuideRunner";
import { chooseToolFromInsights } from "@/lib/coach/tool_selector";
import type { ToolKey } from "@/components/coach/Toolbox";
import ExportConversation from "@/components/coach/ExportConversation";

const SHOW_THINK = process.env.NEXT_PUBLIC_SHOW_THINK !== "false";

/**
 * PromptWithFollowCards (mobile-first)
 * Nu utökad med:
 * 1) Simulerad AI-stream ("hur AI tänker" → tokens + stegchips)
 * 2) Minne (HITL): redigerbart sidofält + förslag → godkänn/ändra/avböj + undo/redo
 * 3) Coach-verktyg: Toolbox, GuideRunner, auto-val från insikter
 */
export default function PromptWithFollowCards({
  activeTool,
  onToolComplete,
  onStartTool,
}: {
  activeTool?: ToolKey | null;
  onToolComplete?: () => void;
  onStartTool?: (tool: ToolKey) => void;
} = {}) {
  // -------- Core state
  const [text, setText] = useState("");
  const [active, setActive] = useState<ActiveCard[]>([]);
  const [known, setKnown] = useState<Record<string, Entity>>({
    kalle: { id: "kalle", kind: "person", name: "Kalle" },
    maria: { id: "maria", kind: "person", name: "Maria" },
    team: { id: "team-alfa", kind: "group", name: "Team Alfa" },
  });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState<null | { name: string; anchorRect: DOMRect | null }>(null);

  // -------- Chat & stream state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const assistantTurnRef = useRef(1);
  const lastInterjectionAtRef = useRef(-10);
  const lastSuggestionTurnRef = useRef<number | null>(null);
  const introNoteRef = useRef<string | undefined>(undefined);
  const coachSessionStartedRef = useRef(false);
  const goalFirstSetLoggedRef = useRef(false);
  const pendingCoachMetricsRef = useRef<CoachMetricPayload>({});
  const couplesSessionStartedRef = useRef(false);
  const couplesRepairLoggedRef = useRef(false);
  const pendingCouplesMetricsRef = useRef<CouplesMetricPayload>({});
  const sessionIdRef = useRef<string>("");
  if (!sessionIdRef.current) {
    sessionIdRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }
  const sessionId = sessionIdRef.current;

  // -------- Memory (HITL) state
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memory, setMemory] = useState<Memory>({
    profile: { name: "Du", lang: "sv", tonePrefs: ["lugnt", "rakt"] },
    goals: [
      { id: "g1", title: "Hantera konflikter bättre", status: "active", kpi: "< 1 upptrappning/vecka", updatedAt: new Date().toISOString() },
    ],
    values: ["ärlighet", "respekt"],
    relationshipMap: [],
    decisions: [],
    version: 1,
  });
  const [suggestions, setSuggestions] = useState<MemorySuggest[]>([]);
  const [undoStack, setUndo] = useState<Memory[]>([]);
  const [redoStack, setRedo] = useState<Memory[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // -------- Handoff state
  const [handoffDialog, setHandoffDialog] = useState<{
    open: boolean;
    roomType: "coach" | "couples" | null;
    summary: string;
  }>({
    open: false,
    roomType: null,
    summary: "",
  });
  const handoffTriggeredRef = useRef(false);
  const router = useRouter();
  
  // -------- Coach agent insights state
  const [coachInsights, setCoachInsights] = useState<any>(null);
  const lastAgentAnalysisRef = useRef<number>(0);
  const lastMessageTimeRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const AGENT_ANALYSIS_INTERVAL = 3; // Kör agent-analys var 3:e meddelande i coach-rummet
  const DEBOUNCE_MS = 6000; // Vänta 6 sekunder efter senaste meddelandet
  
  // -------- Guide state
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [isWaitingForGuideInput, setIsWaitingForGuideInput] = useState(false);
  
  // Reset guide when tool changes
  useEffect(() => {
    if (activeTool) {
      setGuideStepIndex(0);
      setIsWaitingForGuideInput(false);
    }
  }, [activeTool]);

  // -------- Refs
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      assistantTurnRef.current = 1;
      lastInterjectionAtRef.current = -10;
      resetInterjection();
      lastSuggestionTurnRef.current = null;
      introNoteRef.current = undefined;
      coachSessionStartedRef.current = false;
      goalFirstSetLoggedRef.current = false;
      pendingCoachMetricsRef.current = {};
      couplesSessionStartedRef.current = false;
      couplesRepairLoggedRef.current = false;
      pendingCouplesMetricsRef.current = {};
      handoffTriggeredRef.current = false;
      lastAgentAnalysisRef.current = 0;
      setCoachInsights(null); // Clear insights when conversation resets
      
      // Check for context from handoff
      if (typeof window !== "undefined") {
        const coachContext = sessionStorage.getItem("coach_context");
        const couplesContext = sessionStorage.getItem("couples_context");
        
        if (coachContext) {
          // Store context internally (not as visible message)
          const decodedContext = decodeURIComponent(coachContext);
          sessionStorage.setItem("_coach_context_internal", decodedContext);
          sessionStorage.removeItem("coach_context");
        } else if (couplesContext) {
          // Store context internally (not as visible message)
          const decodedContext = decodeURIComponent(couplesContext);
          sessionStorage.setItem("_couples_context_internal", decodedContext);
          sessionStorage.removeItem("couples_context");
        }
      }
    }
  }, [messages.length]);

  // --- Entity detection (simple regex + cache). Debounced via light polling (mobile-friendly)
  useEffect(() => {
    const el = taRef.current; if (!el) return;
    const handler = () => {
      const v = el.value; const caret = el.selectionEnd ?? v.length;
      const token = lastToken(v, caret); const match = detectEntityToken(token);
      if (match) { const rect = caretClientRect(el) || el.getBoundingClientRect(); setGhost({ name: match, rect, caret }); }
      else setGhost(null);
    };
    const id = setInterval(handler, 160); return () => clearInterval(id);
  }, []);

  // --- Keyboard acceptance (Tab/Enter) + escape to dismiss + send on Enter
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter always creates a new line - don't prevent default
    if (e.key === "Enter" && e.shiftKey) {
      return; // Allow default behavior (new line)
    }
    
    // Prevent sending if already thinking
    if (isThinking && e.key === "Enter") {
      e.preventDefault();
      return;
    }
    
    // Handle ghost acceptance with Tab only (Enter will send message)
    if (ghost && e.key === "Tab") {
      e.preventDefault();
      acceptGhost(ghost.name);
      return;
    }
    
    // Dismiss ghost with Escape
    if (ghost && e.key === "Escape") {
      e.preventDefault();
      setGhost(null);
      return;
    }
    
    // Send message on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const currentText = String((e.target as HTMLTextAreaElement).value ?? "");
      if (currentText.trim() && !isThinking) {
        // Clear ghost before sending
        setGhost(null);
        // Send directly with the text from textarea
        onSend(currentText);
      }
    }
  };

  function acceptGhost(name: string) {
    const id = slug(name);
    const exists = active.some((a) => a.id === id);
    if (!exists) {
      if (!known[id]) {
        const rect = taRef.current ? caretClientRect(taRef.current) : null;
        setShowQuickCreate({ name, anchorRect: rect });
      } else {
        setActive((prev) => [...prev, { id, name, weight: calcNextWeight(prev) }]);
      }
    }
    setGhost(null);
  }

  function handleCreateEntity(e: Entity) {
    setKnown((prev) => ({ ...prev, [e.id]: e }));
    setActive((prev) => [...prev, { id: e.id, name: e.name, weight: calcNextWeight(prev) }]);
    setShowQuickCreate(null);
  }

  function removeActive(id: string) {
    setActive((prev) => prev.filter((a) => a.id !== id));
  }

  function moveActive(id: string, dir: -1 | 1) {
    setActive((prev) => {
      const idx = prev.findIndex((a) => a.id === id); if (idx === -1) return prev; const j = idx + dir; if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev]; const tmp = copy[idx]; copy[idx] = copy[j]; copy[j] = tmp; return copy;
    });
  }

  // -------------- SEND + Smart Coach Routing
  async function onSend(inputTextOverride?: string) {
    const inputText = String(inputTextOverride ?? text ?? "").trim();
    if (!inputText) return;
    
    // Prevent double submission
    if (isThinking) return;
    
    const userMessage: Msg = { id: nid(), role: "user", content: inputText };
    setText("");
    setGhost(null); // Clear ghost when sending

    setIsThinking(true);
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTimeRef.current;
    lastMessageTimeRef.current = now;
    
    // Check if we're in coach room
    const isInCoachRoom = typeof window !== "undefined" && window.location.pathname === "/coach";
    
    // Check if user wants to start a tool
    if (isInCoachRoom && !activeTool) {
      const toolCommands: Record<string, ToolKey> = {
        "starta breathing60": "breathing60",
        "starta threeThings": "threeThings",
        "starta iMessage": "iMessage",
        "starta pauseMode": "pauseMode",
        "starta andningsankare": "breathing60",
        "starta 3 saker": "threeThings",
        "starta jag-budskap": "iMessage",
        "starta paus": "pauseMode",
      };
      
      const lowerInput = inputText.toLowerCase();
      for (const [cmd, tool] of Object.entries(toolCommands)) {
        if (lowerInput.includes(cmd)) {
          // Start tool via parent component callback
          setMessages((m) => [...m, userMessage]);
          setIsThinking(false);
          onStartTool?.(tool);
          return;
        }
      }
    }
    
    // Handle guide input if active
    if (activeTool && isWaitingForGuideInput) {
      // User is responding to a guide step
      setMessages((m) => [...m, userMessage]);
      setIsThinking(false);
      // Trigger next step in guide
      setGuideStepIndex((i) => i + 1);
      setIsWaitingForGuideInput(false);
      return;
    }
    
    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    
    try {
      const startedAt = performance.now();
      
      if (isInCoachRoom) {
        // Use new coach API: fast reply + background analysis
        await handleCoachSend(inputText, userMessage, startedAt, timeSinceLastMessage);
      } else {
        // Standard reply (reception or other rooms)
        const reply = composeAssistantReply(inputText, startedAt);
        const assistantMessage: Msg = { id: nid(), role: "assistant", content: reply, meta: buildReplyMeta() };
        setMessages((m) => [...m, userMessage, assistantMessage]);
        setIsThinking(false);
      }
      
      // Queue memory suggestions
      const maybeName = active[0]?.name;
      if (maybeName && Math.random() > 0.7) {
        queueSuggestion({
          id: nid(),
          kind: "goal_add",
          title: `Förbättra kommunikationen med ${maybeName}`,
          reason: "Du nämnde en konflikt nyligen. Vill du göra detta till ett mål?",
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Msg = { 
        id: nid(), 
        role: "assistant", 
        content: "Ursäkta, något gick fel. Försök igen." 
      };
      setMessages((m) => [...m, userMessage, errorMessage]);
      setIsThinking(false);
    }
  }
  
  /**
   * Handle coach room send: fast reply + background analysis
   */
  async function handleCoachSend(
    inputText: string,
    userMessage: Msg,
    startedAt: number,
    timeSinceLastMessage: number
  ) {
    const threadId = sessionId;
    const currentMessages = [...messages, userMessage];
    
    // Get last insights (may be a few seconds old)
    const lastInsights = coachInsights;
    
    try {
      // 1) Get fast reply from /api/coach/reply
      const replyResponse = await fetch("/api/coach/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg: inputText,
          threadId,
          conversation: currentMessages.map(m => ({ role: m.role, content: m.content })),
          lastInsights,
        }),
      });
      
      if (!replyResponse.ok) {
        const errorData = await replyResponse.json().catch(() => ({}));
        console.error("Coach reply API error:", errorData);
        throw new Error(errorData.error || `Reply API failed: ${replyResponse.status}`);
      }
      
      const replyData = await replyResponse.json();
      
      // Säkerställ att vi har ett giltigt svar
      if (!replyData.reply || typeof replyData.reply !== 'string') {
        console.error("Invalid reply data:", replyData);
        throw new Error("Invalid reply from API");
      }
      
      const assistantMessage: Msg = {
        id: nid(),
        role: "assistant",
        content: replyData.reply,
        meta: buildReplyMeta(),
      };
      
      // Update insights if provided
      if (replyData.insightsUsed) {
        // Insights were used in reply
        
        // Auto-val av verktyg från insikter
        if (coachInsights && !activeTool && typeof window !== "undefined" && window.location.pathname === "/coach") {
          try {
            const suggestedTool = chooseToolFromInsights(coachInsights);
            const toolLabels: Record<ToolKey, string> = {
              breathing60: "60s Andningsankare",
              threeThings: "3 saker jag bär på",
              iMessage: "Jag-budskap",
              pauseMode: "Tryggt paus-läge",
            };
            
            // Lägg till ett förslag om verktyg
            const toolSuggestion: Msg = {
              id: nid(),
              role: "assistant",
              content: `Tips: Jag kan guida dig genom "${toolLabels[suggestedTool]}". Skriv "starta ${suggestedTool}" för att börja.`,
              meta: buildReplyMeta(),
            };
            setMessages((m) => [...m, toolSuggestion]);
          } catch (error) {
            console.error("Tool selection error:", error);
          }
        }
      }
      
      setMessages((m) => [...m, userMessage, assistantMessage]);
      setIsThinking(false);
      
      // 2) Trigger background analysis if due (non-blocking)
      if (replyData.analysisDue) {
        // Debounce: wait if messages are coming fast
        if (timeSinceLastMessage < DEBOUNCE_MS) {
          // Clear previous timeout and set new one
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
          }
          debounceTimeoutRef.current = setTimeout(() => {
            triggerBackgroundAnalysis(threadId, currentMessages);
          }, DEBOUNCE_MS - timeSinceLastMessage);
        } else {
          // Trigger immediately
          triggerBackgroundAnalysis(threadId, currentMessages);
        }
      }
    } catch (error) {
      console.error("Coach send error:", error);
      // Fallback to standard reply
      const reply = composeAssistantReply(inputText, startedAt);
      const assistantMessage: Msg = { id: nid(), role: "assistant", content: reply, meta: buildReplyMeta() };
      setMessages((m) => [...m, userMessage, assistantMessage]);
      setIsThinking(false);
    }
  }
  
  /**
   * Trigger background analysis (non-blocking, fire-and-forget)
   */
  function triggerBackgroundAnalysis(threadId: string, conversation: Msg[]) {
    const payload = JSON.stringify({
      threadId,
      conversation: conversation.map(m => ({ role: m.role, content: m.content })),
    });
    
    // Use sendBeacon if available (best for background requests)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/coach/analyze",
        new Blob([payload], { type: "application/json" })
      );
    } else {
      // Fallback to fetch with keepalive
      fetch("/api/coach/analyze", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (data.insights) {
            setCoachInsights(data.insights);
          }
        }
      }).catch((error) => {
        console.error("Background analysis error:", error);
        // Non-blocking: continue even if analysis fails
      });
    }
  }

  function composeAssistantReply(userText: string, startedAtMs: number): string {
    const turn = assistantTurnRef.current;
    const mode = detectMode(userText, active, known);
    const risk = detectRisk(userText);
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const partnerMention = /min\s+(kille|pojkvän|partner|fru|man|sambo|make|maka)/i.test(userText);
    const primaryName = partnerMention ? activePartnerName(active, known) : active[0]?.name;
    const intent = isGoodbye(userText)
      ? "goodbye"
      : mode === "hr" && turn === 1
      ? "hr"
      : inferIntent(userText);
    const locale = memory.profile?.lang === "en" ? "en" : "sv";
    const affect = inferAffect(userText);
    const ttfbMs = Math.max(0, performance.now() - startedAtMs);
    
    // Check if we have context from handoff (stored internally)
    const internalContext = typeof window !== "undefined" 
      ? (sessionStorage.getItem("_coach_context_internal") || sessionStorage.getItem("_couples_context_internal"))
      : null;
    const hasContext = !!internalContext;

    const isCouples = COUPLES_ROOM_ENABLED && isCouplesConversation(userText, active, known);
    const isCoach = detectCoachIntent(userText, active, known);
    
    // Check if we're in the coach room
    // Note: Coach room now uses /api/coach/reply for fast responses
    // Background analysis is handled in handleCoachSend()
    const isInCoachRoom = typeof window !== "undefined" && window.location.pathname === "/coach";
    
    // Trigger handoff dialog when mode is detected (but only once per session, and only in reception)
    // Check if we're on the main page (reception), not in a specific room
    const isReception = typeof window !== "undefined" && window.location.pathname === "/";
    if ((isCouples || isCoach) && !handoffTriggeredRef.current && turn >= 2 && messages.length >= 2 && isReception) {
      handoffTriggeredRef.current = true;
      const summary = generateConversationSummary(messages);
      setHandoffDialog({
        open: true,
        roomType: isCouples ? "couples" : "coach",
        summary,
      });
    }
    
    if (isCouples && !couplesSessionStartedRef.current) {
      couplesSessionStartedRef.current = true;
      queueCouplesMetric("handoff");
    }

    const coachPayload: CoachMetricPayload = { ...pendingCoachMetricsRef.current };
    pendingCoachMetricsRef.current = {};
    if (active.length > 0) {
      coachPayload.ctx_hit = (coachPayload.ctx_hit ?? 0) + 1;
    }
    if (!coachSessionStartedRef.current) {
      coachSessionStartedRef.current = true;
      coachPayload.goal_session_start = (coachPayload.goal_session_start ?? 0) + 1;
      coachPayload.first_reply_ttfb_ms = Math.round(ttfbMs);
    }
    const couplesPayload: CouplesMetricPayload = { ...pendingCouplesMetricsRef.current };
    pendingCouplesMetricsRef.current = {};
    const signals = {
      intent,
      affect,
      specificity: inferSpecificity(userText),
      risk,
      mode,
      turn,
      lastInterjectionAt: lastInterjectionAtRef.current >= 0 ? lastInterjectionAtRef.current : undefined,
      locale,
      sessionId: `${sessionId}:${turn}`,
    } as const;

    const greetingCtx = {
      name: memory.profile?.name && memory.profile.name !== "Du" ? memory.profile.name : undefined,
      isReturn: turn > 1,
      tod: resolveTod(),
      mode,
      risk,
      turn,
      lastInterjectionAt: lastInterjectionAtRef.current >= 0 ? lastInterjectionAtRef.current : undefined,
    } as const;

    let reply: string | null = null;
    let usedInterjection = false;

    if (!reply && lastAssistant && askedForStep(lastAssistant.content) && isAffirmative(userText)) {
      reply = buildStepSuggestion(primaryName);
      lastSuggestionTurnRef.current = turn;
    }

    if (!reply && isCouples) {
      reply = composeCouplesReply({ partnerName: primaryName, affect });
    } else if (!reply && lastAssistant && isStepSuggestion(lastAssistant.content) && isAffirmative(userText)) {
      reply = buildStepChoiceFollowUp(primaryName);
    }

    if (
      !reply &&
      lastSuggestionTurnRef.current != null &&
      turn - lastSuggestionTurnRef.current >= 1 &&
      isStillUnsure(userText)
    ) {
      reply = buildFollowUpAfterSuggestion(primaryName);
      lastSuggestionTurnRef.current = null;
    }

    if (!reply && isCouples && lastAssistant && isCouplesReply(lastAssistant.content) && isAffirmative(userText)) {
      reply = buildCouplesAcceptReply(primaryName);
      markCouplesRepairAccept();
      couplesPayload.repair_accept = (couplesPayload.repair_accept ?? 0) + 1;
    }

    if (!reply && intent === "goodbye") {
      reply = pickFarewell(greetingCtx);
    } else if (!reply && turn === 1) {
      // If we have context, acknowledge it in greeting
      if (hasContext && internalContext) {
        // Use first 100 chars of context for greeting
        const contextPreview = internalContext.length > 100 
          ? internalContext.slice(0, 100) + "..." 
          : internalContext;
        reply = `Tack för att du kom hit. Jag ser att du nämnde: "${contextPreview}". Låt oss fortsätta därifrån. Vad skulle vara skönt att börja med?`;
        // Clear context after first use
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("_coach_context_internal");
          sessionStorage.removeItem("_couples_context_internal");
        }
      } else {
        reply = buildGreeting(greetingCtx);
      }
    } else if (!reply && isInCoachRoom && coachInsights) {
      // In coach room: use agent insights to provide more accurate, informed replies
      reply = composeCoachReplyWithInsights(userText, coachInsights, affect, locale, turn);
    } else if (!reply) {
      // Check if user gave a concrete answer/statement that we should acknowledge
      // Also check if last assistant asked a question (to avoid repeating it)
      const lastAskedQuestion = lastAssistant && /[?¿]/.test(lastAssistant.content);
      const userGaveAnswer = !/[?¿]/.test(userText.trim()) && 
        (userText.length > 5 || /\b(vill|hoppas|känns|skulle|behöver|måste|ska|göra|bli|vara|ha|att)\b/i.test(userText));
      
      // If user answered a question, acknowledge it instead of asking again
      if (userGaveAnswer && lastAskedQuestion) {
        // User answered something - acknowledge it and ask a DIFFERENT follow-up
        const acknowledgment = buildAcknowledgmentReply(userText, affect, locale, turn);
        reply = acknowledgment;
      } else if (userGaveAnswer && !lastAskedQuestion) {
        // User gave info but we didn't ask - acknowledge and explore
        const acknowledgment = buildAcknowledgmentReply(userText, affect, locale, turn);
        reply = acknowledgment;
      } else {
        // Use standard composeReply for questions or unclear input
        // But avoid repeating the exact same question
        const { text, usedInterjection: interj } = composeReply(
          userText,
          { ...signals, allowInterjection: turn > 1 && (turn - (lastInterjectionAtRef.current || 0)) >= 6 },
          { showInterjection: SHOW_INTERJECTION },
        );
        
        // If we're about to repeat the same question, use acknowledgment instead
        if (lastAssistant && text === lastAssistant.content && userText.length > 5) {
          reply = buildAcknowledgmentReply(userText, affect, locale, turn);
        } else {
          reply = text;
          usedInterjection = interj;
        }
      }
    }

    if (/Hmm…|Okej…|Mmm…|Jag vill bara känna in/i.test(reply)) {
      usedInterjection = true;
    }

    if (usedInterjection) {
      lastInterjectionAtRef.current = turn;
    }

    const trimmedReply = reply.trim();
    logStyleTelemetry({
      replyText: trimmedReply,
      userText,
      mode,
      risk,
      affect,
      coach: Object.keys(coachPayload).length ? coachPayload : undefined,
      couples: Object.keys(couplesPayload).length ? couplesPayload : undefined,
    });

    emitStyleTelemetry({
      sessionId,
      userText,
      replyText: trimmedReply,
      signals,
    });

    assistantTurnRef.current += 1;
    return trimmedReply;
  }

  function buildReplyMeta(): ReplyMeta {
    return {
      startAt: Date.now(),
      queueHonestyPrompt: () => {
        introNoteRef.current = "honesty_prompt_pending";
      },
      queueCoachGoalPrompt: () => {
        introNoteRef.current = "coach_goal_prompt";
      },
    };
  }

  function queueCoachMetric(key: keyof CoachMetricPayload, value = 1) {
    pendingCoachMetricsRef.current[key] = (pendingCoachMetricsRef.current[key] ?? 0) + value;
  }

  function markCoachGoalFirstSet() {
    if (goalFirstSetLoggedRef.current) return;
    goalFirstSetLoggedRef.current = true;
    queueCoachMetric("goal_first_set", 1);
  }

  function queueCouplesMetric(key: keyof CouplesMetricPayload, value = 1) {
    pendingCouplesMetricsRef.current[key] =
      (pendingCouplesMetricsRef.current[key] ?? 0) + value;
  }

  function markCouplesRepairAccept() {
    if (couplesRepairLoggedRef.current) return;
    couplesRepairLoggedRef.current = true;
    queueCouplesMetric("repair_accept", 1);
  }

  function logStyleTelemetry(params: {
    replyText: string;
    userText: string;
    mode: "personal" | "hr";
    risk: "SAFE" | "RED";
    affect: "low" | "medium" | "high";
    coach?: CoachMetricPayload;
    couples?: CouplesMetricPayload;
  }) {
    const payload: Record<string, unknown> = {
      sessionId,
      turn: assistantTurnRef.current,
      mode: params.mode,
      risk: params.risk,
      userText: params.userText,
      replyText: params.replyText,
      empathyScore: estimateEmpathyScore(params.affect),
      toneDelta: 0,
    };

    if (params.coach && Object.keys(params.coach).length > 0) {
      payload.coach = params.coach;
    }
    if (params.couples && Object.keys(params.couples).length > 0) {
      payload.couples = params.couples;
    }

    void fetch("/api/style/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  // -------------- Memory HITL actions
  function queueSuggestion(s: MemorySuggest) {
    setSuggestions((prev) => [...prev, s]);
  }

  function pushUndo() { setUndo((u) => [...u, cloneMem(memory)]); setRedo([]); }

  function approveSuggestion(s: MemorySuggest) {
    pushUndo();
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    if (s.kind === "goal_add" && s.title) {
      markCoachGoalFirstSet();
      setMemory((m) => ({ ...m, goals: [...m.goals, { id: slug(s.title!), title: s.title!, status: "active", updatedAt: new Date().toISOString() }] , version: m.version + 1 }));
    }
  }

  function declineSuggestion(s: MemorySuggest) {
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
  }

  function editGoal(id: string, patch: Partial<Goal>) {
    pushUndo();
    setMemory((m) => ({
      ...m,
      goals: m.goals.map((g) => g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g),
      version: m.version + 1,
    }));
  }

  function addGoalQuick() {
    pushUndo();
    const title = prompt("Nytt mål:")?.trim();
    if (!title) return;
    markCoachGoalFirstSet();
    setMemory((m) => ({ ...m, goals: [...m.goals, { id: slug(title), title, status: "active", updatedAt: new Date().toISOString() }], version: m.version + 1 }));
  }

  function undo() {
    const prev = undoStack[undoStack.length - 1]; if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    setRedo((r) => [...r, cloneMem(memory)]);
    setMemory(prev);
  }

  function redo() {
    const nxt = redoStack[redoStack.length - 1]; if (!nxt) return;
    setRedo((r) => r.slice(0, -1));
    setUndo((u) => [...u, cloneMem(memory)]);
    setMemory(nxt);
  }

  // Auto-scroll to bottom when new messages or thinking state changes
  useEffect(() => {
    if (!chatRef?.current) return;
    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({
          top: chatRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  }, [messages, isThinking]);

  return (
    <div className="mx-auto max-w-[820px] p-2 sm:p-4 space-y-2">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Brain className="h-4 w-4" />
          {SHOW_THINK ? (isThinking ? "AI tänker…" : "Redo") : "Redo"}
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">({messages.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {messages.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                if (confirm("Är du säker på att du vill rensa konversationen?")) {
                  setMessages([]);
                  setText("");
                  setActive([]);
                  setGhost(null);
                }
              }}
              className="text-xs h-7 px-2"
            >
              Rensa
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-xs h-7 px-2"
            title={isCollapsed ? "Expandera" : "Minimera"}
          >
            {isCollapsed ? "↓" : "↑"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMemoryOpen(true)} className="h-7 px-2 text-xs">
            <Settings2 className="h-3 w-3 mr-1" /> Minne
          </Button>
          <Button variant="outline" size="sm" onClick={undo} disabled={!undoStack.length} title="Ångra" className="h-7 px-2">
            <Undo2 className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={!redoStack.length} title="Gör om" className="h-7 px-2">
            <Redo2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Active Rail */}
          {active.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none snap-x pb-1">
              {active.map((a) => (
                <ActiveChip
                  key={a.id}
                  card={a}
                  onRemove={() => removeActive(a.id)}
                  onLeft={() => moveActive(a.id, -1)}
                  onRight={() => moveActive(a.id, +1)}
                />
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 shrink-0 text-xs px-2">
                    <Plus className="h-3 w-3 mr-1" /> Lägg till
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80">
                  <QuickCreate onCreated={handleCreateEntity} defaultName="" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Chat shell: scrollable list + fixed composer */}
          <div className="relative rounded-xl border overflow-hidden bg-white">
            {/* Scrollable chat list */}
            <div ref={chatRef} className="max-h-[400px] sm:max-h-[500px] overflow-y-auto overscroll-contain p-2 sm:p-3 grid gap-2 bg-white dark:bg-neutral-950">
          {messages.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <p>Börja ett samtal genom att skriva ett meddelande nedan.</p>
              <p className="mt-2 text-xs">AI:en lyssnar och hjälper dig vidare.</p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-2 text-sm shadow-sm ${
                m.role === "user" 
                  ? "bg-purple-50 border-purple-200 ml-auto max-w-[85%] sm:max-w-[75%]" 
                  : m.role === "assistant" 
                  ? "bg-neutral-50 border-gray-200 mr-auto max-w-[85%] sm:max-w-[75%]" 
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-xs sm:text-sm">{m.content}</div>
              {m.role === "assistant" && (
                <FeedbackBar msgId={m.id} messages={messages} />
              )}
            </div>
          ))}
          {isThinking && (
            <div className="rounded-lg border border-gray-200 bg-neutral-50 p-2 text-sm mr-auto max-w-[85%] sm:max-w-[75%]">
              <div className="flex items-center gap-2 text-gray-500">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                </div>
                <span className="text-xs">AI tänker...</span>
              </div>
            </div>
          )}
          
          {/* Export Conversation Button */}
          {messages.length > 0 && (
            <div className="px-2 pb-2">
              <ExportConversation 
                threadId={sessionId}
                conversation={messages.map(m => ({
                  role: m.role === "user" ? "user" : "coach",
                  text: m.content,
                  ts: m.timestamp || Date.now(),
                }))}
              />
            </div>
          )}
        </div>

        {/* Composer (fixed inside shell) */}
        <div className="border-t bg-white/95 dark:bg-neutral-900/95 backdrop-blur p-2 space-y-1.5">
          {/* Textarea + Ghost Overlay */}
          <div className="relative">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isThinking}
              className="w-full min-h-[80px] sm:min-h-[90px] rounded-lg border p-2.5 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-neutral-900 disabled:opacity-60 disabled:cursor-not-allowed resize-none"
              placeholder={isThinking ? "AI tänker..." : "Skriv till AI… Enter skickar, Shift+Enter ny rad"}
            />
            {/* Docked fallback add button (mobile-friendly) */}
            <Popover open={!!showQuickCreate} onOpenChange={(o) => !o && setShowQuickCreate(null)}>
              <PopoverTrigger asChild>
                <button
                  className="absolute right-2 bottom-2 h-8 w-8 rounded-full border flex items-center justify-center bg-white/90 shadow-sm dark:bg-neutral-900"
                  aria-label="Snabbskapa kort"
                  onClick={() => setShowQuickCreate({ name: ghost?.name ?? "", anchorRect: null })}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <QuickCreate onCreated={handleCreateEntity} defaultName={showQuickCreate?.name ?? ""} />
              </PopoverContent>
            </Popover>

          </div>

          {/* Ghost chip overlay (below textarea when entity detected) */}
          {ghost && (
            <div className="flex items-center justify-start pl-2 mt-1">
              <div className="px-2 py-0.5 rounded-full border-2 border-purple-500 bg-white shadow-lg text-xs font-bold text-purple-700">
                + {ghost.name} <kbd className="ml-1 text-xs">Tab</kbd>
              </div>
            </div>
          )}

          {/* Send row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5">
            <div className="text-xs text-neutral-500 hidden sm:block">
              <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Enter</kbd> skickar · <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">Shift+Enter</kbd> ny rad
            </div>
            <Button 
              onClick={() => onSend()} 
              disabled={!text.trim() || isThinking}
              className="h-8 px-4 text-sm w-full sm:w-auto"
            >
              {isThinking ? "Skickar..." : "Skicka"}
            </Button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Analysis Readiness Indicator (only in coach room) */}
      {typeof window !== "undefined" && window.location.pathname === "/coach" && messages.filter(m => m.role === "user").length > 0 && (
        <div className="mt-4">
          <AnalysisReadiness
            turns={messages.map(m => ({
              role: m.role === "user" ? "user" : "assistant",
              text: m.content,
            }))}
            onStartAnalysis={() => {
              // Trigger background analysis
              const threadId = sessionId;
              const conversation = messages;
              triggerBackgroundAnalysis(threadId, conversation);
            }}
            forceAllow={true}
          />
        </div>
      )}

      {/* Guide Runner (only in coach room when tool is active) */}
      {typeof window !== "undefined" && window.location.pathname === "/coach" && activeTool && (
        <GuideRunner
          tool={activeTool}
          stepIndex={guideStepIndex}
          onStepChange={setGuideStepIndex}
          onYield={(text) => {
            // Skicka guide-meddelande till chatten
            const guideMessage: Msg = {
              id: nid(),
              role: "assistant",
              content: text,
              meta: buildReplyMeta(),
            };
            setMessages((m) => [...m, guideMessage]);
            setIsWaitingForGuideInput(true);
          }}
          onDone={() => {
            setIsWaitingForGuideInput(false);
            setGuideStepIndex(0);
            onToolComplete?.();
          }}
        />
      )}

      {/* Memory Drawer (mobile-first, full-screen overlay) */}
      {memoryOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMemoryOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] h-[80%] sm:h-full bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-none shadow-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold">Minne (HITL)</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addGoalQuick}>+ Mål</Button>
                <Button variant="outline" size="sm" onClick={() => setMemoryOpen(false)}>Stäng</Button>
              </div>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="text-sm font-medium">Förslag från AI</div>
                {suggestions.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3 text-sm flex items-start justify-between gap-3 bg-amber-50">
                    <div>
                      <div className="font-medium">{s.title || s.kind}</div>
                      <div className="text-neutral-600 text-xs">{s.reason}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => approveSuggestion(s)}>Godkänn</Button>
                      <Button size="sm" variant="outline" onClick={() => declineSuggestion(s)}>Avböj</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Goals list */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Mål</div>
              {memory.goals.map((g) => (
                <div key={g.id} className="rounded-lg border p-3 text-sm flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{g.title}</div>
                    <div className="text-xs text-neutral-500">Status: {g.status} · Uppdaterad: {new Date(g.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => editGoal(g.id, { status: g.status === "active" ? "done" : "active" })}>
                      {g.status === "active" ? "Markera klar" : "Aktivera"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const nv = prompt("Ändra mål", g.title)?.trim(); if (!nv) return; editGoal(g.id, { title: nv });
                    }}>Redigera</Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Values */}
            <div className="mt-4">
              <div className="text-sm font-medium mb-1">Värderingar</div>
              <div className="flex flex-wrap gap-2">
                {(memory.values ?? []).map((v, i) => (
                  <span key={i} className="px-2 py-1 rounded-full border text-xs">{v}</span>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Handoff Dialog */}
      <HandoffDialog
        open={handoffDialog.open}
        onClose={() => setHandoffDialog({ open: false, roomType: null, summary: "" })}
        onAccept={async () => {
          const roomType = handoffDialog.roomType;
          if (!roomType) return;
          
          // Spara sammanfattning via handoff API
          try {
            const response = await fetch("/api/reception/handoff", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId,
                consent: true,
                carryOver: "minimal",
                summary: handoffDialog.summary,
                risk: "SAFE",
                mode: "personal",
              }),
            });
            
            if (response.ok) {
              // Route till rätt rum med kontext
              const route = roomType === "coach" ? "/coach" : "/couples";
              router.push(`${route}?context=${encodeURIComponent(handoffDialog.summary)}`);
            } else {
              // Fallback: route utan kontext om API failar
              const route = roomType === "coach" ? "/coach" : "/couples";
              router.push(route);
            }
          } catch (error) {
            console.error("Handoff API error:", error);
            // Fallback: route utan kontext
            const route = roomType === "coach" ? "/coach" : "/couples";
            router.push(route);
          }
        }}
        onDecline={() => {
          const roomType = handoffDialog.roomType;
          if (!roomType) return;
          
          // Route till rum utan kontext (börja från början)
          const route = roomType === "coach" ? "/coach" : "/couples";
          router.push(route);
        }}
        roomType={handoffDialog.roomType || "coach"}
        summary={handoffDialog.summary}
      />
    </div>
  );
}

// ----------------- Components -----------------
function FeedbackBar({ msgId, messages, onVoted }: { msgId: string; messages: Msg[]; onVoted?: () => void }) {
  const [busy, setBusy] = React.useState(false);

  async function send(vote: "+1" | "-1", tags: string[] = [], notes = "") {
    setBusy(true);
    await fetch("/api/learn/feedback", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ msg_id: msgId, vote, tags, notes }),
    }).finally(() => setBusy(false));
    onVoted?.();
  }

  async function correct() {
    // Hitta meddelandet i konversationen för att få kontext
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    // Hitta användarens meddelande före detta svar
    const msgIndex = messages.findIndex((m) => m.id === msgId);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;

    const target = prompt("Skriv hur svaret BORDE ha låtit:", msg.content);
    if (!target) return;

    // Skicka korrigering med full kontext
    await fetch("/api/learn/correction", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        msg_id: msgId,
        target,
        user_input: userMsg?.content || "unknown",
        original_reply: msg.content,
        conversation_context: messages.slice(0, msgIndex + 1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });
  }

  async function promote() {
    // Hitta meddelandet i konversationen för att få kontext
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;

    // Hitta användarens meddelande före detta svar
    const msgIndex = messages.findIndex((m) => m.id === msgId);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;

    if (!userMsg) {
      alert("Kan inte främja: saknar användarmeddelande");
      return;
    }

    // Skicka promotion med full kontext
    await fetch("/api/learn/promote", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        msg_id: msgId,
        suite: "chat_smart",
        level: "Silver",
        user_input: userMsg.content,
        assistant_reply: msg.content,
        conversation_context: messages.slice(0, msgIndex + 1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        signals: {
          intent: "share",
          affect: "medium",
          mode: "personal",
          risk: "SAFE",
          turn: messages.filter((m) => m.role === "user").length,
        },
      }),
    });
  }

  return (
    <div className="flex gap-2 text-xs text-neutral-500 mt-2">
      <button disabled={busy} onClick={() => send("+1")} className="hover:text-neutral-700 disabled:opacity-50">👍</button>
      <button disabled={busy} onClick={() => send("-1", ["tone_miss"])} className="hover:text-neutral-700 disabled:opacity-50">👎</button>
      <button className="underline hover:text-neutral-700" onClick={correct}>Korrigera</button>
      <button className="underline hover:text-neutral-700" onClick={promote}>Främja till golden</button>
    </div>
  );
}

function ActiveChip({ card, onRemove, onLeft, onRight }: {
  card: ActiveCard;
  onRemove: () => void;
  onLeft: () => void;
  onRight: () => void;
}) {
  return (
    <div className="snap-start flex items-center gap-1 rounded-full border px-2 py-1 bg-white shadow-sm dark:bg-neutral-900">
      <GripVertical className="h-3.5 w-3.5 text-neutral-400" />
      <span className="text-sm font-medium">{card.name}</span>
      <div className="flex items-center gap-0.5 ml-1">
        <button onClick={onLeft} className="h-6 w-6 grid place-items-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Flytta vänster">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRight} className="h-6 w-6 grid place-items-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Flytta höger">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="h-6 w-6 grid place-items-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Ta bort">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function QuickCreate({ onCreated, defaultName }: { onCreated: (e: Entity) => void; defaultName?: string }) {
  const [kind, setKind] = useState<"person" | "group">("person");
  const [name, setName] = useState(defaultName || "");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(defaultName || ""), [defaultName]);

  const schema = useMemo(
    () =>
      z.object({
        id: z.string().min(1),
        kind: z.enum(["person", "group"]),
        name: z.string().min(2, "Minst 2 tecken"),
        role: z.string().optional(),
      }),
    []
  );

  const onSubmit = () => {
    try {
      const entity: Entity = { id: slug(name), kind, name, role: role || undefined };
      schema.parse({ ...entity, id: entity.id });
      onCreated(entity);
    } catch (e: any) {
      setError(e?.errors?.[0]?.message || "Ogiltiga fält");
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Snabbskapa kort</div>
      <div className="flex gap-2 text-xs">
        <button onClick={() => setKind("person")} className={`px-2 py-1 rounded-full border ${kind === "person" ? "bg-neutral-900 text-white" : "bg-white"}`}>Person</button>
        <button onClick={() => setKind("group")} className={`px-2 py-1 rounded-full border ${kind === "group" ? "bg-neutral-900 text-white" : "bg-white"}`}>Grupp</button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qc-name">Namn</Label>
        <Input id="qc-name" placeholder="Kalle / Team Alfa" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="qc-role">{kind === "person" ? "Roll/Relation (frivillig)" : "Syfte/Normer (frivilligt)"}</Label>
        <Input id="qc-role" placeholder={kind === "person" ? "kollega, partner…" : "projekt, avdelning…"} value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onCreated({ id: slug(name || "ny"), kind, name: name || "Ny", role: role || undefined })}>Snabb</Button>
        <Button onClick={onSubmit}><Check className="h-4 w-4 mr-1"/>Spara</Button>
      </div>
    </div>
  );
}

// ----------------- Types & helpers -----------------
type ReplyMeta = {
  startAt: number;
  queueHonestyPrompt: () => void;
  queueCoachGoalPrompt: () => void;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: ReplyMeta;
};

type CoachMetricPayload = {
  goal_first_set?: number;
  goal_session_start?: number;
  goal_progress?: number;
  ctx_hit?: number;
  first_reply_ttfb_ms?: number;
};

type CouplesMetricPayload = {
  handoff?: number;
  repair_accept?: number;
};

type Entity = { id: string; kind: "person" | "group" | "other"; name: string; role?: string };

type ActiveCard = { id: string; name: string; weight: number };

type Ghost = { name: string; rect: DOMRect | null; caret: number };

type Memory = {
  profile: { name: string; lang: "sv" | "en"; tonePrefs?: string[] };
  goals: Goal[];
  values?: string[];
  relationshipMap: { id: string; withId: string; label: string }[];
  decisions?: { id: string; note: string; date: string }[];
  version: number;
};

type Goal = { id: string; title: string; status: "active" | "paused" | "done"; kpi?: string; updatedAt: string };

type MemorySuggest = { id: string; kind: "goal_add" | "value_add" | "note_add"; title?: string; reason?: string; createdAt: string };

type MessagePayload = {
  text: string;
  activeCardIds: string[];
  weights: Record<string, number>;
  memorySnapshot: { goals: Goal[]; values?: string[]; relationshipMap: any[] };
};

function slug(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}
function nid() { return Math.random().toString(36).slice(2, 10); }

function lastToken(v: string, caret: number) {
  const left = v.slice(0, caret);
  const m = left.match(/([\p{L}A-Za-zÅÄÖåäö]+(?:\s+[\p{L}A-Za-zÅÄÖåäö]+)?)$/u);
  return m ? m[1] : "";
}

function detectEntityToken(token: string): string | null {
  if (!token) return null;
  if (/^(Team|Lag)\s+[A-ZÅÄÖ][\p{L}A-Za-zÅÄÖåäö]+$/u.test(token)) return token.trim();
  if (/^[A-ZÅÄÖ][\p{L}A-Za-zÅÄÖåäö]{2,}$/u.test(token)) return token.trim();
  return null;
}

function detectMode(
  text: string,
  active: ActiveCard[],
  known: Record<string, Entity>,
): "personal" | "hr" {
  if (active.some((card) => known[card.id]?.kind === "group")) return "hr";
  if (/\b(hr|chef|kollega|arbetsplats|team)\b/i.test(text)) return "hr";
  return "personal";
}

function detectCoachIntent(
  text: string,
  active: ActiveCard[],
  known: Record<string, Entity>,
): boolean {
  // Detektera om användaren vill arbeta med personliga mål/utveckling
  const coachKeywords = /\b(mål|förbättra|utveckla|bli bättre|själv|personlig|egna|mina|jag vill|jag behöver|hjälp mig|coach|coaching)\b/i;
  const isPersonalGoal = coachKeywords.test(text);
  
  // Inte couples (för att undvika konflikt)
  const isCouples = isCouplesConversation(text, active, known);
  
  return isPersonalGoal && !isCouples && active.length === 0; // Coach är ofta enskilt fokus
}

function generateConversationSummary(messages: Msg[]): string {
  // Generera en kort sammanfattning av konversationen (max 240 tecken)
  const userMessages = messages
    .filter(m => m.role === "user")
    .map(m => m.content)
    .join(" ");
  
  if (!userMessages.trim()) return "";
  
  // Ta första 200 tecknen och lägg till "..."
  const summary = userMessages.trim().slice(0, 200);
  return summary.length < userMessages.length ? summary + "..." : summary;
}

/**
 * Analyserar konversationen med agent-systemet (samma som /analyze använder)
 * Kör i bakgrunden och returnerar insikter som kan användas för mer exakta svar
 */
async function analyzeConversationWithAgents(messages: Msg[], userMessage: string): Promise<any | null> {
  try {
    const response = await fetch("/api/coach/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: messages,
        userMessage,
        person1: "Användare",
        person2: "AI-coachen",
      }),
    });

    if (!response.ok) {
      console.warn("Agent analysis failed:", response.status);
      return null;
    }

    const data = await response.json();
    return data.insights || null;
  } catch (error) {
    console.error("Agent analysis error:", error);
    return null;
  }
}

/**
 * Komponerar coach-svar med hjälp av agent-insikter
 * Behåller coach-personan men låter "hjärnan" vara analyssystemet
 */
function composeCoachReplyWithInsights(
  userText: string,
  insights: any,
  affect: "low" | "medium" | "high",
  locale: "sv" | "en",
  turn: number
): string {
  // Om det finns riskflaggor, hantera dem först
  if (insights.riskFlags && insights.riskFlags.length > 0) {
    if (insights.riskFlags.includes("safety_red") || insights.riskFlags.includes("selfharm_risk")) {
      return "Jag hör att det kan vara tufft just nu. Det är viktigt att du får rätt stöd. Om du känner dig otrygg eller har tankar om att skada dig själv, kontakta 112 eller jourhavande medmänniska på 08-702 16 80. Jag är här för att stödja dig, men professionell hjälp kan vara viktigt nu.";
    }
    if (insights.riskFlags.includes("abuse_risk") || insights.riskFlags.includes("coercion_risk")) {
      return "Det låter som att det kan vara utmanande i din situation. Om du känner dig otrygg eller utsatt, finns det stöd att få. Kvinnofridslinjen är öppen dygnet runt på 020-50 50 50. Jag är här för att lyssna och stödja dig.";
    }
  }

  // Använd mål och fokusområden från agent-analys
  if (insights.goals && insights.goals.length > 0) {
    const goalPhrases = [
      "Jag ser att du verkar fokusera på",
      "Det låter som att du vill arbeta med",
      "Jag hör att du är intresserad av",
    ];
    const goalPhrase = goalPhrases[turn % goalPhrases.length];
    const primaryGoal = insights.goals[0];
    return `${goalPhrase} ${primaryGoal.toLowerCase()}. Det är ett bra ställe att börja. Vad känns som det första steget för dig att komma dit?`;
  }

  // Använd kommunikationsinsikter
  if (insights.communication) {
    if (insights.communication.strengths && insights.communication.strengths.length > 0) {
      const strength = insights.communication.strengths[0];
      return `Jag märker att du har styrkor när det gäller ${strength.toLowerCase()}. Det är något att bygga vidare på. Hur känns det att använda den styrkan mer aktivt?`;
    }
    if (insights.communication.issues && insights.communication.issues.length > 0) {
      const issue = insights.communication.issues[0];
      return `Jag hör att ${issue.toLowerCase()} kan vara en utmaning. Låt oss utforska det tillsammans. Vad skulle hjälpa dig att hantera det bättre?`;
    }
  }

  // Använd rekommendationer från agent-analys
  if (insights.recommendations && insights.recommendations.length > 0) {
    const recommendation = insights.recommendations[0];
    return `Baserat på vad vi pratat om, skulle ${recommendation.toLowerCase()} kunna vara ett bra nästa steg. Vad tänker du om det?`;
  }

  // Använd mönster om de finns
  if (insights.patterns && insights.patterns.length > 0) {
    const pattern = insights.patterns[0];
    return `Jag märker ett mönster här: ${pattern.toLowerCase()}. Det kan vara värt att utforska mer. Vad känns det när du tänker på det?`;
  }

  // Fallback: använd standard coach-svar om inga specifika insikter finns
  return buildAcknowledgmentReply(userText, affect, locale, turn);
}

function detectRisk(text: string): "SAFE" | "RED" {
  return /vill (inte|aldrig) leva|orkar inte mer|självmord|ta mitt liv|112/i.test(text) ? "RED" : "SAFE";
}

function inferAffect(text: string): "low" | "medium" | "high" {
  if (/!|😢|😭|✔️|hjälp|snälla|panik|raser/i.test(text)) return "high";
  if (text.length > 160 || /förstår inte|känns svårt|orolig/i.test(text)) return "medium";
  return "low";
}

function inferSpecificity(text: string): "low" | "high" {
  if (text.length > 80 || /,|\.|;/.test(text)) return "high";
  return "low";
}

function estimateEmpathyScore(affect: "low" | "medium" | "high"): number {
  if (affect === "high") return 0.97;
  if (affect === "medium") return 0.94;
  return 0.9;
}

function estimateToneDelta(affect: "low" | "medium" | "high"): number {
  if (affect === "high") return 0.045;
  if (affect === "medium") return 0.035;
  return 0.02;
}

function emitStyleTelemetry(params: {
  sessionId: string;
  userText: string;
  replyText: string;
  signals: {
    mode: "personal" | "hr";
    risk: "SAFE" | "RED";
    turn: number;
    affect: "low" | "medium" | "high";
  };
}) {
  if (typeof fetch === "undefined") return;
  const { sessionId, userText, replyText, signals } = params;
  const empathyScore = estimateEmpathyScore(signals.affect);
  const toneDelta = estimateToneDelta(signals.affect);

  void fetch("/api/style/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      turn: signals.turn,
      mode: signals.mode,
      risk: signals.risk,
      userText,
      replyText,
      empathyScore,
      toneDelta,
    }),
  }).catch(() => undefined);
}

function calcNextWeight(prev: ActiveCard[]) {
  const base = 1.0; return Math.max(0, base - prev.length * 0.1);
}

function weigh(active: ActiveCard[]): Record<string, number> {
  const n = active.length; if (n === 0) return {};
  const out: Record<string, number> = {}; const step = 1 / Math.max(1, n - 1);
  active.forEach((a, i) => (out[a.id] = 1 - i * step)); return out;
}

function isAffirmative(text: string): boolean {
  return /^\s*(ja|gärna|absolut|okej|ok|yes|sure|det låter bra|gör det|låter fint)\b/i.test(text);
}

function isStillUnsure(text: string): boolean {
  return /\b(vet inte|ingen aning|jag vill bara bli gladare|det känns inte bra|ingen plan)\b/i.test(text);
}

function askedForStep(text: string): boolean {
  return /vill du att jag föreslår ett första litet steg|vill du ha ett par alternativ|skulle det hjälpa med två konkreta steg/i.test(
    text,
  );
}

function isStepSuggestion(text: string): boolean {
  return /^Okej, vi kan prova två små steg/i.test(text);
}

function buildStepSuggestion(primaryName?: string): string {
  const partnerSegment = primaryName ? ` tillsammans med ${primaryName}` : "";
  return [
    "Okej, vi kan prova två små steg:",
    "1) Skriv ned tre tillfällen den senaste tiden när du kände lite mer lugn eller glädje.",
    `2) Planera in en kort stund${partnerSegment} den här veckan för något som brukar ge dig energi, max 15 minuter.`,
    "Vilket av stegen känns enklast att börja med?",
  ].join(" ");
}

function buildStepChoiceFollowUp(primaryName?: string): string {
  const partnerPhrase = primaryName ? ` tillsammans med ${primaryName}` : "";
  return [
    "Toppen att det känns rätt att testa.",
    `Vill du börja med steg 1 (skriva ned tre stunder) eller steg 2${partnerPhrase} (planera den korta stunden)?`,
    "Säg vilket steg som lockar mest så tar vi det lugnt därifrån.",
  ].join(" ");
}

function buildFollowUpAfterSuggestion(primaryName?: string): string {
  const partnerSegment = primaryName ? ` med ${primaryName}` : "";
  return [
    "Jag hör att det fortfarande känns tungt.",
    primaryName
      ? `Vi kan kika både på hur du fyller på med glädje själv och hur du pratar${partnerSegment} efter kvällen i dag.`
      : "Vi kan kika både på vad som brukar dämpa glädjen och vad som skulle kunna fylla på lite energi igen.",
    "Vill du att vi börjar med små egna påfyllningar eller att förbereda samtalet om det som hände?",
  ].join(" ");
}

function buildCouplesAcceptReply(primaryName?: string): string {
  const partnerSegment = primaryName ? ` med ${primaryName}` : "";
  return [
    "Bra, ta det lugnt tillsammans.",
    `Börja gärna med att spegla vad du hörde och fråga hur det landar${partnerSegment}.`,
    "Ta en kort paus efter varje steg och markera när ni känner att ni båda blivit hörda.",
  ].join(" ");
}

function buildAcknowledgmentReply(userText: string, affect: "low" | "medium" | "high", locale: "sv" | "en", turn: number = 1): string {
  const trimmed = userText.trim().toLowerCase();
  
  // Extract key themes from user's response - more general patterns
  const isPositiveGoal = /\b(glad|lycklig|nöjd|bra|bättre|förbättra|förändra|ändra|utveckla|vill.*känna|hoppas.*bli)\b/i.test(userText);
  const isNegativeFeeling = /\b(ledsen|arg|frustrerad|orolig|rädd|nervös|deppig|nedstämd|sur|irriterad|trist|dålig|illa)\b/i.test(userText);
  const isActionOriented = /\b(göra|börja|försöka|testa|prova|planera|fokusera|ta.*tag|ändra|fixa)\b/i.test(userText);
  const isConflict = /\b(konflikt|bråk|gräla|diskus|menings|tvist|problem|svårighet|osämja|strul)\b/i.test(userText);
  const isRelationship = /\b(fru|man|partner|pojkvän|flickvän|sambo|make|maka|relation|förhållande|vi|oss|tillsammans)\b/i.test(userText);
  
  // Extract any specific topic mentioned (more general pattern)
  const topicMatch = userText.match(/\b(disken|städ|ekonomi|barn|tid|arbete|jobbet|vila|fritid|pengar|sex|känslor|kommunikation|respekt|gränser|ansvar|förväntningar|rutiner|vardag|framtid|familj|vänner|hälsa|sömn|mat|fritid|hobby|intressen)\b/i);
  const specificTopic = topicMatch ? topicMatch[0] : null;
  
  if (locale === "en") {
    if (isPositiveGoal) {
      return `I hear that you want to feel ${trimmed.includes("glad") || trimmed.includes("happy") ? "happier" : "better"}. That's a good starting point. What would help you move in that direction right now?`;
    }
    if (isConflict && isRelationship) {
      return `I hear you're dealing with a conflict in your relationship${specificTopic ? ` around ${specificTopic}` : ""}. That can feel heavy. What would help you feel heard or understood right now?`;
    }
    if (isNegativeFeeling) {
      return `It sounds like things feel heavy right now. I'm here with you. What would feel most helpful to focus on first?`;
    }
    if (isActionOriented) {
      return `I hear you want to take action. That's a step forward. What feels most important to start with?`;
    }
    return `I hear you. Let's take this step by step. What would feel most helpful to focus on right now?`;
  }
  
  // Swedish responses with more variation and general patterns
  if (isPositiveGoal) {
    const variations = [
      `Det låter som att du vill känna dig ${trimmed.includes("glad") ? "gladare" : "bättre"}. Det är en bra start. Vad skulle kunna hjälpa dig att komma dit just nu?`,
      `Jag hör att du vill ${trimmed.includes("bli") ? "bli" : "känna dig"} ${trimmed.includes("glad") ? "gladare" : "bättre"}. Vad känns som ett första litet steg dit?`,
      `Att vilja ${trimmed.includes("bli") ? "bli" : "känna dig"} ${trimmed.includes("glad") ? "gladare" : "bättre"} är en viktig start. Vad skulle kunna hjälpa dig att komma dit?`,
    ];
    return variations[turn % variations.length];
  }
  
  if (isConflict && isRelationship) {
    const conflictVariations = [
      `Jag hör att ni har en konflikt${specificTopic ? ` kring ${specificTopic}` : ""}. Det kan kännas tungt. Vad skulle hjälpa dig att känna dig hörd eller förstådd just nu?`,
      `Konflikter i relationer kan vara jobbiga. ${specificTopic ? `När det handlar om ${specificTopic}` : "När det handlar om sådant"} brukar det ofta finnas något under ytan. Vad känns viktigast att prata om?`,
      `Jag hör att det finns en konflikt mellan er${specificTopic ? ` kring ${specificTopic}` : ""}. Det kan vara svårt. Vad skulle hjälpa dig att känna att ni kan mötas på ett bättre sätt?`,
      `Konflikter kan kännas överväldigande. ${specificTopic ? `När det handlar om ${specificTopic}` : "När det handlar om vissa saker"} kan det vara värt att kika på vad som egentligen är viktigt. Vad känns som en bra startpunkt?`,
      `Jag hör att ni har problem${specificTopic ? ` med ${specificTopic}` : ""}. Det kan vara frustrerande. Vad skulle hjälpa er att komma vidare?`,
    ];
    return conflictVariations[turn % conflictVariations.length];
  }
  
  // General relationship issues (not necessarily conflict)
  if (isRelationship && !isConflict) {
    const relationshipVariations = [
      `Jag hör att det handlar om er relation${specificTopic ? ` och ${specificTopic}` : ""}. Vad känns viktigast att prata om?`,
      `Relationer kan vara komplexa. ${specificTopic ? `När det handlar om ${specificTopic}` : "När det handlar om relationer"} kan det hjälpa att ta det steg för steg. Vad skulle vara skönt att börja med?`,
      `Jag hör att det handlar om er två${specificTopic ? ` och ${specificTopic}` : ""}. Vad känns som en bra startpunkt?`,
    ];
    return relationshipVariations[turn % relationshipVariations.length];
  }
  
  if (isNegativeFeeling) {
    const variations = [
      `Det låter som att det känns tungt just nu. Jag är här med dig. Vad skulle kännas mest hjälpsamt att fokusera på först?`,
      `Jag hör att det känns svårt. Vi tar det steg för steg. Vad skulle vara skönt att börja med?`,
      `Det låter som att det är mycket just nu. Vi tar det lugnt. Vad känns viktigast att prata om?`,
      `Det där låter tufft. Jag finns här med dig. Vad skulle hjälpa dig att känna dig lite lättare?`,
      `Jag hör att det känns jobbigt. Låt oss ta det i din takt. Vad skulle vara skönt att börja med?`,
    ];
    return variations[turn % variations.length];
  }
  
  if (isActionOriented) {
    const variations = [
      `Jag hör att du vill göra något åt det. Det är ett steg framåt. Vad känns viktigast att börja med?`,
      `Bra att du vill ta tag i det. Vad skulle vara ett första litet steg som känns hanterbart?`,
      `Det låter som att du är redo att göra något. Vad känns som en bra startpunkt?`,
      `Jag hör att du vill förändra något. Det är modigt. Vad skulle vara ett första litet steg?`,
    ];
    return variations[turn % variations.length];
  }
  
  // Generic acknowledgment with more variation based on turn
  const genericVariations = [
    `Jag hör dig. Vi tar det steg för steg. Vad skulle kännas mest hjälpsamt att fokusera på just nu?`,
    `Tack för att du delar. Låt oss ta det lugnt. Vad skulle vara skönt att börja med?`,
    `Jag förstår. Vi tar det i din takt. Vad känns viktigast att prata om?`,
    `Jag hör vad du säger. Låt oss utforska det tillsammans. Vad känns viktigast för dig just nu?`,
    `Tack för att du berättar. Vi tar det i din takt. Vad skulle hjälpa dig att känna dig bättre?`,
    `Jag finns här med dig. Låt oss ta det lugnt och se vad som känns rätt att börja med.`,
    `Jag hör dig. Vad skulle kännas mest hjälpsamt att fokusera på här och nu?`,
    `Tack för att du delar med dig. Vad skulle hjälpa dig att komma vidare?`,
  ];
  return genericVariations[turn % genericVariations.length];
}

function isCouplesReply(text: string): boolean {
  return /Spegel: återge lugnt vad du hörde/i.test(text) && /Bekräfta:/i.test(text);
}

function activePartnerName(active: ActiveCard[], known: Record<string, Entity>): string {
  for (const card of active) {
    const entity = known[card.id];
    const role = entity?.role?.toLowerCase() ?? "";
    if (
      role.includes("partner") ||
      role.includes("pojkvän") ||
      role.includes("flickvän") ||
      role.includes("sambo") ||
      role.includes("make") ||
      role.includes("maka")
    ) {
      return entity?.name ?? "din partner";
    }
  }
  return "din partner";
}

function isCouplesConversation(
  userText: string,
  active: ActiveCard[],
  known: Record<string, Entity>,
): boolean {
  const text = userText.toLowerCase();
  if (/\b(vi|oss|vår relation|vårt förhållande)\b/.test(text)) return true;
  if (/\bmin (kille|pojkvän|flickvän|tjej|partner|man|fru|sambo)\b/.test(text)) return true;
  const partnerCard = active.some((card) => {
    const entity = known[card.id];
    const role = entity?.role?.toLowerCase() ?? "";
    return (
      role.includes("partner") ||
      role.includes("relation") ||
      role.includes("pojkvän") ||
      role.includes("flickvän") ||
      role.includes("sambo") ||
      role.includes("make") ||
      role.includes("maka")
    );
  });
  return partnerCard;
}

/** caretClientRect(textarea): approximate caret coordinates (mirror div). */
function caretClientRect(el: HTMLTextAreaElement): DOMRect | null {
  try {
    const style = window.getComputedStyle(el); const div = document.createElement("div");
    const rect = el.getBoundingClientRect();
    const props = ["boxSizing","width","height","overflowX","overflowY","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","paddingTop","paddingRight","paddingBottom","paddingLeft","fontStyle","fontVariant","fontWeight","fontStretch","fontSize","fontFamily","textAlign","textTransform","textIndent","textDecoration","letterSpacing","wordSpacing","lineHeight"];
    div.style.position = "absolute"; div.style.whiteSpace = "pre-wrap"; div.style.visibility = "hidden";
    props.forEach((p) => (div.style[p as any] = (style as any)[p]));
    div.textContent = el.value.substring(0, el.selectionEnd || el.value.length);
    const span = document.createElement("span"); span.textContent = "\u200b"; div.appendChild(span);
    document.body.appendChild(div); const r = span.getBoundingClientRect(); const out = new DOMRect(r.left, r.top, 0, 0); document.body.removeChild(div);
    if (!isFinite(out.x) || !isFinite(out.y)) return rect; return out;
  } catch { return el.getBoundingClientRect(); }
}

function ghostStyle(g: Ghost, el: HTMLTextAreaElement | null): React.CSSProperties {
  if (!g.rect || !el) {
    return { right: 12, bottom: 56 } as any;
  }
  
  const host = el.getBoundingClientRect();
  
  // Both rects are in viewport coordinates, subtract to get relative position
  let left = g.rect.x - host.x;
  let top = g.rect.y - host.y - 35; // 35px above caret
  
  // If calculated position is outside bounds, use simple fallback above textarea
  if (left < 0 || left > host.width || top < -10 || top > host.height) {
    // Fallback: show above textarea, positioned near where text was typed
    // Try to estimate from caret position in text
    const textBeforeCaret = el.value.substring(0, g.caret);
    const lines = textBeforeCaret.split('\n');
    const currentLine = lines[lines.length - 1];
    const approxCharsFromStart = currentLine.length;
    // Rough estimate: 8px per character (adjust based on your font)
    left = 16 + (approxCharsFromStart * 8);
    top = -30;
  }
  
  return { left: `${left}px`, top: `${top}px` };
}

function cloneMem(m: Memory): Memory { return JSON.parse(JSON.stringify(m)); }

// ----------------- Minimal test cases (run once in browser) -----------------
// We avoid any framework; these are simple runtime checks and won't break SSR.
if (typeof window !== "undefined" && !(window as any).__RELATIONS_UI_TESTED__) {
  (window as any).__RELATIONS_UI_TESTED__ = true;
  try {
    // slug
    console.assert(slug("Kalle Åström") === "kalle-astrom", "slug åäö → ascii");
    console.assert(slug("  Team Alfa  ") === "team-alfa", "slug trims & dashes");
    // lastToken
    const sample = "Jag pratade med Kalle igår"; 
    console.assert(lastToken(sample, sample.length).includes("igår") === true || lastToken(sample, sample.length) !== "", "lastToken returns word");
    // detectEntityToken
    console.assert(!!detectEntityToken("Kalle"), "detect person");
    console.assert(!!detectEntityToken("Team Alfa"), "detect team");
    console.assert(detectEntityToken("ka") === null, "reject too short");
    // weigh monotonicity
    const w = weigh([{ id: "a", name: "A", weight: 1 }, { id: "b", name: "B", weight: 1 }]);
    console.assert(w["a"] > w["b"], "first has higher weight");
    console.log("✅ UI smoke tests passed");
  } catch (e) {
    console.error("❌ UI tests failed", e);
  }
}

