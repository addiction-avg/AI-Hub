"use client";

import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Database,
  Gauge,
  HeartPulse,
  KeyRound,
  Layers3,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Router,
  Save,
  ShieldCheck,
  Trash2,
  Zap
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  createApiKey,
  createTopUpOrder,
  deleteModel,
  loadAdminData,
  saveModel,
  updateApiKey,
  updateProvider,
  updateTopUpOrder,
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
    recentFailures: 0,
    recentFailureRate: 0,
    todayRequests: 0,
    todayCostCredits: 0,
    pendingTopUps: 0
  },
  models: [],
  providers: [],
  apiKeys: [],
  logs: [],
  topUps: [],
  auditLogs: [],
  health: {
    ok: false,
    checks: {
      postgres: "error",
      redis: "error",
      providerConfigured: false
    },
    metrics: {
      recentRequests: 0,
      recentFailures: 0,
      recentFailureRate: 0,
      avgLatencyMs: 0
    }
  },
  admin: {
    adminId: "",
    name: "",
    role: "viewer"
  }
};

const navItems = [
  { label: "概览", icon: Gauge },
  { label: "模型路由", icon: Boxes },
  { label: "供应商", icon: Router },
  { label: "API Keys", icon: KeyRound },
  { label: "充值订单", icon: ReceiptText },
  { label: "审计日志", icon: Activity }
];

