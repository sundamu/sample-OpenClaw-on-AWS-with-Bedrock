import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { Bot, MessageSquare, Star, AlertTriangle, Shield, RefreshCw, Eye, Radio, Clock, Zap, ListChecks, Activity, CheckCircle, XCircle, Users } from 'lucide-react';
import { Card, StatCard, Badge, Button, PageHeader, Table, StatusDot, Tabs } from '../../components/ui';
import { useSessions, useAgents, useMonitorHealth, useAlertRules, useRuntimeEvents, useMonitorActionItems, useMonitorSystemStatus, useMonitorAgentActivity } from '../../hooks/useApi';
import { CHANNEL_LABELS } from '../../types';
import type { ChannelType } from '../../types';
import SessionDetail from './SessionDetail';

const realtimeOpts: ApexOptions = {
  chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
  colors: ['#6366f1', '#22c55e', '#f59e0b'],
  stroke: { curve: 'smooth', width: 2 },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
  grid: { borderColor: '#2e3039', strokeDashArray: 4 },
  xaxis: { categories: ['5m', '4m', '3m', '2m', '1m', 'now'], labels: { style: { colors: '#64748b', fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
  yaxis: { labels: { style: { colors: '#64748b', fontSize: '11px' } } },
  tooltip: { theme: 'dark' },
  legend: { position: 'top', horizontalAlign: 'right', labels: { colors: '#94a3b8' } },
  dataLabels: { enabled: false },
};

export default function Monitor() {
  const { data: sessions = [], refetch: refetchSessions } = useSessions();
  const { data: AGENTS = [] } = useAgents();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: healthData, refetch: refetchHealth } = useMonitorHealth();
  const { data: alertRules = [], refetch: refetchAlerts } = useAlertRules();
  const { data: runtimeData } = useRuntimeEvents(1440); // 24 hours
  const { data: actionItemsData } = useMonitorActionItems();
  const { data: systemStatusData } = useMonitorSystemStatus();
  const { data: agentActivityData } = useMonitorAgentActivity();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('sessions');

  useEffect(() => {
    const sid = searchParams.get('session');
    if (sid) setSelectedSession(sid);
  }, [searchParams]);

  const health = healthData?.agents || [];
  const sys = healthData?.system || {};
  const actionItems = actionItemsData?.items || [];
  const agentActivity = agentActivityData?.agents || [];
  const activeAgents = agentActivity.filter((a: any) => a.status === 'active').length || AGENTS.filter(a => a.status === 'active').length;
  const totalTurns = sessions.reduce((s, sess) => s + sess.turns, 0);
  const avgQuality = AGENTS.filter(a => a.qualityScore).length > 0
    ? AGENTS.filter(a => a.qualityScore).reduce((s, a) => s + (a.qualityScore || 0), 0) / AGENTS.filter(a => a.qualityScore).length
    : 0;
  const alertCount = alertRules.filter(a => a.status === 'warning').length;

  const buildChartSeries = () => {
    const events = (runtimeData as any)?.events || [];
    if (events.length === 0) return null;
    const now = Date.now();
    // 12 buckets of 2 hours = 24 hours
    const buckets = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(i => {
      const start = now - (i + 1) * 2 * 3600000;
      const end   = now - i * 2 * 3600000;
      const inBucket = events.filter((e: any) => {
        const t = new Date(e.timestamp).getTime();
        return t >= start && t < end;
      });
      return {
        invocations: inBucket.filter((e: any) => e.type === 'invocation').length,
        toolCalls:   inBucket.filter((e: any) => e.type === 'usage').length,
        planA:       inBucket.filter((e: any) => e.type === 'plan_a').length,
      };
    });
    const hasAny = buckets.some(b => b.invocations + b.toolCalls + b.planA > 0);
    return hasAny ? buckets : null;
  };
  const chartBuckets = buildChartSeries();
  const chartXLabels = ['22h', '20h', '18h', '16h', '14h', '12h', '10h', '8h', '6h', '4h', '2h', 'now'];

  const elapsed = (startedAt: string) => {
    const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
    return mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  if (selectedSession) {
    const session = sessions.find(s => s.id === selectedSession);
    if (session) return <SessionDetail session={session} onBack={() => setSelectedSession(null)} />;
  }

  return (
    <div>
      <PageHeader title="Monitor Center" description="Real-time session monitoring, agent health, action items, and alert management" />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <StatCard title="Live Sessions" value={sessions.length} icon={<Radio size={22} />} color="success" />
        <StatCard title="Active Agents" value={activeAgents} icon={<Bot size={22} />} color="primary" />
        <StatCard title="Total Turns" value={totalTurns} icon={<MessageSquare size={22} />} color="info" />
        <StatCard title="Avg Quality" value={avgQuality > 0 ? avgQuality.toFixed(1) : '—'} icon={<Star size={22} />} color="warning" />
        <StatCard title="Action Items" value={actionItems.length} icon={<ListChecks size={22} />} color={actionItems.length > 0 ? 'danger' : 'success'} />
        <StatCard title="Alerts" value={alertCount} icon={<AlertTriangle size={22} />} color={alertCount > 0 ? 'danger' : 'success'} />
      </div>

      {/* System Health Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(() => {
          const sysStatus = systemStatusData || {};
          const services = [
            { label: 'Admin Console', status: (sysStatus as any)?.['admin-console'] || 'healthy', detail: 'Port 8099' },
            { label: 'Tenant Router', status: (sysStatus as any)?.['tenant-router'] || 'healthy', detail: 'Agent orchestration' },
            { label: 'Bedrock API', status: (sysStatus as any)?.bedrock || 'connected', detail: `${sys.bedrockLatencyMs || '—'}ms latency` },
          ];
          return services.map(svc => (
            <div key={svc.label} className="rounded-lg border border-dark-border bg-dark-card px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${svc.status === 'healthy' || svc.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                <div>
                  <p className="text-sm font-medium text-text-primary">{svc.label}</p>
                  <p className="text-xs text-text-muted">{svc.detail}</p>
                </div>
              </div>
              <Badge color={svc.status === 'healthy' || svc.status === 'connected' ? 'success' : 'warning'}>{svc.status}</Badge>
            </div>
          ));
        })()}
      </div>

      {/* Real-time Chart */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Agent Activity (Last 24 Hours)</h3>
            <p className="text-sm text-text-secondary">
              {chartBuckets ? 'Invocations from DynamoDB audit events' : 'No activity in the last 24 hours'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { refetchSessions(); refetchHealth(); refetchAlerts(); }}><RefreshCw size={14} /> Refresh</Button>
        </div>
        {chartBuckets ? (
          <Chart
            options={{ ...realtimeOpts, xaxis: { ...realtimeOpts.xaxis, categories: chartXLabels } }}
            series={[
              { name: 'Invocations', data: chartBuckets.map(b => b.invocations) },
              { name: 'Usage Events', data: chartBuckets.map(b => b.toolCalls) },
              { name: 'Plan A Checks', data: chartBuckets.map(b => b.planA) },
            ]} type="area" height={220} />
        ) : (
          <div className="flex flex-col items-center justify-center h-[220px] text-text-muted">
            <Radio size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No runtime events to display</p>
            <p className="text-xs mt-1">Activity appears here when employees send messages via IM channels or Portal</p>
          </div>
        )}
      </Card>

      {/* Tabbed Content */}
      <Card>
        <Tabs
          tabs={[
            { id: 'sessions', label: 'Live Sessions', count: sessions.length },
            { id: 'action-items', label: 'Action Items', count: actionItems.length || undefined },
            { id: 'agent-activity', label: 'Agent Activity', count: agentActivity.length || undefined },
            { id: 'health', label: 'Agent Health', count: health.length },
            { id: 'alerts', label: 'Alert Rules', count: alertCount || undefined },
            { id: 'runtime', label: 'Runtime Events' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <div className="mt-4">
          {activeTab === 'sessions' && (
            <div>
              <Table
                columns={[
                  { key: 'employee', label: 'Employee', render: (s: typeof sessions[0]) => <button onClick={(e) => { e.stopPropagation(); navigate('/org/employees'); }} className="font-medium text-primary-light hover:underline">{s.employeeName}</button> },
                  { key: 'arrow', label: '', render: () => <span className="text-text-muted">↔</span>, width: '40px' },
                  { key: 'agent', label: 'Agent', render: (s: typeof sessions[0]) => <button onClick={(e) => { e.stopPropagation(); navigate(`/agents/${s.agentId}`); }} className="font-medium text-primary-light hover:underline">{s.agentName}</button> },
                  { key: 'channel', label: 'Channel', render: (s: typeof sessions[0]) => <Badge color="info">{CHANNEL_LABELS[s.channel as ChannelType]}</Badge> },
                  { key: 'duration', label: 'Duration', render: (s: typeof sessions[0]) => <span className="text-text-muted">{elapsed(s.startedAt)}</span> },
                  { key: 'turns', label: 'Turns', render: (s: typeof sessions[0]) => s.turns },
                  { key: 'lastMsg', label: 'Latest Message', render: (s: typeof sessions[0]) => <span className="text-xs text-text-muted truncate block max-w-[200px]">{s.lastMessage}</span> },
                  { key: 'status', label: 'Status', render: (s: typeof sessions[0]) => <StatusDot status={s.status} /> },
                  { key: 'actions', label: '', render: (s: typeof sessions[0]) => (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSession(s.id)}><Eye size={14} /> View</Button>
                  )},
                ]}
                data={sessions}
              />
            </div>
          )}

          {/* Action Items Tab */}
          {activeTab === 'action-items' && (
            <div>
              <p className="text-sm text-text-secondary mb-4">Aggregated items requiring admin attention: pending reviews, permission denials, budget alerts, and unbound employees.</p>
              {actionItems.length === 0 ? (
                <div className="text-center py-12 text-text-muted">
                  <CheckCircle size={32} className="mx-auto mb-3 text-green-400" />
                  <p className="text-sm">All clear — no action items</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((item: any, i: number) => {
                    const severityColors: Record<string, { bg: string; border: string; text: string }> = {
                      high: { bg: 'bg-red-500/5', border: 'border-red-500/20', text: 'text-red-400' },
                      medium: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-400' },
                      low: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400' },
                    };
                    const sev = severityColors[item.severity] || severityColors.low;
                    return (
                      <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-3 ${sev.bg} border ${sev.border}`}>
                        {item.severity === 'high' ? <XCircle size={16} className={sev.text} /> :
                         item.severity === 'medium' ? <AlertTriangle size={16} className={sev.text} /> :
                         <Zap size={16} className={sev.text} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-text-primary">{item.title || item.type}</span>
                            <Badge color={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'info'}>{item.severity}</Badge>
                            {item.category && <Badge>{item.category}</Badge>}
                          </div>
                          <p className="text-sm text-text-secondary">{item.description || item.detail}</p>
                          {item.count && <p className="text-xs text-text-muted mt-1">Count: {item.count}</p>}
                        </div>
                        {item.actionUrl && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(item.actionUrl)}>View</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Agent Activity Tab */}
          {activeTab === 'agent-activity' && (
            <div>
              <p className="text-sm text-text-secondary mb-4">Real-time agent status: active, idle, and offline agents with last invocation timestamps.</p>
              {/* Status summary */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{agentActivity.filter((a: any) => a.status === 'active').length}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Active</p>
                </div>
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-400">{agentActivity.filter((a: any) => a.status === 'idle').length}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Idle</p>
                </div>
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-text-muted">{agentActivity.filter((a: any) => a.status === 'offline').length}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Offline</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {agentActivity.map((agent: any) => (
                  <div key={agent.agentId || agent.id} className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-dark-hover transition-colors cursor-pointer"
                    onClick={() => agent.agentId && navigate(`/agents/${agent.agentId}`)}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      agent.status === 'active' ? 'bg-green-500 animate-pulse' :
                      agent.status === 'idle' ? 'bg-amber-500' : 'bg-gray-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{agent.agentName || agent.name}</p>
                      <p className="text-xs text-text-muted">{agent.employeeName} · {agent.positionName}</p>
                    </div>
                    <Badge color={agent.status === 'active' ? 'success' : agent.status === 'idle' ? 'warning' : 'default'}>{agent.status}</Badge>
                    {agent.lastInvocationAt && (
                      <span className="text-xs text-text-muted shrink-0">
                        Last: {new Date(agent.lastInvocationAt).toLocaleTimeString()}
                      </span>
                    )}
                    {agent.requestsToday != null && (
                      <span className="text-xs text-text-muted shrink-0">{agent.requestsToday} req</span>
                    )}
                  </div>
                ))}
                {agentActivity.length === 0 && (
                  <div className="text-center py-8 text-text-muted">
                    <Users size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No agent activity data</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'health' && (
            <div>
              {/* Health Summary */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{sys.activeAgents || activeAgents}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Active</p>
                </div>
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-400">{sys.totalRequestsToday || 0}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Requests Today</p>
                </div>
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-cyan-400">{sys.overallToolSuccess || 96}%</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Tool Success</p>
                </div>
                <div className="rounded-lg bg-dark-bg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-400">${sys.totalCostToday || '0.00'}</p>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Cost Today</p>
                </div>
              </div>

              {/* Agent Health Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-border text-left">
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Agent</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Quality</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Requests</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Avg Response</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Tool Success</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">SOUL</th>
                      <th className="pb-3 text-xs font-medium text-text-muted uppercase tracking-wider">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.map(a => (
                      <tr key={a.agentId} onClick={() => navigate(`/agents/${a.agentId}`)} className="border-b border-dark-border/50 hover:bg-dark-hover cursor-pointer transition-colors">
                        <td className="py-3">
                          <div>
                            <p className="font-medium text-text-primary">{a.agentName}</p>
                            <p className="text-xs text-text-muted">{a.employeeName} · {a.positionName}</p>
                          </div>
                        </td>
                        <td className="py-3"><StatusDot status={a.status} /></td>
                        <td className="py-3">
                          {a.qualityScore ? (
                            <span className={`text-sm font-medium ${a.qualityScore >= 4.5 ? 'text-green-400' : a.qualityScore >= 4.0 ? 'text-blue-400' : 'text-amber-400'}`}>
                              {a.qualityScore.toFixed(1)}
                            </span>
                          ) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="py-3"><span className="text-text-secondary">{a.requestsToday}</span></td>
                        <td className="py-3">
                          <span className={`text-sm ${a.avgResponseSec <= 3 ? 'text-green-400' : a.avgResponseSec <= 4 ? 'text-text-secondary' : 'text-amber-400'}`}>
                            {a.avgResponseSec}s
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 rounded-full bg-dark-bg overflow-hidden">
                              <div className={`h-full rounded-full ${a.toolSuccessRate >= 95 ? 'bg-green-500' : a.toolSuccessRate >= 85 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                style={{ width: `${a.toolSuccessRate}%` }} />
                            </div>
                            <span className="text-xs text-text-muted">{a.toolSuccessRate}%</span>
                          </div>
                        </td>
                        <td className="py-3"><span className="text-xs font-mono text-text-muted">{a.soulVersion}</span></td>
                        <td className="py-3"><span className="text-xs text-text-secondary">${(a.costToday || 0).toFixed(2)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div>
              <p className="text-sm text-text-secondary mb-4">Alert rules are evaluated continuously. Triggered alerts generate audit entries and notifications.</p>
              <div className="space-y-2">
                {alertRules.map((a) => (
                  <div key={a.id} className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                    a.status === 'warning' ? 'bg-amber-500/5 border border-amber-500/20' :
                    a.status === 'info' ? 'bg-blue-500/5 border border-blue-500/20' :
                    'bg-dark-bg/50 border border-transparent'
                  }`}>
                    <div className="flex items-center gap-3">
                      {a.status === 'warning' ? <AlertTriangle size={16} className="text-amber-400" /> :
                       a.status === 'info' ? <Zap size={16} className="text-blue-400" /> :
                       <Shield size={16} className="text-green-400" />}
                      <div>
                        <p className="text-sm font-medium">{a.type}</p>
                        <p className="text-xs text-text-muted">{a.condition} → {a.action}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">{a.detail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-text-muted">{new Date(a.lastChecked).toLocaleTimeString()}</span>
                      <Badge color={a.status === 'ok' ? 'success' : a.status === 'warning' ? 'warning' : 'info'} dot>
                        {a.status === 'ok' ? 'Clear' : a.status === 'warning' ? 'Triggered' : 'Info'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'runtime' && (
            <div>
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-4">
                <div className="rounded-lg bg-dark-bg border border-dark-border p-3 text-center">
                  <div className="text-lg font-bold text-primary">{runtimeData?.summary?.invocations || 0}</div>
                  <div className="text-[10px] text-text-muted">Invocations</div>
                </div>
                <div className="rounded-lg bg-dark-bg border border-dark-border p-3 text-center">
                  <div className="text-lg font-bold text-amber-400">{runtimeData?.summary?.coldStarts || 0}</div>
                  <div className="text-[10px] text-text-muted">Cold Starts</div>
                </div>
                <div className="rounded-lg bg-dark-bg border border-dark-border p-3 text-center">
                  <div className="text-lg font-bold text-red-400">{runtimeData?.summary?.releases || 0}</div>
                  <div className="text-[10px] text-text-muted">VM Releases</div>
                </div>
                <div className="rounded-lg bg-dark-bg border border-dark-border p-3 text-center">
                  <div className="text-lg font-bold text-green-400">{runtimeData?.summary?.activeTenants || 0}</div>
                  <div className="text-[10px] text-text-muted">Active Tenants</div>
                </div>
                <div className="rounded-lg bg-dark-bg border border-dark-border p-3 text-center">
                  <div className="text-lg font-bold text-text-muted">{runtimeData?.summary?.timeRangeMinutes || 60}m</div>
                  <div className="text-[10px] text-text-muted">Time Range</div>
                </div>
              </div>

              {/* Event timeline */}
              <p className="text-sm text-text-secondary mb-3">Real-time AgentCore lifecycle events from DynamoDB audit trail</p>
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {(runtimeData?.events || []).map((e, i) => {
                  const typeConfig: Record<string, { color: string; icon: string }> = {
                    invocation: { color: 'text-primary', icon: '→' },
                    response: { color: 'text-green-400', icon: '←' },
                    cold_start: { color: 'text-amber-400', icon: '!' },
                    release: { color: 'text-red-400', icon: 'x' },
                    ready: { color: 'text-green-400', icon: '+' },
                    sync: { color: 'text-cyan-400', icon: '~' },
                    plan_a: { color: 'text-orange-400', icon: '#' },
                    usage: { color: 'text-blue-400', icon: '$' },
                    mapping: { color: 'text-purple-400', icon: '@' },
                  };
                  const cfg = typeConfig[e.type] || { color: 'text-text-muted', icon: '.' };
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-dark-bg/50 px-3 py-2 text-xs hover:bg-dark-bg transition-colors">
                      <span className={`${cfg.color} font-mono w-4 shrink-0 text-center`}>{cfg.icon}</span>
                      <span className="text-text-muted shrink-0 w-20 font-mono">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <Badge color={e.type === 'invocation' ? 'primary' : e.type === 'response' ? 'success' : e.type === 'cold_start' ? 'warning' : e.type === 'release' ? 'danger' : 'default'}>
                        {e.type}
                      </Badge>
                      <span className="text-text-secondary flex-1">{e.message}</span>
                      {e.tenant && <code className="text-[10px] text-text-muted bg-dark-card px-1 rounded truncate max-w-[200px]">{e.tenant}</code>}
                    </div>
                  );
                })}
                {(!runtimeData?.events || runtimeData.events.length === 0) && (
                  <div className="text-center py-8 text-text-muted">
                    <Radio size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No runtime events in the last {runtimeData?.summary?.timeRangeMinutes || 60} minutes</p>
                    <p className="text-xs mt-1">Events appear when agents are invoked via IM channels or Portal</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
