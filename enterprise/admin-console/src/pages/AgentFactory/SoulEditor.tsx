import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Lock, Edit3, Eye, User, Loader, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button, PageHeader, StatusDot, Tabs } from '../../components/ui';
import { useAgent, useAgentSoul, usePositions, useEmployees, useSaveSoul } from '../../hooks/useApi';
import { CHANNEL_LABELS } from '../../types';
import type { ChannelType } from '../../types';

export default function SoulEditor() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading: agentLoading } = useAgent(agentId || '');
  const { data: soulLayers, isLoading: soulLoading } = useAgentSoul(agentId || '');
  const { data: positions = [] } = usePositions();
  const { data: employees = [] } = useEmployees();
  const saveSoul = useSaveSoul();
  const position = positions.find(p => p.id === agent?.positionId);
  // Count how many agents share the same position (to warn about position-level edits)
  const positionAgentCount = employees.filter(e => e.positionId === agent?.positionId && e.agentId).length;

  const [globalContent, setGlobalContent] = useState('');
  const [positionContent, setPositionContent] = useState('');
  const [personalContent, setPersonalContent] = useState('');
  const [activeTab, setActiveTab] = useState('position');
  const [saved, setSaved] = useState(false);
  const [showMergedPreview, setShowMergedPreview] = useState(false);

  // Populate from API data when it loads
  useEffect(() => {
    if (soulLayers) {
      setGlobalContent(soulLayers.find(l => l.layer === 'global')?.content || '');
      setPositionContent(soulLayers.find(l => l.layer === 'position')?.content || '');
      setPersonalContent(soulLayers.find(l => l.layer === 'personal')?.content || '');
    }
  }, [soulLayers]);

  const mergedPreview = useMemo(() => {
    const parts: { layer: string; label: string; icon: typeof Lock; content: string; color: string }[] = [];
    if (globalContent) parts.push({ layer: 'global', label: 'Global', icon: Lock, content: globalContent, color: 'text-text-muted border-text-muted/30' });
    if (positionContent) parts.push({ layer: 'position', label: 'Position', icon: Edit3, content: positionContent, color: 'text-primary border-primary/30' });
    if (personalContent) parts.push({ layer: 'personal', label: 'Personal', icon: User, content: personalContent, color: 'text-success border-success/30' });
    return parts;
  }, [globalContent, positionContent, personalContent]);

  const wordCount = (globalContent + '\n' + positionContent + '\n' + personalContent).split(/\s+/).filter(Boolean).length;

  if (agentLoading || soulLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg text-text-muted mb-4">Agent Not Found</p>
        <Button variant="primary" onClick={() => navigate('/agents')}>Back to Agent List</Button>
      </div>
    );
  }

  const mergedSoulText = useMemo(() => {
    const parts = [];
    if (globalContent.trim()) parts.push(`<!-- LAYER: GLOBAL (locked by IT) -->\n\n**CRITICAL IDENTITY OVERRIDE: You are a digital employee of ACME Corp.**\n\n${globalContent.trim()}`);
    if (positionContent.trim()) parts.push(`<!-- LAYER: POSITION -->\n${positionContent.trim()}`);
    if (personalContent.trim()) parts.push(`<!-- LAYER: PERSONAL -->\n${personalContent.trim()}`);
    return parts.join('\n\n---\n\n') || 'No content to merge.';
  }, [globalContent, positionContent, personalContent]);

  const [saveError, setSaveError] = useState('');

  const handleSave = () => {
    if (!agentId) return;
    setSaveError('');
    const layer = activeTab === 'global' ? 'global' : activeTab;
    const content = layer === 'position' ? positionContent : personalContent;
    saveSoul.mutate({ agentId, layer, content }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); },
      onError: (err: any) => {
        if (err?.response?.status === 409 || err?.status === 409) {
          setSaveError('Version conflict: someone else edited this SOUL. Please refresh and try again.');
        } else {
          setSaveError(err?.message || 'Save failed');
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        title={`SOUL Editor: ${agent.name}`}
        description={`${agent.positionName} · ${agent.employeeName} · ${agent.channels.map(c => CHANNEL_LABELS[c as ChannelType]).join(', ')}`}
        actions={
          <div className="flex gap-3">
            <Button variant="default" onClick={() => navigate('/agents')}><ArrowLeft size={16} /> Back</Button>
            <Button variant="default" onClick={() => setShowMergedPreview(!showMergedPreview)}><Eye size={16} /> {showMergedPreview ? 'Hide Preview' : 'Preview Merged'}</Button>
            <Button variant="primary" onClick={handleSave} disabled={activeTab === 'global'}>
              <Save size={16} /> {saved ? '✓ Saved' : `Save ${activeTab === 'position' ? 'Position' : activeTab === 'personal' ? 'Personal' : '(read-only)'}`}
            </Button>
          </div>
        }
      />

      {saveError && (
        <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-danger shrink-0" />
          <p className="text-sm text-danger">{saveError}</p>
          <button onClick={() => setSaveError('')} className="ml-auto text-danger hover:text-danger/70 text-xs">Dismiss</button>
        </div>
      )}

      {/* Agent info bar */}
      <Card className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div><p className="text-xs text-text-muted">Status</p><StatusDot status={agent.status} /></div>
          <div><p className="text-xs text-text-muted">Quality</p><p className="text-sm text-warning">⭐ {agent.qualityScore || '—'}</p></div>
          <div><p className="text-xs text-text-muted">Skills</p><p className="text-sm">{agent.skills.length} active</p></div>
          <div><p className="text-xs text-text-muted">Word Count</p><p className="text-sm">{wordCount} words</p></div>
          <div>
            <p className="text-xs text-text-muted">Versions</p>
            <div className="flex gap-1 mt-0.5">
              <Badge>G:v{agent.soulVersions?.global ?? 0}</Badge>
              <Badge color="primary">P:v{agent.soulVersions?.position ?? 0}</Badge>
              <Badge color="success">U:v{agent.soulVersions?.personal ?? 0}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Editor */}
        <div className="lg:col-span-3">
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-1">Editor</h3>
            <p className="text-sm text-text-secondary mb-4">Three-layer inheritance: Global (read-only) → Position (editable) → Personal (editable)</p>

            <Tabs
              tabs={[
                { id: 'global', label: '🔒 Global' },
                { id: 'position', label: '✏️ Position' },
                { id: 'personal', label: '✏️ Personal' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            <div className="mt-4">
              {activeTab === 'global' && (
                <div>
                  <div className="mb-3 rounded-lg bg-info/5 border border-info/20 px-3 py-2 text-sm text-info">
                    Global layer is locked by admin — affects all agents
                  </div>
                  <pre className="rounded-lg bg-dark-bg border border-dark-border p-4 text-sm text-text-secondary/80 whitespace-pre-wrap font-mono leading-relaxed">
                    {globalContent}
                  </pre>
                </div>
              )}
              {activeTab === 'position' && (
                <div>
                  <div className="mb-3 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={15} className="text-warning mt-0.5 shrink-0" />
                    <p className="text-xs text-warning">
                      <strong>Position-level edit:</strong> This change affects all <strong>{positionAgentCount}</strong> agent{positionAgentCount !== 1 ? 's' : ''} with position "{agent.positionName}". To change only this agent, use the Personal tab instead.
                    </p>
                  </div>
                  <textarea
                    value={positionContent}
                    onChange={e => setPositionContent(e.target.value)}
                    rows={14}
                    placeholder="Define the professional capabilities and behavior rules..."
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none resize-none font-mono leading-relaxed"
                  />
                </div>
              )}
              {activeTab === 'personal' && (
                <div>
                  <div className="mb-3 rounded-lg bg-success/5 border border-success/20 px-3 py-2 text-sm text-success">
                    Personal: {agent.employeeName} — affects only this agent
                  </div>
                  <textarea
                    value={personalContent}
                    onChange={e => setPersonalContent(e.target.value)}
                    rows={14}
                    placeholder="Personal preferences, work habits, special requirements..."
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none resize-none font-mono leading-relaxed"
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Eye size={18} className="text-text-muted" />
              <h3 className="text-lg font-semibold text-text-primary">Preview</h3>
            </div>
            <p className="text-sm text-text-secondary mb-4">Live preview of the merged SOUL.md</p>

            <div className="space-y-4">
              {mergedPreview.map(part => (
                <div key={part.layer}>
                  <Badge color={part.layer === 'global' ? 'default' : part.layer === 'position' ? 'primary' : 'success'}>
                    {part.label}
                  </Badge>
                  <pre className={`mt-2 rounded-lg bg-dark-bg border-l-2 ${part.color} p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed`}>
                    {part.content || '(empty)'}
                  </pre>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-dark-border pt-4">
              <p className="text-xs text-text-muted mb-2">Inheritance Chain</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge>Global SOUL.md</Badge>
                <span className="text-text-muted">→</span>
                <Badge color="primary">{agent.positionName}</Badge>
                <span className="text-text-muted">→</span>
                <Badge color="success">{agent.employeeName}</Badge>
                <span className="text-text-muted">=</span>
                <Badge color="info">Merged SOUL</Badge>
              </div>
              <p className="mt-2 text-xs text-text-muted">🔒 = locked · ✏️ = editable · 📎 = append-only</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Merged SOUL Preview */}
      {showMergedPreview && (
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Eye size={18} /> Merged SOUL.md Preview
            </h3>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>{mergedSoulText.length} chars</span>
              <span>·</span>
              <span>{mergedSoulText.split(/\s+/).filter(Boolean).length} words</span>
              <span>·</span>
              <span>This is what OpenClaw reads at session start</span>
            </div>
          </div>
          <pre className="rounded-lg bg-dark-bg border border-primary/20 p-4 text-sm text-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-[500px] overflow-y-auto">
            {mergedSoulText}
          </pre>
        </Card>
      )}
    </div>
  );
}