export default function AdminPage() {
  const [apiKey, setApiKey] = useState("admin-local-dev");
  const [data, setData] = useState<AdminData>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"keys" | "topups" | "logs" | "audit">("keys");
  const [newKey, setNewKey] = useState<{ name: string; balance: number; raw?: string }>({
    name: "测试用户",
    balance: 1000
  });
  const [modelForm, setModelForm] = useState({
    publicName: "gpt-4o-mini",
    providerModel: "gpt-4o-mini",
    status: "active" as "active" | "disabled",
    inputTokenPricePerMillion: 0,
    outputTokenPricePerMillion: 0
  });
  const [providerForm, setProviderForm] = useState({
    name: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    status: "active" as "active" | "disabled"
  });
  const [topUpForm, setTopUpForm] = useState({
    apiKeyId: "",
    amountCredits: 1000,
    externalRef: "",
    note: ""
  });
  const [keyDrafts, setKeyDrafts] = useState<Record<string, Pick<ApiKeyRow, "name" | "balance" | "status">>>({});

  const canWrite = data.admin.role === "owner" || data.admin.role === "admin";
  const canOwn = data.admin.role === "owner";
  const provider = data.providers[0];

  async function refresh(showNotice = false) {
    setLoading(true);
    setError(null);

    try {
      const nextData = await loadAdminData(apiKey);
      setData(nextData);
      const firstProvider = nextData.providers[0];
      if (firstProvider) {
        setProviderForm((current) => ({
          ...current,
          name: firstProvider.name,
          baseUrl: firstProvider.baseUrl,
          status: firstProvider.status === "disabled" ? "disabled" : "active"
        }));
      }
      const firstKey = nextData.apiKeys[0];
      if (firstKey && !topUpForm.apiKeyId) {
        setTopUpForm((current) => ({ ...current, apiKeyId: firstKey.id }));
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
    const buckets = new Map<string, { name: string; requests: number; cost: number }>();

    for (const log of data.logs.toReversed()) {
      const time = new Date(log.createdAt);
      const name = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
      const bucket = buckets.get(name) ?? { name, requests: 0, cost: 0 };
      bucket.requests += 1;
      bucket.cost += log.costCredits;
      buckets.set(name, bucket);
    }

    return Array.from(buckets.values()).slice(-12);
  }, [data.logs]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={19} />
          </div>
          <div>
            <div className="brand-title">AI Relay</div>
            <div className="brand-subtitle">商业化 MVP 后台</div>
          </div>
        </div>

        <nav className="nav" aria-label="后台导航">
          {navItems.map((item, index) => (
            <div className={`nav-item ${index === 0 ? "active" : ""}`} key={item.label}>
              <item.icon size={17} />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-row">
            <span className={`status-dot ${data.health.ok ? "" : "warn"}`} />
            <span>{data.health.ok ? "核心依赖正常" : "存在待处理配置"}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">运营概览</h1>
            <div className="page-kicker">
              {data.admin.name || "未连接"} · {data.admin.role.toUpperCase()} · localhost:3000
            </div>
          </div>

          <div className="toolbar">
            <input
              aria-label="管理员 Key"
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
            note="全部 API Key 汇总"
            tone="tone-teal"
            value={loading ? "..." : data.summary.balance.toLocaleString()}
          />
          <StatCard
            icon={<Activity size={18} />}
            label="今日请求"
            note={`今日消耗 ${data.summary.todayCostCredits} credits`}
            tone="tone-blue"
            value={loading ? "..." : data.summary.todayRequests.toLocaleString()}
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
            note={`${data.summary.pendingTopUps} 个待处理充值`}
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
                  <div className="page-kicker">按最近调用日志聚合</div>
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
                      <Area dataKey="requests" fill="url(#requests)" name="请求" stroke="#0f766e" strokeWidth={2} type="monotone" />
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
                  <div className="section-title">模型路由与单价</div>
                  <div className="page-kicker">单价单位：每 100 万 token 消耗的 credit</div>
                </div>
              </div>

              <div className="form-grid model-form-grid">
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
                  <span>输入单价</span>
                  <input
                    className="input"
                    min={0}
                    onChange={(event) =>
                      setModelForm((current) => ({ ...current, inputTokenPricePerMillion: Number(event.target.value) }))
                    }
                    type="number"
                    value={modelForm.inputTokenPricePerMillion}
                  />
                </label>
                <label>
                  <span>输出单价</span>
                  <input
                    className="input"
                    min={0}
                    onChange={(event) =>
                      setModelForm((current) => ({ ...current, outputTokenPricePerMillion: Number(event.target.value) }))
                    }
                    type="number"
                    value={modelForm.outputTokenPricePerMillion}
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
                  disabled={saving || !canWrite}
                  onClick={() =>
                    runAction(async () => {
                      await saveModel(apiKey, modelForm);
                    }, "模型路由已保存")
                  }
                  type="button"
                >
                  <Save size={17} />
                  保存
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
                          status: model.status,
                          inputTokenPricePerMillion: model.inputTokenPricePerMillion,
                          outputTokenPricePerMillion: model.outputTokenPricePerMillion
                        })
                      }
                      title="编辑"
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <div>
                      <div className="line-title mono">{model.publicName}</div>
                      <div className="line-subtitle">
                        上游 {model.providerModel} · 输入 {model.inputTokenPricePerMillion} · 输出 {model.outputTokenPricePerMillion}
                      </div>
                    </div>
                    <span className={`badge ${model.status === "active" ? "ok" : "warn"}`}>{model.status}</span>
                    <button
                      className="icon-button danger"
                      disabled={saving || !canWrite}
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
                  <div className="section-title">系统健康</div>
                  <div className="page-kicker">PostgreSQL、Redis、供应商和最近失败率</div>
                </div>
                <HeartPulse size={18} />
              </div>
              <div className="health-grid">
                <HealthItem label="PostgreSQL" ok={data.health.checks.postgres === "ok"} />
                <HealthItem label="Redis" ok={data.health.checks.redis === "ok"} />
                <HealthItem label="供应商 Key" ok={data.health.checks.providerConfigured} />
                <HealthItem label="失败率" value={`${data.health.metrics.recentFailureRate}%`} ok={data.health.metrics.recentFailureRate < 20} />
              </div>
            </div>

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
                  disabled={saving || !canOwn}
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
                  <TabButton active={activeTab === "keys"} label="Keys" onClick={() => setActiveTab("keys")} />
                  <TabButton active={activeTab === "topups"} label="充值" onClick={() => setActiveTab("topups")} />
                  <TabButton active={activeTab === "logs"} label="用量" onClick={() => setActiveTab("logs")} />
                  <TabButton active={activeTab === "audit"} label="审计" onClick={() => setActiveTab("audit")} />
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
                        onChange={(event) => setNewKey((current) => ({ ...current, balance: Number(event.target.value) }))}
                        type="number"
                        value={newKey.balance}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={saving || !canWrite}
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
                      <button className="icon-button" onClick={() => navigator.clipboard.writeText(newKey.raw ?? "")} title="复制" type="button">
                        <Copy size={15} />
                      </button>
                    </div>
                  ) : null}

                  <KeysTable
                    canOwn={canOwn}
                    canWrite={canWrite}
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
              ) : null}

              {activeTab === "topups" ? (
                <TopUpsPanel
                  apiKey={apiKey}
                  apiKeys={data.apiKeys}
                  canOwn={canOwn}
                  canWrite={canWrite}
                  form={topUpForm}
                  onAction={runAction}
                  onFormChange={setTopUpForm}
                  orders={data.topUps}
                  saving={saving}
                />
              ) : null}

              {activeTab === "logs" ? <LogsTable logs={data.logs} /> : null}
              {activeTab === "audit" ? <AuditTable logs={data.auditLogs} /> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`tab ${active ? "active" : ""}`} onClick={onClick} type="button">
      {label}
    </button>
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

function HealthItem({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className="health-item">
      <Database size={16} />
      <span>{label}</span>
      <span className={`badge ${ok ? "ok" : "warn"}`}>{value ?? (ok ? "ok" : "check")}</span>
    </div>
  );
}

