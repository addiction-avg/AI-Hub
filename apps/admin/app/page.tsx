"use client";

import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Gauge,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Router,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Zap
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  createApiKey,
  deleteModel,
  loadAdminData,
  saveModel,
  updateApiKey,
  updateProvider,
  type AdminData,
  type ApiKeyRow
} from "../lib/api";

const fallbackData: AdminData = {
  summary: {
    balance: 0,
    totalRequests: 0,
    successRate: 100,
    avgLatencyMs: 0,
    availableModels: 0,
    providerConfigured: false,
    recentFailures: 0
  },
  models: [],
  providers: [],
  apiKeys: [],
  logs: []
};

const navItems = [
  { label: "概览", icon: Gauge, active: true },
  { label: "模型路由", icon: Boxes },
  { label: "供应商", icon: Router },
  { label: "API Keys", icon: KeyRound },
  { label: "调用日志", icon: Activity },
  { label: "系统设置", icon: Settings }
];

export default function AdminPage() {
  const [apiKey, setApiKey] = useState("sk-local-dev");
  const [data, setData] = useState<AdminData>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "keys">("keys");
  const [newKey, setNewKey] = useState<{ name: string; balance: number; raw?: string }>({
    name: "测试用户",
    balance: 1000
  });
  const [modelForm, setModelForm] = useState({
    publicName: "gpt-4o-mini",
    providerModel: "gpt-4o-mini",
    status: "active" as "active" | "disabled"
  });
  const [providerForm, setProviderForm] = useState({
    name: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    status: "active" as "active" | "disabled"
  });
  const [keyDrafts, setKeyDrafts] = useState<Record<string, Pick<ApiKeyRow, "name" | "balance" | "status">>>({});

  async function refresh(showNotice = false) {
    setLoading(true);
    setError(null);

    try {
      const nextData = await loadAdminData(apiKey);
      setData(nextData);
      const provider = nextData.providers[0];
      if (provider) {
        setProviderForm((current) => ({
          ...current,
          name: provider.name,
          baseUrl: provider.baseUrl,
          status: provider.status === "disabled" ? "disabled" : "active"
        }));
      }
      setKeyDrafts(
        Object.fromEntries(
          nextData.apiKeys.map((key) => [
            key.id,
            {
              name: key.name,
              balance: key.balance,
              status: key.status
            }
          ])
        )
      );
      if (showNotice) {
        setNotice("已刷新");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法连接管理接口");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const chartData = useMemo(() => {
    const buckets = new Map<string, { name: string; requests: number; failures: number }>();

    for (const log of data.logs.toReversed()) {
      const time = new Date(log.createdAt);
      const name = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
      const bucket = buckets.get(name) ?? { name, requests: 0, failures: 0 };
      bucket.requests += 1;
      bucket.failures += log.success ? 0 : 1;
      buckets.set(name, bucket);
    }

    return Array.from(buckets.values()).slice(-12);
  }, [data.logs]);

  const provider = data.providers[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={19} />
          </div>
          <div>
            <div className="brand-title">AI Relay</div>
            <div className="brand-subtitle">管理后台</div>
          </div>
        </div>

        <nav className="nav" aria-label="后台导航">
          {navItems.map((item) => (
            <div className={`nav-item ${item.active ? "active" : ""}`} key={item.label}>
              <item.icon size={17} />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-row">
            <span className={`status-dot ${data.summary.providerConfigured ? "" : "warn"}`} />
            <span>{data.summary.providerConfigured ? "供应商已配置" : "待配置供应商 Key"}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">运营概览</h1>
            <div className="page-kicker">本地中转站 API：localhost:3000</div>
          </div>

          <div className="toolbar">
            <input
              aria-label="管理 API Key"
              className="input mono"
              onChange={(event) => setApiKey(event.target.value)}
              value={apiKey}
            />
            <button className="icon-button" onClick={() => refresh(true)} title="刷新" type="button">
              <RefreshCw size={17} />
            </button>
            <button className="primary-button" onClick={() => refresh(true)} type="button">
              <ShieldCheck size={17} />
              连接
            </button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}
        {notice ? <div className="notice-banner">{notice}</div> : null}

        <section className="grid stats-grid">
          <StatCard
            icon={<CircleDollarSign size={18} />}
            label="剩余额度"
            note="当前管理 Key"
            tone="tone-teal"
            value={loading ? "..." : data.summary.balance.toLocaleString()}
          />
          <StatCard
            icon={<Activity size={18} />}
            label="最近请求"
            note="最近 200 条日志"
            tone="tone-blue"
            value={loading ? "..." : data.summary.totalRequests.toLocaleString()}
          />
          <StatCard
            icon={<CheckCircle2 size={18} />}
            label="成功率"
            note={`${data.summary.recentFailures} 个失败请求`}
            tone="tone-amber"
            value={loading ? "..." : `${data.summary.successRate}%`}
          />
          <StatCard
            icon={<Layers3 size={18} />}
            label="可用模型"
            note={`${data.providers.length} 个供应商`}
            tone="tone-rose"
            value={loading ? "..." : data.summary.availableModels.toString()}
          />
        </section>

        <section className="grid content-grid">
          <div className="stack">
            <div className="card section">
              <div className="section-header">
                <div>
                  <div className="section-title">调用趋势</div>
                  <div className="page-kicker">按最近日志聚合</div>
                </div>
                <button className="secondary-button" type="button">
                  延迟 {data.summary.avgLatencyMs}ms
                </button>
              </div>

              {chartData.length ? (
                <div className="chart">
                  <ResponsiveContainer height="100%" width="100%">
                    <AreaChart data={chartData} margin={{ bottom: 0, left: -24, right: 8, top: 6 }}>
                      <defs>
                        <linearGradient id="requests" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0f766e" stopOpacity={0.34} />
                          <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e6ecee" strokeDasharray="4 4" vertical={false} />
                      <XAxis axisLine={false} dataKey="name" tickLine={false} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Area
                        dataKey="requests"
                        fill="url(#requests)"
                        name="请求"
                        stroke="#0f766e"
                        strokeWidth={2}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty">暂无调用日志</div>
              )}
            </div>

            <div className="card section">
              <div className="section-header">
                <div>
                  <div className="section-title">模型路由</div>
                  <div className="page-kicker">对外模型名映射到上游模型名</div>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  <span>对外模型名</span>
                  <input
                    className="input"
                    onChange={(event) => setModelForm((current) => ({ ...current, publicName: event.target.value }))}
                    value={modelForm.publicName}
                  />
                </label>
                <label>
                  <span>上游模型名</span>
                  <input
                    className="input"
                    onChange={(event) => setModelForm((current) => ({ ...current, providerModel: event.target.value }))}
                    value={modelForm.providerModel}
                  />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    className="input"
                    onChange={(event) =>
                      setModelForm((current) => ({
                        ...current,
                        status: event.target.value === "disabled" ? "disabled" : "active"
                      }))
                    }
                    value={modelForm.status}
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={saving}
                  onClick={() =>
                    runAction(async () => {
                      await saveModel(apiKey, modelForm);
                    }, "模型路由已保存")
                  }
                  type="button"
                >
                  <Save size={17} />
                  保存模型
                </button>
              </div>

              <div className="stack compact-stack">
                {data.models.map((model) => (
                  <div className="model-line" key={model.publicName}>
                    <button
                      className="icon-button"
                      onClick={() =>
                        setModelForm({
                          publicName: model.publicName,
                          providerModel: model.providerModel,
                          status: model.status
                        })
                      }
                      title="编辑"
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <div>
                      <div className="line-title mono">{model.publicName}</div>
                      <div className="line-subtitle">上游模型：{model.providerModel}</div>
                    </div>
                    <span className={`badge ${model.status === "active" ? "ok" : "warn"}`}>{model.status}</span>
                    <button
                      className="icon-button danger"
                      onClick={() =>
                        runAction(async () => {
                          await deleteModel(apiKey, model.publicName);
                        }, "模型路由已删除")
                      }
                      title="删除"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card section">
              <div className="section-header">
                <div>
                  <div className="section-title">供应商配置</div>
                  <div className="page-kicker">{provider?.configured ? "Key 已保存" : "还没有可用上游 Key"}</div>
                </div>
                <span className={`badge ${provider?.configured ? "ok" : "warn"}`}>
                  {provider?.configured ? "active" : "missing key"}
                </span>
              </div>

              <div className="form-stack">
                <label>
                  <span>名称</span>
                  <input
                    className="input"
                    onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))}
                    value={providerForm.name}
                  />
                </label>
                <label>
                  <span>Base URL</span>
                  <input
                    className="input mono"
                    onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))}
                    value={providerForm.baseUrl}
                  />
                </label>
                <label>
                  <span>上游 API Key</span>
                  <input
                    className="input mono"
                    onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder={provider?.configured ? "留空表示不修改" : "填写上游供应商 Key"}
                    type="password"
                    value={providerForm.apiKey}
                  />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    className="input"
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        status: event.target.value === "disabled" ? "disabled" : "active"
                      }))
                    }
                    value={providerForm.status}
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={saving}
                  onClick={() =>
                    runAction(async () => {
                      await updateProvider(apiKey, provider?.id ?? "openai-compatible", {
                        name: providerForm.name,
                        baseUrl: providerForm.baseUrl,
                        apiKey: providerForm.apiKey || undefined,
                        status: providerForm.status
                      });
                      setProviderForm((current) => ({ ...current, apiKey: "" }));
                    }, "供应商配置已保存")
                  }
                  type="button"
                >
                  <Save size={17} />
                  保存供应商
                </button>
              </div>
            </div>

            <div className="card section">
              <div className="section-header">
                <div className="section-title">资源视图</div>
                <div className="tabs">
                  <button
                    className={`tab ${activeTab === "keys" ? "active" : ""}`}
                    onClick={() => setActiveTab("keys")}
                    type="button"
                  >
                    Keys
                  </button>
                  <button
                    className={`tab ${activeTab === "logs" ? "active" : ""}`}
                    onClick={() => setActiveTab("logs")}
                    type="button"
                  >
                    日志
                  </button>
                </div>
              </div>

              {activeTab === "keys" ? (
                <div className="stack">
                  <div className="form-grid key-create-grid">
                    <label>
                      <span>Key 名称</span>
                      <input
                        className="input"
                        onChange={(event) => setNewKey((current) => ({ ...current, name: event.target.value }))}
                        value={newKey.name}
                      />
                    </label>
                    <label>
                      <span>初始余额</span>
                      <input
                        className="input"
                        min={0}
                        onChange={(event) =>
                          setNewKey((current) => ({ ...current, balance: Number(event.target.value) }))
                        }
                        type="number"
                        value={newKey.balance}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={saving}
                      onClick={() =>
                        runAction(async () => {
                          const created = await createApiKey(apiKey, newKey);
                          setNewKey((current) => ({ ...current, raw: created.apiKey }));
                        }, "API Key 已创建")
                      }
                      type="button"
                    >
                      <Plus size={17} />
                      创建 Key
                    </button>
                  </div>

                  {newKey.raw ? (
                    <div className="secret-box">
                      <div className="secret-text mono">{newKey.raw}</div>
                      <button
                        className="icon-button"
                        onClick={() => navigator.clipboard.writeText(newKey.raw ?? "")}
                        title="复制"
                        type="button"
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  ) : null}

                  <KeysTable
                    drafts={keyDrafts}
                    keys={data.apiKeys}
                    onDraftChange={(id, draft) =>
                      setKeyDrafts((current) => ({
                        ...current,
                        [id]: {
                          ...current[id],
                          ...draft
                        }
                      }))
                    }
                    onSave={(id) =>
                      runAction(async () => {
                        await updateApiKey(apiKey, id, keyDrafts[id]);
                      }, "API Key 已保存")
                    }
                  />
                </div>
              ) : (
                <LogsTable logs={data.logs} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  note,
  tone,
  value
}: {
  icon: ReactNode;
  label: string;
  note: string;
  tone: string;
  value: string;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-header">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function LogsTable({ logs }: { logs: AdminData["logs"] }) {
  if (!logs.length) {
    return <div className="empty">暂无调用记录</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>模型</th>
            <th>状态</th>
            <th>耗时</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 8).map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleTimeString()}</td>
              <td className="mono">{log.model}</td>
              <td>
                <span className={`badge ${log.success ? "ok" : "error"}`}>{log.statusCode}</span>
              </td>
              <td>{log.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeysTable({
  drafts,
  keys,
  onDraftChange,
  onSave
}: {
  drafts: Record<string, Pick<ApiKeyRow, "name" | "balance" | "status">>;
  keys: ApiKeyRow[];
  onDraftChange: (id: string, draft: Partial<Pick<ApiKeyRow, "name" | "balance" | "status">>) => void;
  onSave: (id: string) => void;
}) {
  if (!keys.length) {
    return <div className="empty">暂无 API Key</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>Key</th>
            <th>余额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const draft = drafts[key.id] ?? key;

            return (
              <tr key={key.id}>
                <td>
                  <input
                    className="table-input"
                    onChange={(event) => onDraftChange(key.id, { name: event.target.value })}
                    value={draft.name}
                  />
                </td>
                <td className="mono">{key.apiKeyPreview}</td>
                <td>
                  <input
                    className="table-input number"
                    min={0}
                    onChange={(event) => onDraftChange(key.id, { balance: Number(event.target.value) })}
                    type="number"
                    value={draft.balance}
                  />
                </td>
                <td>
                  <select
                    className="table-input"
                    onChange={(event) =>
                      onDraftChange(key.id, {
                        status: event.target.value === "disabled" ? "disabled" : "active"
                      })
                    }
                    value={draft.status}
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </td>
                <td>
                  <button className="icon-button" onClick={() => onSave(key.id)} title="保存" type="button">
                    <Save size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
