import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, User, Bot, Eye, Terminal, Loader, FileText, ChevronDown, ChevronRight, Save, RefreshCw, Trash2, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card, Badge, Button, PageHeader, Select, Tabs } from '../components/ui';
import { usePlaygroundProfiles, useAgents, useEmployees, usePositions, useWorkspaceFile, useSaveWorkspaceFile, usePlaygroundPipeline, usePlaygroundEvents } from '../hooks/useApi';
import { api } from '../api/client';

const STORAGE_KEY = 'openclaw_playground_chat';

function loadMessages(tenantId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${tenantId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveMessages(tenantId: string, messages: ChatMessage[]) {
  localStorage.setItem(`${STORAGE_KEY}_${tenantId}`, JSON.stringify(messages));
}

interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'admin'; content: string; timestamp: string; source?: string; }

// ── File viewer card ────────────────────────────────────────────────────────
interface FileCardProps {
  label: string;
  s3Key: string;
  editable?: boolean;
  badge?: string;
  badgeColor?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

function FileCard({ label, s3Key, editable = false, badge, badgeColor = 'default' }: FileCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const { data, isLoading, refetch } = useWorkspaceFile(open ? s3Key : '');
  const saveFile = useSaveWorkspaceFile();

  useEffect(() => {
    if (data?.content && !editing) setDraft(data.content);
  }, [data?.content]);

  const handleSave = async () => {
    await saveFile.mutateAsync({ key: s3Key, content: draft });
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="rounded-xl border border-dark-border/60 overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 bg-dark-bg hover:bg-dark-hover transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2.5">
          <FileText size={14} className="text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {badge && <Badge color={badgeColor}>{badge}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {data && <span className="text-[10px] text-text-muted">{(data.size / 1024).toFixed(1)} KB</span>}
          {open ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-dark-border/40">
          {isLoading ? (
            <div className="flex items-center justify-center py-6"><Loader size={16} className="animate-spin text-primary" /></div>
          ) : data ? (
            <div>
              {editable && (
                <div className="flex items-center justify-between px-4 py-2 bg-dark-card/50 border-b border-dark-border/30">
                  <span className="text-[10px] text-text-muted">S3: {s3Key}</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => refetch()} className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-dark-hover transition-colors"><RefreshCw size={12} /></button>
                    {editing ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(data.content); }}>Cancel</Button>
                        <Button variant="primary" size="sm" onClick={handleSave} disabled={saveFile.isPending}>
                          <Save size={12} /> {saveFile.isPending ? 'Saving...' : saved ? 'Saved' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="default" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    )}
                  </div>
                </div>
              )}
              {!editable && (
                <div className="flex items-center justify-between px-4 py-1.5 bg-dark-card/50 border-b border-dark-border/30">
                  <span className="text-[10px] text-text-muted">{s3Key}</span>
                  <button onClick={() => refetch()} className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-dark-hover transition-colors"><RefreshCw size={12} /></button>
                </div>
              )}
              {editing ? (
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={14}
                  className="w-full bg-dark-bg px-4 py-3 text-xs text-text-primary font-mono focus:outline-none resize-none" />
              ) : (
                <pre className="px-4 py-3 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto bg-dark-bg">
                  {data.content || '(empty)'}
                </pre>
              )}
            </div>
          ) : (
            <p className="px-4 py-4 text-xs text-text-muted">(File not found or empty)</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Playground ─────────────────────────────────────────────────────────
export default function Playground() {
  const [searchParams] = useSearchParams();
  const agentParam = searchParams.get('agent');
  const { data: profiles } = usePlaygroundProfiles();
  const { data: employees = [] } = useEmployees();
  const { data: positions = [] } = usePositions();

  const tenantOptions = useMemo(() => {
    const opts = employees
      .filter(e => e.agentId)
      .map(e => ({ label: `${e.name} — ${e.positionName}`, value: `port__${e.id}` }));
    if (opts.length === 0) {
      return [
        { label: 'Carol Zhang — Finance Analyst', value: 'port__emp-carol' },
        { label: 'Wang Wu — Software Engineer', value: 'port__emp-w5' },
      ];
    }
    return opts;
  }, [employees]);

  const [tenantId, setTenantId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [lastPlanE, setLastPlanE] = useState('No messages yet');
  const [sending, setSending] = useState(false);
  const mode = 'live' as const;  // Only Live mode — Admin tests real AgentCore behavior
  const [activeTab, setActiveTab] = useState('pipeline');
  const [tenantReady, setTenantReady] = useState(false);

  const empId = tenantId.replace('port__', '');
  const emp = employees.find(e => e.id === empId);
  const posId = emp?.positionId || '';

  // Pipeline config from new API
  const { data: pipelineData, refetch: refetchPipeline } = usePlaygroundPipeline(empId);
  // Events from new API
  const { data: eventsData } = usePlaygroundEvents(tenantId, 300);

  useEffect(() => {
    if (tenantOptions.length === 0) return;
    if (tenantId) return;
    if (agentParam) {
      const matched = tenantOptions.find(o => o.value.includes(agentParam) ||
        employees.find(e => e.agentId === agentParam && o.value === `port__${e.id}`));
      if (matched) { setTenantId(matched.value); return; }
    }
    setTenantId(tenantOptions[0].value);
  }, [tenantOptions, tenantId, agentParam]);

  const profile = profiles?.[tenantId] || { role: 'loading', tools: [], planA: '', planE: '' };

  useEffect(() => { if (tenantId && tenantReady) saveMessages(tenantId, messages); }, [messages]);

  useEffect(() => {
    if (!tenantId) return;
    setTenantReady(false);
    const saved = loadMessages(tenantId);
    const label = tenantOptions.find(o => o.value === tenantId)?.label || tenantId;
    if (saved.length > 0) {
      setMessages(saved);
    } else {
      const p = profiles?.[tenantId];
      setMessages([{
        role: 'system',
        content: `Testing as ${label} — ${p?.tools?.length || 0} tools enabled`,
        timestamp: '',
      }]);
    }
    setLastPlanE('No messages yet');
    setTimeout(() => setTenantReady(true), 100);
  }, [tenantId, profiles]);

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;
    const now = new Date().toLocaleTimeString();
    const msg = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: now }]);
    setInputValue('');
    setSending(true);

    try {
      const data = await api.post<{ response: string; plan_e: string; source?: string }>(
        '/playground/send', { tenant_id: tenantId, message: msg, mode }
      );
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toLocaleTimeString(),
        source: data.source,
      }]);
      setLastPlanE(data.plan_e || 'PASS');
    } catch (err: any) {
      const errMsg = err?.message || err?.response?.data?.error || '';
      if (errMsg.includes('502') || errMsg.includes('timeout') || errMsg.includes('Failed to fetch')) {
        // AgentCore cold start or long-running task — show status and retry with longer wait
        setMessages(prev => [...prev, {
          role: 'system',
          content: 'Agent is starting up or processing a complex task. Waiting...',
          timestamp: new Date().toLocaleTimeString(),
        }]);
        try {
          await new Promise(r => setTimeout(r, 15000));
          const retry = await api.post<{ response: string; plan_e: string; source?: string }>(
            '/playground/send', { tenant_id: tenantId, message: msg, mode }
          );
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: retry.response,
            timestamp: new Date().toLocaleTimeString(),
            source: retry.source,
          }]);
          setLastPlanE(retry.plan_e || 'PASS');
        } catch {
          setMessages(prev => [...prev, {
            role: 'system',
            content: 'Agent is still starting. This happens on first use or after config changes. Please wait 30 seconds and try again.',
            timestamp: new Date().toLocaleTimeString(),
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Error: ${errMsg || 'Request failed. Please try again.'}`,
          timestamp: new Date().toLocaleTimeString(),
        }]);
      }
    } finally {
      setSending(false);
    }
  };

  // Mode removed — always Live for real AgentCore testing

  return (
    <div>
      <PageHeader title="Agent Playground" description="Test employee agents with real AgentCore invocation — verify SOUL rules, tool permissions, and security constraints"
        actions={
          <Button variant="default" onClick={async () => {
            try {
              const r = await api.post<{ refreshed: number }>('/admin/refresh-all', {});
              alert(`All ${(r as any).refreshed || 0} agent sessions terminated. Next message will cold-start with latest config.`);
            } catch { alert('Refresh failed'); }
          }}><RefreshCw size={16} /> Force Refresh All Sessions</Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left: Chat ── */}
        <Card>
          <div className="mb-4">
            <Select label="Tenant Context" value={tenantId} onChange={v => setTenantId(v)} options={tenantOptions} />

            <div className="mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full animate-pulse bg-success" />
              <Badge color="success">Live</Badge>
              <span className="text-xs text-text-muted">Real AgentCore — tests actual tool permissions and security rules</span>
            </div>
          </div>

          <div className="min-h-[380px] max-h-[460px] overflow-y-auto rounded-xl bg-dark-bg border border-dark-border p-4 mb-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  msg.role === 'user' ? 'bg-primary/15 text-text-primary'
                  : msg.role === 'system' ? 'bg-dark-hover text-text-muted text-xs rounded-lg'
                  : 'bg-dark-card border border-dark-border text-text-primary'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.role === 'system' ? <Terminal size={12} /> :
                     msg.role === 'user' ? <User size={12} /> :
                     <Bot size={12} />}
                    <span className="text-xs text-text-muted">
                      {msg.role === 'system' ? 'System' : msg.role === 'user' ? 'You' : 'Agent'}
                      {msg.timestamp && ` · ${msg.timestamp}`}
                      {msg.source && ` · ${msg.source}`}
                    </span>
                  </div>
                  {msg.role === 'assistant' ? (
                    <div className="text-sm prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_code]:bg-dark-bg [&_code]:px-1 [&_code]:rounded [&_pre]:bg-dark-bg [&_pre]:p-3 [&_pre]:rounded-lg [&_strong]:text-text-primary">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-dark-card border border-dark-border px-3 py-2">
                  <Loader size={14} className="animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !sending) handleSend(); }}
              placeholder="Send a message to test this employee's agent..."
              className="flex-1 rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <Button variant="default" onClick={() => {
              if (tenantId) localStorage.removeItem(`${STORAGE_KEY}_${tenantId}`);
              const label = tenantOptions.find(o => o.value === tenantId)?.label || tenantId;
              const p = profiles?.[tenantId];
              setMessages([{ role: 'system', content: `Testing as ${label} — ${p?.tools?.length || 0} tools enabled`, timestamp: '' }]);
              setLastPlanE('No messages yet');
            }}><Trash2 size={16} /></Button>
            <Button variant="primary" onClick={handleSend} disabled={sending}><Send size={16} /></Button>
          </div>
        </Card>

        {/* ── Right: Inspector ── */}
        <div className="space-y-4">
          <Card>
            <Tabs
              tabs={[
                { id: 'pipeline', label: 'Pipeline Config' },
                { id: 'events', label: 'Audit Events', count: eventsData?.count || undefined },
                { id: 'files', label: 'Employee Files' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            <div className="mt-4">
              {activeTab === 'pipeline' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted">Runtime pipeline for {empId}</p>
                    <Button variant="ghost" size="sm" onClick={() => refetchPipeline()}><RefreshCw size={12} /> Refresh</Button>
                  </div>

                  {pipelineData ? (
                    <>
                      {/* SOUL info */}
                      <div>
                        <p className="text-xs text-text-muted mb-2">SOUL Layers</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg bg-dark-bg p-2.5 text-center">
                            <p className="text-lg font-bold text-text-primary">{pipelineData.soul?.globalWords || 0}</p>
                            <p className="text-[10px] text-text-muted">Global words</p>
                          </div>
                          <div className="rounded-lg bg-dark-bg p-2.5 text-center">
                            <p className="text-lg font-bold text-text-primary">{pipelineData.soul?.positionWords || 0}</p>
                            <p className="text-[10px] text-text-muted">Position words</p>
                          </div>
                          <div className="rounded-lg bg-dark-bg p-2.5 text-center">
                            <p className="text-lg font-bold text-text-primary">{pipelineData.soul?.personalWords || 0}</p>
                            <p className="text-[10px] text-text-muted">Personal words</p>
                          </div>
                        </div>
                      </div>

                      {/* Model */}
                      <div>
                        <p className="text-xs text-text-muted mb-1">Model</p>
                        <code className="text-sm text-primary-light bg-primary/5 px-2 py-1 rounded">{pipelineData.model || '—'}</code>
                      </div>

                      {/* Plan A Tools */}
                      <div>
                        <p className="text-xs text-text-muted mb-2">Plan A — Allowed Tools ({pipelineData.planA?.tools?.length || 0})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(pipelineData.planA?.tools || []).map((t: string) => <Badge key={t} color="success">{t}</Badge>)}
                        </div>
                      </div>

                      {/* Knowledge Bases */}
                      {pipelineData.knowledgeBases && pipelineData.knowledgeBases.length > 0 && (
                        <div>
                          <p className="text-xs text-text-muted mb-2">Knowledge Bases</p>
                          <div className="flex flex-wrap gap-1.5">
                            {pipelineData.knowledgeBases.map((kb: any) => <Badge key={kb.id || kb} color="info">{kb.name || kb}</Badge>)}
                          </div>
                        </div>
                      )}

                      {/* Runtime */}
                      {pipelineData.runtime && (
                        <div>
                          <p className="text-xs text-text-muted mb-1">Runtime</p>
                          <div className="rounded-lg bg-dark-bg p-2.5 text-xs text-text-secondary font-mono">
                            {pipelineData.runtime.name || pipelineData.runtime.id || 'default'}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-text-muted mb-1">Tenant ID</p>
                        <code className="text-sm text-primary-light bg-primary/5 px-2 py-1 rounded">{tenantId}</code>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-2">Permission Profile</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge color="primary">{profile.role}</Badge>
                          {profile.tools.map(t => <Badge key={t} color="success">{t}</Badge>)}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-2">Plan A — Pre-Execution</p>
                        <pre className="rounded-lg bg-dark-bg border border-dark-border p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono">{profile.planA || 'Loading...'}</pre>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-2">Plan E — Post-Execution</p>
                        <pre className="rounded-lg bg-dark-bg border border-dark-border p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono">{profile.planE || 'Loading...'}</pre>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-text-muted mb-1">Last Plan E Result</p>
                    <div className={`rounded-lg px-3 py-2 text-sm ${
                      lastPlanE.includes('PASS') ? 'bg-success/10 text-success'
                      : lastPlanE.includes('BLOCKED') ? 'bg-danger/10 text-danger'
                      : 'bg-dark-bg text-text-muted'
                    }`}>{lastPlanE}</div>
                  </div>
                </div>
              )}

              {/* Events Tab */}
              {activeTab === 'events' && (
                <div>
                  <p className="text-xs text-text-muted mb-3">Recent AUDIT# events for tenant {tenantId} (last 5 minutes)</p>
                  {(eventsData?.events || []).length === 0 ? (
                    <div className="text-center py-8 text-text-muted">
                      <Activity size={24} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No events yet</p>
                      <p className="text-xs mt-1">Send a message to generate audit events</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                      {(eventsData?.events || []).map((e: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg bg-dark-bg/50 px-3 py-2 text-xs hover:bg-dark-bg transition-colors">
                          <span className="text-text-muted shrink-0 w-16 font-mono">{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}</span>
                          <Badge color={e.eventType === 'agent_invocation' ? 'primary' : e.eventType === 'tool_execution' ? 'success' : e.status === 'blocked' ? 'danger' : 'default'}>
                            {(e.eventType || e.type || '').replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-text-secondary flex-1">{e.detail || e.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted mb-3">
                    Click to expand and view or edit. USER.md and personal SOUL can be saved directly to S3.
                  </p>
                  <FileCard label="SOUL.md (Personal)" s3Key={`${empId}/workspace/SOUL.md`} editable badge="editable" badgeColor="success" />
                  {posId && <FileCard label="SOUL.md (Position)" s3Key={`_shared/soul/positions/${posId}/SOUL.md`} editable badge={posId} badgeColor="primary" />}
                  <FileCard label="USER.md (Preferences)" s3Key={`${empId}/workspace/USER.md`} editable badge="editable" badgeColor="success" />
                  <FileCard label="MEMORY.md (Memory)" s3Key={`${empId}/workspace/MEMORY.md`} badge="read-only" badgeColor="default" />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