function TopUpsPanel({
  apiKey,
  apiKeys,
  canOwn,
  canWrite,
  form,
  onAction,
  onFormChange,
  orders,
  saving
}: {
  apiKey: string;
  apiKeys: ApiKeyRow[];
  canOwn: boolean;
  canWrite: boolean;
  form: { apiKeyId: string; amountCredits: number; externalRef: string; note: string };
  onAction: (action: () => Promise<void>, successMessage: string) => Promise<void>;
  onFormChange: (form: { apiKeyId: string; amountCredits: number; externalRef: string; note: string }) => void;
  orders: AdminData["topUps"];
  saving: boolean;
}) {
  return (
    <div className="stack">
      <div className="form-grid topup-grid">
        <label>
          <span>充值 Key</span>
          <select className="input" onChange={(event) => onFormChange({ ...form, apiKeyId: event.target.value })} value={form.apiKeyId}>
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name} · {key.apiKeyPreview}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>充值额度</span>
          <input
            className="input"
            min={1}
            onChange={(event) => onFormChange({ ...form, amountCredits: Number(event.target.value) })}
            type="number"
            value={form.amountCredits}
          />
        </label>
        <label>
          <span>外部单号</span>
          <input className="input" onChange={(event) => onFormChange({ ...form, externalRef: event.target.value })} value={form.externalRef} />
        </label>
        <label>
          <span>备注</span>
          <input className="input" onChange={(event) => onFormChange({ ...form, note: event.target.value })} value={form.note} />
        </label>
        <button
          className="primary-button"
          disabled={saving || !canWrite || !form.apiKeyId}
          onClick={() =>
            onAction(async () => {
              await createTopUpOrder(apiKey, form);
            }, "充值订单已创建")
          }
          type="button"
        >
          <Plus size={17} />
          创建订单
        </button>
      </div>

      <OrdersTable apiKey={apiKey} canOwn={canOwn} onAction={onAction} orders={orders} saving={saving} />
    </div>
  );
}

function OrdersTable({
  apiKey,
  canOwn,
  onAction,
  orders,
  saving
}: {
  apiKey: string;
  canOwn: boolean;
  onAction: (action: () => Promise<void>, successMessage: string) => Promise<void>;
  orders: AdminData["topUps"];
  saving: boolean;
}) {
  if (!orders.length) {
    return <div className="empty">暂无充值订单</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>API Key</th>
            <th>额度</th>
            <th>状态</th>
            <th>外部单号</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {orders.slice(0, 12).map((order) => (
            <tr key={order.id}>
              <td>{new Date(order.createdAt).toLocaleString()}</td>
              <td className="mono">{order.apiKeyId}</td>
              <td>{order.amountCredits}</td>
              <td>
                <span className={`badge ${order.status === "paid" ? "ok" : order.status === "canceled" ? "error" : "warn"}`}>{order.status}</span>
              </td>
              <td className="mono">{order.externalRef || "-"}</td>
              <td>
                <div className="table-actions">
                  <button
                    className="secondary-button"
                    disabled={saving || !canOwn || order.status !== "pending"}
                    onClick={() =>
                      onAction(async () => {
                        await updateTopUpOrder(apiKey, order.id, { status: "paid" });
                      }, "充值订单已入账")
                    }
                    type="button"
                  >
                    入账
                  </button>
                  <button
                    className="secondary-button"
                    disabled={saving || !canOwn || order.status !== "pending"}
                    onClick={() =>
                      onAction(async () => {
                        await updateTopUpOrder(apiKey, order.id, { status: "canceled" });
                      }, "充值订单已取消")
                    }
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <th>Token</th>
            <th>费用</th>
            <th>耗时</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 10).map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleTimeString()}</td>
              <td className="mono">{log.model}</td>
              <td>
                <span className={`badge ${log.success ? "ok" : "error"}`}>{log.statusCode}</span>
              </td>
              <td>{log.totalTokens || "-"}</td>
              <td>{log.costCredits}</td>
              <td>{log.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ logs }: { logs: AdminData["auditLogs"] }) {
  if (!logs.length) {
    return <div className="empty">暂无审计日志</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>管理员</th>
            <th>动作</th>
            <th>对象</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 10).map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.adminName}</td>
              <td className="mono">{log.action}</td>
              <td className="mono">
                {log.objectType}:{log.objectId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeysTable({
  canOwn,
  canWrite,
  drafts,
  keys,
  onDraftChange,
  onSave
}: {
  canOwn: boolean;
  canWrite: boolean;
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
                  <input className="table-input" onChange={(event) => onDraftChange(key.id, { name: event.target.value })} value={draft.name} />
                </td>
                <td className="mono">{key.apiKeyPreview}</td>
                <td>
                  <input
                    className="table-input number"
                    disabled={!canOwn}
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
                  <button className="icon-button" disabled={!canWrite} onClick={() => onSave(key.id)} title="保存" type="button">
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
