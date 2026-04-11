import { useState, useEffect } from 'react';
import {
  User, Globe, MessageSquare, Server,
  Eye, EyeOff, Check, X, RefreshCw, HardDrive,
  Cpu, MemoryStick, Wifi, WifiOff,
  ChevronDown,
} from 'lucide-react';
import { Card, Badge, Button, PageHeader, Tabs, Select } from '../components/ui';
import {
  useAdminAssistant, useUpdateAdminAssistant,
  useChangeAdminPassword, useSystemStats, useServiceStatus, useModelConfig,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
}

function ProgressBar({ pct, color = 'primary' }: { pct: number; color?: string }) {
  const colors: Record<string, string> = {
    primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger',
  };
  const barColor = pct > 85 ? colors.danger : pct > 65 ? colors.warning : colors.success;
  return (
    <div className="h-1.5 w-full rounded-full bg-dark-border/40 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ─── Account Tab ─────────────────────────────────────────────────────────────

function AccountTab() {
  const { user } = useAuth();
  const changePw = useChangeAdminPassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleChange = async () => {
    if (next.length < 8) { setMsg({ ok: false, text: 'Password must be at least 8 characters' }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'Passwords do not match' }); return; }
    try {
      await changePw.mutateAsync(next);
      setMsg({ ok: true, text: 'Password updated successfully' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch {
      setMsg({ ok: false, text: 'Failed to update password' });
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Profile */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <User size={16} className="text-primary" /> Admin Profile
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Name', value: user?.name || 'Admin' },
            { label: 'Role', value: 'Administrator' },
            { label: 'Employee ID', value: user?.id || '—' },
          ].map(f => (
            <div key={f.label} className="flex items-center justify-between rounded-xl bg-surface-dim px-4 py-3">
              <span className="text-xs text-text-muted">{f.label}</span>
              <span className="text-sm text-text-primary font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Password */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <User size={16} className="text-primary" /> Change Password
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Current password', value: current, set: setCurrent },
            { label: 'New password', value: next, set: setNext },
            { label: 'Confirm new password', value: confirm, set: setConfirm },
          ].map(f => (
            <div key={f.label}>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">{f.label}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  className="w-full rounded-xl border border-dark-border/60 bg-surface-dim px-4 py-2.5 pr-10 text-sm text-text-primary focus:border-primary/60 focus:outline-none"
                />
                <button onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}
          {msg && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {msg.ok ? <Check size={14} /> : <X size={14} />} {msg.text}
            </div>
          )}
          <Button variant="primary" className="w-full" disabled={changePw.isPending}
            onClick={handleChange}>
            {changePw.isPending ? 'Updating…' : 'Update Password'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Interface Tab ────────────────────────────────────────────────────────────

function InterfaceTab() {
  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸', available: true },
    { code: 'zh', name: '中文 (简体)', flag: '🇨🇳', available: false },
    { code: 'ja', name: '日本語', flag: '🇯🇵', available: false },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Globe size={16} className="text-primary" /> Language
        </h3>
        <div className="space-y-2">
          {languages.map(l => (
            <label key={l.code}
              className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors ${l.available ? 'bg-primary/10 border border-primary/30 cursor-pointer' : 'bg-surface-dim border border-transparent opacity-40 cursor-not-allowed'}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{l.flag}</span>
                <span className={`text-sm font-medium ${l.available ? 'text-text-primary' : 'text-text-muted'}`}>{l.name}</span>
                {!l.available && <Badge color="default">Coming soon</Badge>}
              </div>
              <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${l.available ? 'border-primary bg-primary' : 'border-dark-border'}`}>
                {l.available && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Multi-language support is in development. Chinese and Japanese interfaces are planned for a future release.
        </p>
      </Card>
    </div>
  );
}

// ─── Admin Assistant Tab ──────────────────────────────────────────────────────

function AdminAssistantTab() {
  const { data: cfg } = useAdminAssistant();
  const update = useUpdateAdminAssistant();
  const { data: mc } = useModelConfig();
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxHistory, setMaxHistory] = useState(20);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (cfg) {
      setModel(cfg.model || '');
      setSystemPrompt(cfg.systemPrompt || '');
      setMaxHistory(cfg.maxHistoryTurns || 20);
      setMaxTokens(cfg.maxTokens || 4096);
    }
  }, [cfg]);

  const handleSave = async () => {
    await update.mutateAsync({ model, systemPrompt, maxHistoryTurns: maxHistory, maxTokens });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const modelOptions = (mc?.availableModels || [])
    .filter(m => m.enabled)
    .map(m => ({ label: `${m.modelName} ($${m.inputRate}/$${m.outputRate})`, value: m.modelId }));

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <MessageSquare size={16} className="text-primary" /> Admin Assistant Model
        </h3>
        <p className="text-xs text-text-muted mb-4">
          The model used by the floating chat assistant (bottom-right corner).
          Uses Bedrock Converse with 10 whitelisted tools (agentic loop).
        </p>
        <Select label="Model" value={model} onChange={setModel}
          options={modelOptions} placeholder="Select model…" />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">System Prompt</h3>
        <p className="text-xs text-text-muted mb-3">Custom system prompt for the Admin Assistant. Leave empty to use the default.</p>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. Always respond in English. Focus on operational queries about employees and agents."
          className="w-full rounded-xl border border-dark-border/60 bg-surface-dim px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/60 focus:outline-none resize-y"
        />
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Conversation Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Max History Turns</label>
            <input type="number" value={maxHistory} onChange={e => setMaxHistory(Number(e.target.value))}
              min={1} max={50}
              className="w-full rounded-lg border border-dark-border/60 bg-surface-dim px-3 py-2 text-sm text-text-primary focus:border-primary/60 focus:outline-none" />
            <p className="text-[10px] text-text-muted mt-1">Number of conversation turns kept in context</p>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Max Tokens</label>
            <input type="number" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))}
              min={256} max={8192} step={256}
              className="w-full rounded-lg border border-dark-border/60 bg-surface-dim px-3 py-2 text-sm text-text-primary focus:border-primary/60 focus:outline-none" />
            <p className="text-[10px] text-text-muted mt-1">Max response tokens per turn</p>
          </div>
        </div>
      </Card>

      <Button variant="primary" onClick={handleSave} disabled={update.isPending}>
        {saved ? <><Check size={14} /> Saved</> : update.isPending ? 'Saving…' : 'Save Changes'}
      </Button>
    </div>
  );
}

// ─── System Tab ───────────────────────────────────────────────────────────────

function SystemTab() {
  const { data: stats, isLoading: statsLoading } = useSystemStats();
  const { data: services } = useServiceStatus();

  const svc = services || { gateway: { status: 'unknown', port: 0, uptime: '', requestsToday: 0 }, auth_agent: { status: 'unknown', uptime: '', approvalsProcessed: 0 }, bedrock: { status: 'unknown', region: '', latencyMs: 0, vpcEndpoint: false }, dynamodb: { status: 'unknown', table: '', itemCount: 0 }, s3: { status: 'unknown', bucket: '' } };

  return (
    <div className="space-y-6">
      {/* Resources */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* CPU */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Cpu size={16} className="text-primary" /><span className="text-sm font-semibold">CPU</span></div>
            {statsLoading ? <RefreshCw size={14} className="animate-spin text-text-muted" /> : null}
          </div>
          <p className="text-3xl font-bold text-text-primary mb-2">{stats?.cpu?.pct ?? '—'}<span className="text-sm font-normal text-text-muted ml-1">%</span></p>
          <ProgressBar pct={stats?.cpu?.pct || 0} />
        </Card>

        {/* Memory */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <MemoryStick size={16} className="text-primary" /><span className="text-sm font-semibold">Memory</span>
          </div>
          <p className="text-3xl font-bold text-text-primary mb-1">
            {stats?.memory?.pct ?? '—'}<span className="text-sm font-normal text-text-muted ml-1">%</span>
          </p>
          <ProgressBar pct={stats?.memory?.pct || 0} />
          <p className="text-xs text-text-muted mt-1.5">
            {stats?.memory ? `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.total)}` : '—'}
          </p>
        </Card>

        {/* Disk */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={16} className="text-primary" /><span className="text-sm font-semibold">Disk</span>
          </div>
          <p className="text-3xl font-bold text-text-primary mb-1">
            {stats?.disk?.pct ?? '—'}<span className="text-sm font-normal text-text-muted ml-1">%</span>
          </p>
          <ProgressBar pct={stats?.disk?.pct || 0} />
          <p className="text-xs text-text-muted mt-1.5">
            {stats?.disk ? `${fmtBytes(stats.disk.used)} used · ${fmtBytes(stats.disk.free)} free` : '—'}
          </p>
        </Card>
      </div>

      {/* Port Status */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Wifi size={16} className="text-primary" /> Port Status
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(stats?.ports || []).map(p => (
            <div key={p.port} className={`rounded-xl px-4 py-3 border ${p.listening ? 'bg-success/5 border-success/20' : 'bg-danger/5 border-danger/20'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {p.listening ? <Wifi size={13} className="text-success" /> : <WifiOff size={13} className="text-danger" />}
                <span className="text-xs font-mono font-bold">{p.port}</span>
              </div>
              <p className="text-xs text-text-secondary">{p.name}</p>
              <Badge color={p.listening ? 'success' : 'danger'}>{p.listening ? 'Listening' : 'Down'}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Services */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: 'Gateway Proxy', status: svc.gateway.status, details: [`Port ${svc.gateway.port}`, `Uptime: ${svc.gateway.uptime}`, `Requests today: ${svc.gateway.requestsToday}`] },
          { name: 'Auth Agent', status: svc.auth_agent.status, details: [`Uptime: ${svc.auth_agent.uptime}`, `Approvals: ${svc.auth_agent.approvalsProcessed}`] },
          { name: 'Bedrock', status: svc.bedrock.status, details: [`Region: ${svc.bedrock.region}`, `Latency: ${svc.bedrock.latencyMs}ms`, svc.bedrock.vpcEndpoint ? 'VPC Endpoint ✓' : 'Public endpoint'] },
          { name: 'DynamoDB', status: svc.dynamodb.status, details: [svc.dynamodb.table, `${svc.dynamodb.itemCount} items`] },
          { name: 'S3', status: svc.s3.status, details: [svc.s3.bucket] },
        ].map(s => {
          const ok = ['running', 'healthy', 'connected', 'active'].includes(s.status);
          return (
            <Card key={s.name}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{s.name}</span>
                <div className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-success animate-pulse' : 'bg-warning'}`} />
              </div>
              <div className="space-y-0.5">
                {s.details.map((d, i) => <p key={i} className="text-xs text-text-muted">{d}</p>)}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState('account');

  return (
    <div>
      <PageHeader title="Settings" description="Admin account, interface preferences, admin assistant configuration, and system health" />

      <Tabs
        tabs={[
          { id: 'account', label: 'Account' },
          { id: 'interface', label: 'Interface' },
          { id: 'assistant', label: 'Admin Assistant' },
          { id: 'system', label: 'System' },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      <div className="mt-6">
        {tab === 'account' && <AccountTab />}
        {tab === 'interface' && <InterfaceTab />}
        {tab === 'assistant' && <AdminAssistantTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}
