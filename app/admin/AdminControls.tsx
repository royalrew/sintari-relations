  'use client';

  import { useEffect, useMemo, useState } from 'react';
  import useSWR, { useSWRConfig } from 'swr';
  import { Card } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
import {
  PlayCircle,
  Loader2,
  Rocket,
  GitPullRequestArrow,
  LineChart,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Upload,
  TrendingUp,
  Eraser,
} from 'lucide-react';

  const COMMANDS = [
    { key: 'emotion', label: 'Kör Emotion Tests', icon: <PlayCircle className="h-4 w-4" /> },
    { key: 'memory', label: 'Kör Memory Tests', icon: <PlayCircle className="h-4 w-4" /> },
    { key: 'all', label: 'Kör Alla Tests', icon: <Rocket className="h-4 w-4" /> },
    { key: 'smoke', label: 'Kör Smoke Tests', icon: <PlayCircle className="h-4 w-4" /> },
    { key: 'explain', label: 'Kör Insight Tests', icon: <LineChart className="h-4 w-4" /> },
    { key: 'si-start', label: 'Starta Self-Learning (Shadow 50)', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'si-apply', label: 'Öppna PR av förslag (SI)', icon: <GitPullRequestArrow className="h-4 w-4" /> },
  ] as const;

  type CommandKey = (typeof COMMANDS)[number]['key'];

  const fetcher = (url: string) => fetch(url).then((res) => res.json());

  export default function AdminControls() {
    const { mutate } = useSWRConfig();
    const [adminSecret, setAdminSecret] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<any>(null);
    const [results, setResults] = useState<any>(null);
    const [polling, setPolling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [explainStyle, setExplainStyle] = useState('warm');
    const [explainLevel, setExplainLevel] = useState('standard');
  const [telemetryMessage, setTelemetryMessage] = useState<string | null>(null);

    const { data: liveData } = useSWR(jobId ? null : '/api/live_kpi', fetcher, {
      refreshInterval: 30_000,
    });

    const canarySummary = liveData?.canary;
    const promoteEligibility = canarySummary?.eligibility;

    async function callEndpoint(endpoint: string, payload?: Record<string, unknown>) {
      if (!adminSecret) {
        setError('Ange ADMIN_SECRET först');
        return null;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify(payload ?? {}),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `${endpoint} misslyckades`);
      }
      return res.json();
    }

  async function resetTelemetryBaseline() {
    try {
      setError(null);
      setTelemetryMessage(null);
      const res = await callEndpoint('/api/admin/metrics/telemetry_reset');
      if (res?.ok) {
        setTelemetryMessage('Telemetribaslinje återställd.');
        mutate('/api/admin/metrics');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

    async function startJob(kind: CommandKey, payload?: Record<string, string>, endpointOverride?: string) {
      try {
        setError(null);
        setResults(null);
        setStatus(null);
        setPolling(true);
        setJobId(null);

        let endpoint = endpointOverride;
        if (!endpoint) {
          switch (kind) {
            case 'explain':
              endpoint = '/api/admin/test-explain';
              break;
            case 'si-start':
              endpoint = '/api/admin/si-start';
              break;
            case 'si-apply':
              endpoint = '/api/admin/si-apply';
              break;
            default:
              endpoint = `/api/admin/test-${kind}`;
          }
        }

        const data = await callEndpoint(endpoint!, payload);
        if (data?.jobId) {
          setJobId(data.jobId);
        } else {
          setPolling(false);
          mutate('/api/live_kpi');
        }
      } catch (err: any) {
        setError(err?.message || String(err));
        setPolling(false);
      }
    }

    useEffect(() => {
      if (!jobId || !polling || !adminSecret) return;

      let active = true;

      async function poll() {
        try {
          const res = await fetch(`/api/admin/test-status/${jobId}`, {
            headers: { 'x-admin-secret': adminSecret },
          });
          if (!active) return;
          if (!res.ok) {
            throw new Error(await res.text());
          }
          const data = await res.json();
          setStatus(data);

          if (data.results) {
            setResults(data.results);
            setPolling(false);
            mutate('/api/live_kpi');
          } else if (data.status === 'completed' || data.status === 'failed') {
            try {
              const res2 = await fetch(`/api/admin/test-results/${jobId}`, {
                headers: { 'x-admin-secret': adminSecret },
              });
              if (res2.ok) {
                const data2 = await res2.json();
                setResults(data2);
              }
            } catch (e) {
              console.warn('Failed to fetch results', e);
            }
            setPolling(false);
            mutate('/api/live_kpi');
          } else {
            setTimeout(poll, 1500);
          }
        } catch (err: any) {
          if (!active) return;
          setError(err?.message || String(err));
          setPolling(false);
        }
      }

      poll();
      return () => {
        active = false;
      };
    }, [jobId, polling, adminSecret, mutate]);

    const summary = useMemo(() => {
      if (!results?.summary) return null;
      const { summary, metrics } = results;
      return {
        ...summary,
        passRate: summary.total ? Math.round((summary.passed / summary.total) * 100) : 0,
        metrics,
      };
    }, [results]);

    const busy = polling;
    const cancelJob = () => {
      setPolling(false);
      setStatus((prev: any) => (prev ? { ...prev, status: 'cancelled' } : prev));
    };

    return (
      <section className="space-y-6">
        <Card className="p-5 space-y-4">
          <header className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Admin · Kontroller</h2>
              <p className="text-xs text-muted-foreground">Kör tester, hantera canary och följ resultat i realtid.</p>
            </div>
            <Badge variant={busy ? 'secondary' : 'default'} className="gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {busy ? 'Kör…' : 'Redo'}
            </Badge>
          </header>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 space-y-3">
              <label className="text-xs font-semibold uppercase text-muted-foreground">ADMIN_SECRET</label>
              <Input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="ADMIN_SECRET"
              />
              <p className="text-xs text-muted-foreground">Obligatorisk för att köra tester och canary-kommandon.</p>
            </div>

            <CanaryStatus promoteEligibility={promoteEligibility} />
          </div>

          <Divider />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMMANDS.map((cmd) => (
              <Button
                key={cmd.key}
                variant="outline"
                className="justify-start gap-2 rounded-2xl"
                onClick={() =>
                  startJob(
                    cmd.key,
                    cmd.key === 'explain' ? { style: explainStyle, level: explainLevel } : undefined,
                  )
                }
                disabled={!adminSecret || busy}
              >
                {cmd.icon}
                {cmd.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Explain Style</label>
              <select
                className="mt-1 w-40 rounded-xl border px-3 py-2 text-sm"
                value={explainStyle}
                onChange={(e) => setExplainStyle(e.target.value)}
              >
                <option value="warm">Warm</option>
                <option value="neutral">Neutral</option>
                <option value="coach">Coach</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Explain Level</label>
              <select
                className="mt-1 w-40 rounded-xl border px-3 py-2 text-sm"
                value={explainLevel}
                onChange={(e) => setExplainLevel(e.target.value)}
              >
                <option value="brief">Brief</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </div>
          </div>

          <Divider />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Canary & LogRotate</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => startJob('si-start', undefined, '/api/admin/canary/enable')}
                disabled={!adminSecret || busy}
                className="rounded-xl"
              >
                <ShieldCheck className="mr-2 h-4 w-4" /> Enable 5%
              </Button>

              <Button
                variant="outline"
                onClick={() => startJob('si-start', undefined, '/api/admin/canary/bump')}
                disabled={!adminSecret || busy}
                className="rounded-xl"
              >
                <TrendingUp className="mr-2 h-4 w-4" /> Increase +5%
              </Button>

              <Button
                variant="outline"
                onClick={() => startJob('si-start', undefined, '/api/admin/canary/disable')}
                disabled={!adminSecret || busy}
                className="rounded-xl"
              >
                <ShieldAlert className="mr-2 h-4 w-4" /> Disable
              </Button>

              <Button
                variant="outline"
                onClick={() => startJob('si-apply', undefined, '/api/admin/logrotate')}
                disabled={!adminSecret || busy}
                className="rounded-xl"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Logrotate
              </Button>

              <Button
                variant="outline"
                onClick={resetTelemetryBaseline}
                disabled={!adminSecret || busy}
                className="rounded-xl"
              >
                <Eraser className="mr-2 h-4 w-4" /> Reset Telemetry Baseline
              </Button>

              <Button
                variant="default"
                onClick={() => startJob('si-apply', undefined, '/api/admin/promote')}
                disabled={!adminSecret || busy || !promoteEligibility?.ok}
                className="rounded-xl"
              >
                <Upload className="mr-2 h-4 w-4" /> Promote Canary → Stable
              </Button>
            </div>
            {promoteEligibility && (
              <p className="text-xs text-muted-foreground">
                Promote status: {promoteEligibility.ok ? 'Klar' : `Spärrad (${promoteEligibility.reason})`}
              </p>
            )}
          </div>

          {error && (
            <ErrorBox message={error} />
          )}

          {telemetryMessage && !error && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {telemetryMessage}
            </div>
          )}

          {status && (
            <Card className="border px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Jobbstatus</div>
                  <div className="text-xs text-muted-foreground">ID: {jobId}</div>
                </div>
                <Badge variant={status.status === 'completed' ? 'default' : status.status === 'failed' ? 'destructive' : 'secondary'}>
                  {status.status?.toUpperCase?.() ?? 'OK'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Start: {status.startedAt ?? '-'}</div>
                <div>Slut: {status.finishedAt ?? '-'}</div>
                <div>Progress: {status.progress ?? 0}%</div>
                <div>Error: {status.error ?? '-'}</div>
              </div>
              <ProgressBar value={Number(status.progress ?? 0)} />
              {busy && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelJob}
                    className="text-xs text-muted-foreground"
                  >
                    Avbryt
                  </Button>
                </div>
              )}
            </Card>
          )}

          {summary && (
            <Card className="border px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Resultat</div>
                <Badge variant={summary.failed > 0 ? "destructive" : "default"}>
                  {summary.passed}/{summary.total} • {summary.passRate}%
                </Badge>
              </div>
              <div className="grid grid-cols-2 text-xs gap-1">
                <div>Duration: {summary.duration_ms ?? 0} ms</div>
                <div>Failed: {summary.failed}</div>
              </div>
              {summary.metrics && Object.keys(summary.metrics).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {Object.entries(summary.metrics).map(([k, v]) => (
                    <div key={k}>
                      {k}: {typeof v === "number" ? v.toFixed(3) : String(v)}
                    </div>
                  ))}
                </div>
              )}
              {results?.tests?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-4">Test</th>
                        <th className="py-1 pr-4">Status</th>
                        <th className="py-1 pr-4">Tid (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.tests.map((test: any) => (
                        <tr key={test.name} className="border-t">
                          <td className="py-1 pr-4 font-mono text-[11px]">{test.name}</td>
                          <td className="py-1 pr-4">{test.status}</td>
                          <td className="py-1 pr-4">{test.duration_ms ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {results?.raw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Rålogg</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">{results.raw}</pre>
                </details>
              )}
            </Card>
          )}
        </Card>
      </section>
    );
  }

  function CanaryStatus({
    promoteEligibility,
  }: {
    promoteEligibility?: { ok?: boolean; reason?: string } | null;
  }) {
    const ok = !!promoteEligibility?.ok;
    return (
      <Card className={`rounded-2xl border p-3 ${ok ? 'border-emerald-200' : 'border-amber-200'}`}>
        <div className="flex items-start gap-2">
          {ok ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />
          )}
          <div>
            <div className="text-xs font-semibold">Promote Canary → Stable</div>
            <div className="text-xs text-muted-foreground">
              {promoteEligibility
                ? ok
                  ? 'Klar för promote'
                  : `Spärrad (${promoteEligibility.reason})`
                : 'Ingen status ännu'}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  function Divider() {
    return <div className="h-px w-full bg-gray-200" />;
  }

  function ProgressBar({ value }: { value: number }) {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div className="h-2 w-full rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full bg-purple-600 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  }

  function ErrorBox({ message }: { message: string }) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <strong>Fel:</strong> {message}
      </div>
    );
  }
